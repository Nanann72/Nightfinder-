from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import json
import io
import logging
import uuid
import secrets
import asyncio
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Literal, Dict

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorGridFSBucket
from pydantic import BaseModel, Field, EmailStr
import httpx
from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout, CheckoutSessionRequest
)
from emails import send_welcome, send_payment_confirmation, send_new_message, send_password_reset, send_creator_sale, send_admin_broadcast

# -------- Config --------
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:3000')

# Trusted production origins for Stripe redirects. If a client sends an origin_url that does not
# match any of these (e.g. stale/mismatched REACT_APP_BACKEND_URL), we fall back to the request's
# Origin/Referer header or the canonical FRONTEND_URL env var. This prevents cross-origin broken
# redirects when the deployed frontend and preview pod share the same backend.
_TRUSTED_ORIGIN_HOSTS = {"meandyou.fans", "www.meandyou.fans", "fan-culture.preview.emergentagent.com", "localhost:3000"}


def _normalize_origin(origin_url: Optional[str], request: Optional[Request] = None) -> str:
    """Return a safe, canonical origin URL (no trailing slash) for Stripe success/cancel URLs.

    Priority:
      1. `origin_url` if its host is in the trusted list
      2. Request `Origin` or `Referer` headers if host is trusted
      3. `FRONTEND_URL` env var (canonical production URL)
    """
    from urllib.parse import urlparse

    def _host_of(u: str) -> Optional[str]:
        try:
            p = urlparse(u)
            return (p.netloc or "").lower() or None
        except Exception:
            return None

    def _trusted(u: Optional[str]) -> Optional[str]:
        if not u:
            return None
        host = _host_of(u)
        if host and host in _TRUSTED_ORIGIN_HOSTS:
            # Keep only scheme + host (drop path, query)
            p = urlparse(u)
            return f"{p.scheme or 'https'}://{p.netloc}".rstrip("/")
        return None

    candidates: List[Optional[str]] = [origin_url]
    if request is not None:
        try:
            candidates.append(request.headers.get("origin"))
            candidates.append(request.headers.get("referer"))
        except Exception:
            pass
    for c in candidates:
        ok = _trusted(c)
        if ok:
            return ok
    return FRONTEND_URL.rstrip("/")
STRIPE_API_KEY = os.environ.get('STRIPE_API_KEY', 'sk_test_emergent')
STRIPE_ELEMENTS_SECRET_KEY = os.environ.get('STRIPE_ELEMENTS_SECRET_KEY', '')
STRIPE_PUBLISHABLE_KEY = os.environ.get('STRIPE_PUBLISHABLE_KEY', '')
STRIPE_WEBHOOK_SECRET = os.environ.get('STRIPE_WEBHOOK_SECRET', '')
UPLOAD_DIR = ROOT_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
ALLOWED_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif", ".mp4", ".mov", ".webm",
                ".mp3", ".m4a", ".ogg", ".oga", ".wav", ".aac"}
MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024  # 2 GB (videos supported)

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]
media_bucket = AsyncIOMotorGridFSBucket(db, bucket_name="media")

app = FastAPI(title="me&you API")
api_router = APIRouter(prefix="/api")

# -------- Helpers --------
def now_utc():
    return datetime.now(timezone.utc)

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))

def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id, "email": email,
        "exp": now_utc() + timedelta(minutes=60 * 24),  # 24h for dev comfort
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": now_utc() + timedelta(days=7),
        "type": "refresh",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def set_auth_cookies(response: Response, access: str, refresh: str):
    response.set_cookie("access_token", access, httponly=True, secure=True,
                        samesite="none", max_age=60 * 60 * 24, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True,
                        samesite="none", max_age=60 * 60 * 24 * 7, path="/")

def clear_auth_cookies(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")

async def get_current_user(request: Request) -> dict:
    # Prefer the Authorization header over cookies. Browser cookies on
    # samesite="none" can be silently dropped after a cross-site Stripe
    # redirect (Safari ITP, Brave shields, Firefox strict). The frontend's
    # localStorage Bearer token survives that and is the source of truth.
    token = None
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
    if not token:
        token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Non authentifié")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Token invalide")
        user = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="Utilisateur introuvable")
        if user.get("banned"):
            raise HTTPException(status_code=403, detail="Compte suspendu")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expiré")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token invalide")

async def optional_current_user(request: Request) -> Optional[dict]:
    try:
        return await get_current_user(request)
    except HTTPException:
        return None

# -------- Models --------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1, max_length=60)
    is_creator: bool = False
    referral_code: Optional[str] = None
    newsletter_opt_in: bool = False

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class CreatorCreate(BaseModel):
    display_name: str
    handle: str
    bio: Optional[str] = ""
    subscription_price: float = 9.99
    cover_url: Optional[str] = None
    avatar_url: Optional[str] = None
    tags: List[str] = []

class CreatorUpdate(BaseModel):
    display_name: Optional[str] = None
    handle: Optional[str] = None
    bio: Optional[str] = None
    subscription_price: Optional[float] = None
    cover_url: Optional[str] = None
    avatar_url: Optional[str] = None
    tags: Optional[List[str]] = None
    external_url: Optional[str] = None
    # ── Stripchat-style profile fields ────────────────────────────────────
    languages: Optional[List[str]] = Field(default=None, max_length=10)
    body_type: Optional[str] = None     # athletic | curvy | slim | average | plus
    ethnicity: Optional[str] = None     # caucasian | latina | asian | african | middle_eastern | mixed
    hair_color: Optional[str] = None    # black | brown | blonde | red | other
    eye_color: Optional[str] = None     # brown | blue | green | hazel | grey
    sub_culture: Optional[str] = None   # casual | gamer | sporty | artsy | classic | alternative
    about_me: Optional[str] = Field(default=None, max_length=2000)
    interests: Optional[List[str]] = Field(default=None, max_length=20)
    # ── Live show pricing (coins per minute, except ticket which is per ticket)
    price_private_per_min: Optional[int] = Field(default=None, ge=0, le=2000)
    price_exclusive_per_min: Optional[int] = Field(default=None, ge=0, le=5000)
    price_spy_per_min: Optional[int] = Field(default=None, ge=0, le=2000)
    price_group_per_min: Optional[int] = Field(default=None, ge=0, le=2000)
    price_ticket_show: Optional[int] = Field(default=None, ge=0, le=10000)
    # ── Social links (free-form so frontend can render badges)
    social_instagram: Optional[str] = None
    social_twitter: Optional[str] = None
    social_tiktok: Optional[str] = None
    social_youtube: Optional[str] = None
    social_onlyfans: Optional[str] = None  # cross-platform link is fine for SFW

class BecomeCreatorIn(BaseModel):
    display_name: Optional[str] = None
    handle: Optional[str] = None
    terms_accepted: bool = False  # CGU + AUP — must be True (legal proof of consent)

class ForgotPasswordIn(BaseModel):
    email: EmailStr

class ResetPasswordIn(BaseModel):
    token: str = Field(min_length=16, max_length=200)
    new_password: str = Field(min_length=6, max_length=200)

class TipMenuItem(BaseModel):
    label: str = Field(min_length=1, max_length=60)
    emoji: Optional[str] = Field(default="✨", max_length=4)
    coins: int = Field(ge=1, le=10000)


class LiveStartIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    description: Optional[str] = ""
    is_ppv: bool = False
    ppv_coins: int = Field(default=0, ge=0, le=10000)
    # Tip goal (optional)
    goal_coins: int = Field(default=0, ge=0, le=100000)
    goal_description: Optional[str] = Field(default="", max_length=200)
    # Private mode (host can flip mid-stream too)
    private_mode: bool = False
    private_entry_coins: int = Field(default=0, ge=0, le=5000)
    # Tip menu — Stripchat-style quick-tip panel (max 12 entries)
    tip_menu: List[TipMenuItem] = Field(default_factory=list, max_length=12)


class LiveSettingsIn(BaseModel):
    """Partial update for an active live — host-only.
    Any field omitted keeps its current value."""
    goal_coins: Optional[int] = Field(default=None, ge=0, le=100000)
    goal_description: Optional[str] = Field(default=None, max_length=200)
    private_mode: Optional[bool] = None
    private_entry_coins: Optional[int] = Field(default=None, ge=0, le=5000)
    tip_menu: Optional[List[TipMenuItem]] = Field(default=None, max_length=12)

class LiveChatIn(BaseModel):
    body: str = Field(min_length=1, max_length=300)

class LiveTipIn(BaseModel):
    coins: int = Field(ge=1, le=10000)
    message: Optional[str] = ""

class BroadcastIn(BaseModel):
    body: str = Field(min_length=1, max_length=2000)
    media_url: Optional[str] = None
    media_paywall_coins: int = Field(default=0, ge=0, le=10000)

class SubscribeBundleIn(BaseModel):
    creator_id: str
    months: int = Field(default=1, ge=1, le=12)  # 1, 3, 6, 12

class SubscribeBundleStripeIn(BaseModel):
    creator_id: str
    months: int = Field(default=1, ge=1, le=12)
    origin_url: str

class PromotionIn(BaseModel):
    percent_off: int = Field(ge=5, le=90)
    duration_hours: int = Field(ge=1, le=168)  # max 7 days
    label: Optional[str] = ""

class CustomRequestIn(BaseModel):
    description: str = Field(min_length=5, max_length=500)
    price_coins: int = Field(ge=50, le=10000)

class CustomRequestRespondIn(BaseModel):
    action: str  # "accept" | "decline"
    reply_message: Optional[str] = ""

class CustomRequestDeliverIn(BaseModel):
    media_url: str
    media_type: str = "image"  # image | video
    caption: Optional[str] = ""

class PriorityMessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=2000)

class SiteConfigIn(BaseModel):
    hero_title: Optional[str] = None
    hero_subtitle: Optional[str] = None
    hero_cta: Optional[str] = None
    about_text: Optional[str] = None
    footer_tagline: Optional[str] = None
    categories: Optional[List[str]] = None
    contact_email: Optional[str] = None
    faq: Optional[List[dict]] = None  # [{"q": "...", "a": "..."}]

class ContentCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    media_url: str
    is_premium: bool = True
    unlock_price: float = 0.0
    included_in_subscription: bool = False  # If True: accessible for free to subscribers, no per-item unlock
    content_type: Optional[str] = "image"  # image | video
    scheduled_at: Optional[str] = None  # ISO datetime — publish only after this moment
    expires_in_hours: Optional[int] = None  # If set, content auto-expires after N hours (24h posts)

class MessageIn(BaseModel):
    creator_id: str
    body: str = ""
    fan_id: Optional[str] = None  # required when sender is the creator
    media_url: Optional[str] = None
    media_paywall_coins: int = Field(default=0, ge=0, le=10000)
    kind: Optional[str] = None  # "voice" for audio notes, default text/media
    voice_duration_seconds: Optional[int] = Field(default=None, ge=1, le=120)

class TipIn(BaseModel):
    creator_id: str
    coins: int
    message: Optional[str] = ""

class SubscribeIn(BaseModel):
    creator_id: str

class UnlockIn(BaseModel):
    content_id: str

class BuyPackIn(BaseModel):
    pack_id: str
    origin_url: str

class PayoutIn(BaseModel):
    coins: int

class CardIn(BaseModel):
    brand: Optional[str] = "Visa"   # simulated
    last4: str
    exp_month: int
    exp_year: int
    holder_name: Optional[str] = ""

class ConfirmCardIn(BaseModel):
    payment_method_id: str

class AutoReloadIn(BaseModel):
    enabled: bool
    threshold: int = 50
    pack_id: str = "popular"

class BankAccountIn(BaseModel):
    iban: str
    bic: Optional[str] = ""
    holder_name: str
    country: Optional[str] = "FR"

class UserUpdateIn(BaseModel):
    role: Optional[str] = None       # fan | creator | admin
    age_verified: Optional[bool] = None
    banned: Optional[bool] = None


class UserSelfUpdateIn(BaseModel):
    """Fan-side profile editor. `username` can ONLY be changed once per
    account — server enforces by checking `users.username_changed`."""
    username: Optional[str] = Field(default=None, min_length=3, max_length=24, pattern=r"^[a-zA-Z0-9_\.]+$")
    name: Optional[str] = Field(default=None, max_length=80)
    avatar_url: Optional[str] = None
    bio: Optional[str] = Field(default=None, max_length=500)
    email_notifications_enabled: Optional[bool] = None


@api_router.patch("/users/me")
async def update_me(payload: UserSelfUpdateIn, user: dict = Depends(get_current_user)):
    """Self-service profile update. The username is one-shot — we keep
    `username_changed` so the UI can grey out the field afterwards."""
    me = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0}) or {}
    updates: dict = {}
    if payload.username is not None:
        new_uname = payload.username.strip().lstrip("@")
        if me.get("username_changed"):
            raise HTTPException(status_code=400, detail="Tu as déjà modifié ton nom d'utilisateur. Ce changement n'est possible qu'une seule fois.")
        if new_uname != (me.get("username") or ""):
            existing = await db.users.find_one({"username": new_uname, "user_id": {"$ne": user["user_id"]}}, {"_id": 0, "user_id": 1})
            if existing:
                raise HTTPException(status_code=400, detail="Ce nom d'utilisateur est déjà pris")
            updates["username"] = new_uname
            updates["username_changed"] = True
            updates["username_changed_at"] = now_utc().isoformat()
    if payload.name is not None:
        updates["name"] = payload.name.strip()
    if payload.avatar_url is not None:
        updates["avatar_url"] = payload.avatar_url
    if payload.bio is not None:
        updates["bio"] = payload.bio
    if payload.email_notifications_enabled is not None:
        updates["email_notifications_enabled"] = bool(payload.email_notifications_enabled)
    if updates:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": updates})
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    return fresh


class PasswordChangeIn(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=6, max_length=128)


@api_router.patch("/users/me/password")
async def change_my_password(payload: PasswordChangeIn, user: dict = Depends(get_current_user)):
    me = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not me or not me.get("password_hash"):
        raise HTTPException(status_code=400, detail="Compte sans mot de passe (utilise Google sign-in).")
    if not verify_password(payload.current_password, me["password_hash"]):
        raise HTTPException(status_code=400, detail="Mot de passe actuel incorrect.")
    if payload.new_password == payload.current_password:
        raise HTTPException(status_code=400, detail="Le nouveau mot de passe doit être différent.")
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"password_hash": hash_password(payload.new_password),
                  "password_changed_at": now_utc().isoformat()}},
    )
    return {"ok": True}


@api_router.delete("/users/me")
async def delete_my_account(user: dict = Depends(get_current_user)):
    """Soft-delete: ban the account so it can't log in. Hard purge runs nightly."""
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"banned": True, "deleted_at": now_utc().isoformat(),
                  "delete_requested": True, "email_notifications_enabled": False}},
    )
    # Cancel active subscriptions
    await db.subscriptions.update_many(
        {"user_id": user["user_id"], "status": "active"},
        {"$set": {"status": "cancelled", "auto_renew": False, "cancelled_at": now_utc().isoformat()}},
    )
    return {"ok": True}


# ============================================================================
# 2FA — TOTP (RFC 6238)
# ============================================================================
import pyotp as _pyotp


class TwoFASetupVerifyIn(BaseModel):
    code: str = Field(..., min_length=6, max_length=8)


class TwoFADisableIn(BaseModel):
    password: str = Field(..., min_length=1)


@api_router.post("/users/me/2fa/setup")
async def two_fa_setup(user: dict = Depends(get_current_user)):
    """Generate a fresh provisional secret + provisioning URI for QR display.
    The secret is stored as `pending_2fa_secret` until the user confirms with a code."""
    me = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if me and me.get("two_fa_enabled"):
        raise HTTPException(status_code=400, detail="2FA déjà activée. Désactive d'abord pour reconfigurer.")
    secret = _pyotp.random_base32()
    issuer = "me&you.fans"
    label = me["email"] if me else "user"
    uri = _pyotp.totp.TOTP(secret).provisioning_uri(name=label, issuer_name=issuer)
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"pending_2fa_secret": secret, "pending_2fa_at": now_utc().isoformat()}},
    )
    return {"secret": secret, "otpauth_uri": uri, "issuer": issuer, "label": label}


@api_router.post("/users/me/2fa/verify")
async def two_fa_verify(payload: TwoFASetupVerifyIn, user: dict = Depends(get_current_user)):
    """Verify the 6-digit TOTP code and activate 2FA. Generates 8 backup codes."""
    me = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    secret = (me or {}).get("pending_2fa_secret")
    if not secret:
        raise HTTPException(status_code=400, detail="Lance d'abord la configuration 2FA.")
    totp = _pyotp.TOTP(secret)
    if not totp.verify(payload.code.strip(), valid_window=1):
        raise HTTPException(status_code=400, detail="Code incorrect ou expiré. Réessaie.")
    # Generate one-time backup codes (10 chars each, hashed)
    raw_backups = [_pyotp.random_base32()[:10] for _ in range(8)]
    hashed_backups = [hash_password(b) for b in raw_backups]
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {
            "two_fa_enabled": True,
            "two_fa_secret": secret,
            "two_fa_enabled_at": now_utc().isoformat(),
            "two_fa_backup_codes": hashed_backups,
        }, "$unset": {"pending_2fa_secret": "", "pending_2fa_at": ""}},
    )
    return {"ok": True, "backup_codes": raw_backups}


@api_router.post("/users/me/2fa/disable")
async def two_fa_disable(payload: TwoFADisableIn, user: dict = Depends(get_current_user)):
    me = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not me or not me.get("password_hash"):
        raise HTTPException(status_code=400, detail="Compte sans mot de passe.")
    if not verify_password(payload.password, me["password_hash"]):
        raise HTTPException(status_code=400, detail="Mot de passe incorrect.")
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$unset": {"two_fa_secret": "", "two_fa_backup_codes": "",
                    "pending_2fa_secret": "", "pending_2fa_at": "",
                    "two_fa_enabled_at": ""},
         "$set": {"two_fa_enabled": False}},
    )
    return {"ok": True}


@api_router.get("/users/me/2fa/status")
async def two_fa_status(user: dict = Depends(get_current_user)):
    me = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return {
        "enabled": bool((me or {}).get("two_fa_enabled")),
        "enabled_at": (me or {}).get("two_fa_enabled_at"),
        "backup_codes_remaining": len((me or {}).get("two_fa_backup_codes") or []),
    }




# ============================================================================
# DMCA TAKEDOWN
# ============================================================================
class DMCAReportIn(BaseModel):
    claimant_name: str = Field(..., min_length=2, max_length=120)
    claimant_email: EmailStr
    claimant_company: Optional[str] = Field(None, max_length=120)
    claimant_role: Optional[str] = Field(None, max_length=80)  # e.g. "agent", "lawyer", "self"
    target_url: str = Field(..., min_length=4, max_length=500)
    target_creator: Optional[str] = Field(None, max_length=80)
    description: str = Field(..., min_length=10, max_length=4000)
    original_work_url: Optional[str] = Field(None, max_length=500)
    sworn_statement: bool
    accept_perjury: bool


@api_router.post("/dmca/submit")
async def dmca_submit(payload: DMCAReportIn, request: Request):
    if not (payload.sworn_statement and payload.accept_perjury):
        raise HTTPException(status_code=400, detail="Tu dois accepter les déclarations sous serment.")
    rep = {
        "report_id": str(uuid.uuid4()),
        "status": "pending",  # pending | in_review | approved | rejected
        "claimant_name": payload.claimant_name.strip(),
        "claimant_email": payload.claimant_email,
        "claimant_company": (payload.claimant_company or "").strip() or None,
        "claimant_role": payload.claimant_role,
        "target_url": payload.target_url.strip(),
        "target_creator": (payload.target_creator or "").strip() or None,
        "description": payload.description.strip(),
        "original_work_url": (payload.original_work_url or "").strip() or None,
        "ip_address": request.client.host if request.client else None,
        "user_agent": request.headers.get("user-agent", "")[:300],
        "created_at": now_utc().isoformat(),
        "updated_at": now_utc().isoformat(),
        "admin_notes": None,
        "resolved_at": None,
    }
    await db.dmca_reports.insert_one(rep)
    rep.pop("_id", None)
    # Notify admin (best-effort, ignore failures)
    try:
        from emails import send_admin_broadcast
        await send_admin_broadcast(
            to=os.environ.get("ADMIN_EMAIL", "admin@meandyou.fans"),
            subject=f"[DMCA] Nouveau signalement {rep['report_id'][:8]}",
            body_html=(
                f"<p><strong>{payload.claimant_name}</strong> ({payload.claimant_email}) "
                f"a déposé un signalement DMCA.</p>"
                f"<p><strong>URL ciblée :</strong> {payload.target_url}</p>"
                f"<p><strong>Description :</strong> {payload.description[:500]}</p>"
                f"<p>Voir : /admin/dmca</p>"
            ),
        )
    except Exception:
        pass
    return {"ok": True, "report_id": rep["report_id"]}


@api_router.get("/admin/dmca")
async def admin_dmca_list(status: Optional[str] = None, admin: dict = Depends(get_current_user)):
    if admin.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only.")
    q = {}
    if status:
        q["status"] = status
    rows = await db.dmca_reports.find(q, {"_id": 0}).sort("created_at", -1).to_list(length=500)
    counts_pipeline = [{"$group": {"_id": "$status", "n": {"$sum": 1}}}]
    counts_raw = await db.dmca_reports.aggregate(counts_pipeline).to_list(length=10)
    counts = {c["_id"]: c["n"] for c in counts_raw}
    return {"items": rows, "counts": counts, "total": sum(counts.values())}


class DMCAUpdateIn(BaseModel):
    status: Optional[str] = Field(None, pattern="^(pending|in_review|approved|rejected)$")
    admin_notes: Optional[str] = Field(None, max_length=2000)


@api_router.patch("/admin/dmca/{report_id}")
async def admin_dmca_update(report_id: str, payload: DMCAUpdateIn, admin: dict = Depends(get_current_user)):
    if admin.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only.")
    rep = await db.dmca_reports.find_one({"report_id": report_id})
    if not rep:
        raise HTTPException(status_code=404, detail="Signalement introuvable.")
    update = {"updated_at": now_utc().isoformat()}
    if payload.status:
        update["status"] = payload.status
        if payload.status in ("approved", "rejected"):
            update["resolved_at"] = now_utc().isoformat()
            update["resolved_by"] = admin["user_id"]
    if payload.admin_notes is not None:
        update["admin_notes"] = payload.admin_notes.strip() or None
    await db.dmca_reports.update_one({"report_id": report_id}, {"$set": update})
    # Notify claimant if resolved
    if payload.status in ("approved", "rejected"):
        try:
            from emails import send_admin_broadcast
            verb = "approuvé" if payload.status == "approved" else "rejeté"
            await send_admin_broadcast(
                to=rep["claimant_email"],
                subject=f"[DMCA] Ton signalement a été {verb}",
                body_html=(
                    f"<p>Bonjour {rep['claimant_name']},</p>"
                    f"<p>Ton signalement DMCA <code>{report_id[:8]}</code> a été <strong>{verb}</strong>.</p>"
                    + (f"<p>Notes : {payload.admin_notes}</p>" if payload.admin_notes else "")
                    + "<p>— Équipe me&you.fans</p>"
                ),
            )
        except Exception:
            pass
    return {"ok": True}






@api_router.get("/users/me/subscriptions")
async def my_subscriptions(user: dict = Depends(get_current_user)):
    """Fan-facing — full list of active subscriptions with creator profile data."""
    rows = await db.subscriptions.find(
        {"user_id": user["user_id"], "status": "active"}, {"_id": 0},
    ).sort("created_at", -1).to_list(length=200)
    out = []
    for r in rows:
        c = await db.creators.find_one(
            {"creator_id": r.get("creator_id")},
            {"_id": 0, "creator_id": 1, "display_name": 1, "handle": 1,
             "avatar_url": 1, "cover_url": 1, "subscription_price": 1, "verified": 1},
        ) or {}
        out.append({
            "subscription_id": r.get("subscription_id") or r.get("sub_id"),
            "creator_id": r.get("creator_id"),
            "since": r.get("created_at"),
            "renew_at": r.get("renew_at"),
            "auto_renew": bool(r.get("auto_renew")),
            "creator": {
                "creator_id": c.get("creator_id"),
                "display_name": c.get("display_name") or "Créatrice",
                "handle": c.get("handle"),
                "avatar_url": c.get("avatar_url"),
                "cover_url": c.get("cover_url"),
                "subscription_price": c.get("subscription_price"),
                "verified": bool(c.get("verified")),
            },
        })
    return out


@api_router.delete("/subscriptions/{creator_id}")
async def unsubscribe_immediately(creator_id: str, user: dict = Depends(get_current_user)):
    """Hard-cancel an active subscription. The previous handler at L5691 only
    disables auto-renew; this one is the explicit "unsubscribe now" button
    used by the new /account → /subscriptions UI."""
    res = await db.subscriptions.update_one(
        {"user_id": user["user_id"], "creator_id": creator_id, "status": "active"},
        {"$set": {"status": "cancelled", "cancelled_at": now_utc().isoformat(), "auto_renew": False}},
    )
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Abonnement introuvable")
    await db.creators.update_one(
        {"creator_id": creator_id}, {"$inc": {"subscribers_count": -1}},
    )
    return {"ok": True}

class FlagIn(BaseModel):
    reason: Optional[str] = ""

# Coin economy constants
COIN_EUR_RATE = 0.10          # 1 coin = 0.10 €
COINS_PER_EUR = 10            # derived
CREATOR_PAYOUT_RATIO = 0.80   # creator keeps 80 %
PAYOUT_MIN_COINS = 500        # minimum coins to request payout

COIN_PACKS = {
    "starter": {"pack_id": "starter", "name": "Starter", "coins": 50,   "bonus": 0,   "eur": 5.00},
    "popular": {"pack_id": "popular", "name": "Popular", "coins": 200,  "bonus": 20,  "eur": 20.00},
    "premium": {"pack_id": "premium", "name": "Premium", "coins": 500,  "bonus": 75,  "eur": 50.00},
    "vip":     {"pack_id": "vip",     "name": "VIP",     "coins": 1200, "bonus": 250, "eur": 100.00},
}

def eur_to_coins(eur: float) -> int:
    return int(round(eur * COINS_PER_EUR))

def coins_to_eur(coins: int) -> float:
    return round(coins * COIN_EUR_RATE, 2)

# -------- Auth routes --------
@api_router.post("/auth/register")
async def register(payload: RegisterIn, response: Response, background: BackgroundTasks):
    email = payload.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Cet email est déjà utilisé")
    user_id = f"user_{uuid.uuid4().hex[:12]}"

    # Handle referral
    referred_by = None
    if payload.referral_code:
        code = payload.referral_code.strip().upper()
        referrer = await db.users.find_one({"referral_code": code}, {"_id": 0, "user_id": 1})
        if referrer and referrer["user_id"] != user_id:
            referred_by = referrer["user_id"]

    # Generate unique referral code for new user
    new_code = _generate_referral_code()
    for _ in range(12):
        if not await db.users.find_one({"referral_code": new_code}):
            break
        new_code = _generate_referral_code()

    user_doc = {
        "user_id": user_id,
        "email": email,
        "name": payload.name,
        "password_hash": hash_password(payload.password),
        "role": "creator" if payload.is_creator else "fan",
        "age_verified": False,
        "avatar_url": None,
        "provider": "local",
        "referral_code": new_code,
        "referred_by": referred_by,
        "referral_bonus_granted": False,
        "newsletter_opt_in": bool(payload.newsletter_opt_in),
        "created_at": now_utc().isoformat(),
    }
    await db.users.insert_one(user_doc)

    # If creator, also create a creator profile shell
    if payload.is_creator:
        await db.creators.insert_one({
            "creator_id": user_id,
            "user_id": user_id,
            "display_name": payload.name,
            "handle": email.split("@")[0],
            "bio": "",
            "subscription_price": 9.99,
            "avatar_url": None,
            "cover_url": None,
            "tags": [],
            "total_earned": 0.0,
            "subscribers_count": 0,
            "created_at": now_utc().isoformat(),
        })

    access = create_access_token(user_id, email)
    refresh = create_refresh_token(user_id)
    set_auth_cookies(response, access, refresh)
    user_doc.pop("password_hash", None)
    user_doc.pop("_id", None)  # Remove MongoDB _id

    # Welcome email + in-app notification
    background.add_task(send_welcome, to=email, name=payload.name, frontend_url=FRONTEND_URL)
    await _create_notification(user_id, "welcome",
                               "Bienvenue sur me&you ✨",
                               "Découvre les créatrices et abonne-toi à celles qui t'inspirent.",
                               {})
    return {"user": user_doc, "access_token": access, "refresh_token": refresh}

@api_router.post("/auth/login")
async def login(payload: LoginIn, response: Response, request: Request):
    email = payload.email.lower()
    ip = request.client.host if request.client else "?"
    identifier = f"{ip}:{email}"

    lock = await db.login_attempts.find_one({"identifier": identifier})
    if lock and lock.get("count", 0) >= 5:
        locked_until = lock.get("locked_until")
        if locked_until:
            lu = datetime.fromisoformat(locked_until)
            if lu.tzinfo is None:
                lu = lu.replace(tzinfo=timezone.utc)
            if lu > now_utc():
                raise HTTPException(status_code=429, detail="Trop de tentatives. Réessayez dans 15 min.")

    user = await db.users.find_one({"email": email})
    if not user or not user.get("password_hash") or not verify_password(payload.password, user["password_hash"]):
        await db.login_attempts.update_one(
            {"identifier": identifier},
            {"$inc": {"count": 1},
             "$set": {"locked_until": (now_utc() + timedelta(minutes=15)).isoformat()}},
            upsert=True,
        )
        raise HTTPException(status_code=401, detail="Email ou mot de passe invalide")

    await db.login_attempts.delete_one({"identifier": identifier})
    access = create_access_token(user["user_id"], email)
    refresh = create_refresh_token(user["user_id"])
    set_auth_cookies(response, access, refresh)
    user.pop("_id", None)
    user.pop("password_hash", None)
    return {"user": user, "access_token": access, "refresh_token": refresh}

@api_router.post("/auth/logout")
async def logout(response: Response):
    clear_auth_cookies(response)
    return {"ok": True}


class RefreshIn(BaseModel):
    """Optional body — fallback for clients that have the refresh token in
    localStorage instead of a cookie (e.g. browsers blocking 3rd-party cookies)."""
    refresh_token: Optional[str] = None


@api_router.post("/auth/refresh")
async def refresh_access_token(payload: RefreshIn, request: Request, response: Response):
    """Mint a fresh 24 h access token using a still-valid refresh token.
    Accepts the refresh token via either the `refresh_token` cookie OR a body
    parameter so the SPA can recover from cookies that get blocked after a
    cross-site Stripe redirect (Safari ITP / Brave shields)."""
    token = request.cookies.get("refresh_token") or (payload.refresh_token or "")
    if not token:
        # As a last resort, accept a still-valid access token. This lets us
        # silently slide the cookie back to life right after a Stripe return
        # without forcing the user to re-login.
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Pas de refresh token")
    try:
        decoded = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh expiré")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token invalide")
    user_id = decoded.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token invalide")
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    if not u or u.get("banned"):
        raise HTTPException(status_code=401, detail="Compte indisponible")
    new_access = create_access_token(user_id, u["email"])
    new_refresh = create_refresh_token(user_id)
    set_auth_cookies(response, new_access, new_refresh)
    return {"user": u, "access_token": new_access, "refresh_token": new_refresh}


# -------- Forgot / Reset password --------
def _hash_token(plain: str) -> str:
    import hashlib
    return hashlib.sha256(plain.encode("utf-8")).hexdigest()

@api_router.post("/auth/forgot-password")
async def forgot_password(payload: ForgotPasswordIn, background: BackgroundTasks):
    """Always returns success (prevents email enumeration). Sends email only if user exists."""
    email = payload.email.lower()
    user = await db.users.find_one({"email": email}, {"_id": 0, "user_id": 1, "name": 1, "email": 1})
    if user:
        # Invalidate previous pending tokens for this user (one active link at a time)
        await db.password_reset_tokens.update_many(
            {"user_id": user["user_id"], "used": False},
            {"$set": {"used": True, "invalidated_at": now_utc().isoformat()}},
        )
        plain = secrets.token_urlsafe(32)
        token_hash = _hash_token(plain)
        expires_at = now_utc() + timedelta(hours=1)
        await db.password_reset_tokens.insert_one({
            "token_hash": token_hash,
            "user_id": user["user_id"],
            "email": user["email"],
            "expires_at": expires_at,  # real datetime so TTL index works
            "used": False,
            "created_at": now_utc().isoformat(),
        })
        reset_url = f"{FRONTEND_URL}/reset-password?token={plain}"
        background.add_task(
            send_password_reset,
            to=user["email"],
            name=user.get("name") or "toi",
            reset_url=reset_url,
        )
        logger.info("password reset requested for %s", email)
    else:
        logger.info("password reset requested for unknown email %s", email)
    return {"ok": True, "message": "Si un compte existe pour cet email, un lien de réinitialisation a été envoyé."}

@api_router.post("/auth/reset-password")
async def reset_password(payload: ResetPasswordIn):
    token_hash = _hash_token(payload.token)
    record = await db.password_reset_tokens.find_one({"token_hash": token_hash}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=400, detail="Lien de réinitialisation invalide ou déjà utilisé")
    if record.get("used"):
        raise HTTPException(status_code=400, detail="Ce lien a déjà été utilisé")
    expires_at = record.get("expires_at")
    if isinstance(expires_at, str):
        try:
            expires_at = datetime.fromisoformat(expires_at)
        except Exception:
            expires_at = None
    if isinstance(expires_at, datetime) and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if not expires_at or expires_at < now_utc():
        raise HTTPException(status_code=400, detail="Ce lien a expiré. Demande-en un nouveau.")
    user = await db.users.find_one({"user_id": record["user_id"]}, {"_id": 0, "user_id": 1, "email": 1})
    if not user:
        raise HTTPException(status_code=400, detail="Utilisateur introuvable")
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"password_hash": hash_password(payload.new_password), "password_reset_at": now_utc().isoformat()}},
    )
    await db.password_reset_tokens.update_one(
        {"token_hash": token_hash},
        {"$set": {"used": True, "used_at": now_utc().isoformat()}},
    )
    await db.login_attempts.delete_many({"identifier": {"$regex": f".*:{user['email']}$"}})
    return {"ok": True, "message": "Mot de passe mis à jour. Tu peux te connecter."}


# -------- LIVE (LiveKit-ready, demo mode fallback) --------
LIVEKIT_URL = os.environ.get("LIVEKIT_URL", "").strip()
LIVEKIT_API_KEY = os.environ.get("LIVEKIT_API_KEY", "").strip()
LIVEKIT_API_SECRET = os.environ.get("LIVEKIT_API_SECRET", "").strip()
LIVEKIT_ENABLED = bool(LIVEKIT_URL and LIVEKIT_API_KEY and LIVEKIT_API_SECRET)

def _lk_create_token(room: str, identity: str, name: str, can_publish: bool) -> Optional[str]:
    if not LIVEKIT_ENABLED:
        return None
    try:
        from livekit import api as lk_api
        token = (lk_api.AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
                 .with_identity(identity)
                 .with_name(name)
                 .with_grants(lk_api.VideoGrants(
                     room_join=True,
                     room=room,
                     can_publish=can_publish,
                     can_publish_data=True,
                     can_subscribe=True,
                 ))
                 .with_ttl(timedelta(hours=2)))
        return token.to_jwt()
    except Exception as e:
        logger.exception("LiveKit token error: %s", e)
        return None

@api_router.get("/live/config")
async def live_config():
    return {"enabled": LIVEKIT_ENABLED, "url": LIVEKIT_URL if LIVEKIT_ENABLED else None}


# -------- External CAMS (public widget feed, cached) --------
CAMS_CACHE: dict = {}
CAMS_CACHE_TTL_SECONDS = 25
CAMS_SOURCE_URL = "https://go.stripchat.com/api/models"
_CAMS_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0"

import base64 as _b64
from fastapi.responses import PlainTextResponse

def _b64url_enc(s: str) -> str:
    return _b64.urlsafe_b64encode(s.encode("utf-8")).decode("ascii").rstrip("=")

def _b64url_dec(s: str) -> str:
    padding = "=" * (-len(s) % 4)
    return _b64.urlsafe_b64decode((s + padding).encode("ascii")).decode("utf-8")

def _proxy_hls(u: Optional[str]) -> Optional[str]:
    if not u:
        return None
    return f"/api/hls/{_b64url_enc(u)}"

def _cam_card(m: dict) -> dict:
    """Sanitize raw model dict to only what the frontend needs."""
    stream = m.get("stream") or {}
    urls = stream.get("urls") or {}
    master = urls.get("480p") or urls.get("original") or urls.get("240p") or stream.get("url")
    low = urls.get("240p") or urls.get("160p")
    return {
        "model_id": m.get("id"),
        "username": m.get("username"),
        "thumb": m.get("widgetPreviewUrl") or m.get("snapshotUrl") or m.get("popularSnapshotUrl"),
        "preview_thumb": m.get("previewUrlThumbBig") or m.get("previewUrlThumbSmall"),
        "avatar": m.get("avatarUrl"),
        "country": m.get("modelsCountry"),
        "gender": m.get("broadcastGender") or m.get("gender"),
        "viewers": int(m.get("viewersCount") or 0),
        "is_hd": bool(m.get("broadcastHD")),
        "is_vr": bool(m.get("broadcastVR")),
        "languages": m.get("languages") or [],
        "hls": _proxy_hls(master),
        "hls_low": _proxy_hls(low),
        "status": m.get("status"),
    }

@api_router.get("/cams")
async def cams_list(
    limit: int = 24,
    gender: Optional[str] = None,  # girls | couples | trans | men
    primaryTag: Optional[str] = None,
    country: Optional[str] = None,
    sort: Optional[str] = "popular",  # popular | new | top | trending
    user: Optional[dict] = Depends(optional_current_user),
):
    limit = max(1, min(int(limit or 24), 60))
    sort = (sort or "popular").lower()
    if sort not in {"popular", "new", "top", "trending"}:
        sort = "popular"
    cache_key = f"{limit}:{gender or ''}:{primaryTag or ''}:{country or ''}:{sort}"
    cached = CAMS_CACHE.get(cache_key)
    now_ts = datetime.now(timezone.utc).timestamp()
    if cached and now_ts - cached["at"] < CAMS_CACHE_TTL_SECONDS:
        data = dict(cached["data"])
    else:
        params = {"limit": limit, "sort": sort}
        if gender:
            params["primaryTag"] = gender
        elif primaryTag:
            params["primaryTag"] = primaryTag
        if country:
            params["country"] = country

        try:
            async with httpx.AsyncClient(timeout=7.0, follow_redirects=True) as client:
                r = await client.get(CAMS_SOURCE_URL, params=params,
                                     headers={"User-Agent": _CAMS_UA, "Accept": "application/json"})
                if r.status_code != 200:
                    raise HTTPException(status_code=502, detail="Flux cams indisponible")
                raw = r.json()
        except httpx.HTTPError as e:
            logger.warning("cams fetch failed: %s", e)
            if cached:
                data = dict(cached["data"])
            else:
                raise HTTPException(status_code=502, detail="Flux cams indisponible")
        else:
            models = raw.get("models") or []
            items = [_cam_card(m) for m in models if m.get("username") and m.get("stream")]
            data = {"total": int(raw.get("total") or len(items)), "count": len(items), "items": items, "sort": sort}
            CAMS_CACHE[cache_key] = {"at": now_ts, "data": data}

    # Annotate `is_favorite` for the requesting user
    if user and data.get("items"):
        fav_usernames = await db.cam_favorites.find(
            {"user_id": user["user_id"]}, {"_id": 0, "username": 1}
        ).to_list(length=500)
        fav_set = {f["username"].lower() for f in fav_usernames}
        data = {**data, "items": [{**it, "is_favorite": it["username"].lower() in fav_set} for it in data["items"]]}
    return data

@api_router.get("/cams/favorites")
async def cams_favorites(user: dict = Depends(get_current_user)):
    """Return the user's favorite cams. Live data merged from current cached/fresh feed."""
    favs = await db.cam_favorites.find(
        {"user_id": user["user_id"]}, {"_id": 0, "username": 1, "created_at": 1}
    ).sort("created_at", -1).to_list(length=200)
    usernames = {f["username"].lower() for f in favs}
    if not usernames:
        return {"count": 0, "items": []}

    # Scan cache first
    seen = {}
    for entry in CAMS_CACHE.values():
        for it in entry["data"].get("items", []):
            u = it.get("username", "").lower()
            if u in usernames and u not in seen:
                seen[u] = {**it, "is_favorite": True}

    # Any missing favorite → mark as offline (still return placeholder)
    for f in favs:
        u = f["username"].lower()
        if u not in seen:
            seen[u] = {
                "model_id": None,
                "username": f["username"],
                "thumb": None, "preview_thumb": None, "avatar": None,
                "country": None, "gender": None, "viewers": 0,
                "is_hd": False, "is_vr": False, "languages": [],
                "hls": None, "hls_low": None,
                "status": "offline",
                "is_favorite": True,
                "favorited_at": f.get("created_at"),
            }
    ordered = sorted(seen.values(),
                     key=lambda x: (0 if x.get("status") != "offline" else 1, -(x.get("viewers") or 0)))
    return {"count": len(ordered), "items": ordered}

@api_router.post("/cams/favorites/{username}")
async def cams_favorite_add(username: str, user: dict = Depends(get_current_user)):
    username = username.strip().lower()
    if not username or len(username) > 80:
        raise HTTPException(status_code=400, detail="Username invalide")
    await db.cam_favorites.update_one(
        {"user_id": user["user_id"], "username": username},
        {"$setOnInsert": {"user_id": user["user_id"], "username": username,
                          "created_at": now_utc().isoformat()}},
        upsert=True,
    )
    count = await db.cam_favorites.count_documents({"user_id": user["user_id"]})
    return {"ok": True, "is_favorite": True, "count": count}

@api_router.delete("/cams/favorites/{username}")
async def cams_favorite_remove(username: str, user: dict = Depends(get_current_user)):
    await db.cam_favorites.delete_one({"user_id": user["user_id"], "username": username.lower()})
    count = await db.cam_favorites.count_documents({"user_id": user["user_id"]})
    return {"ok": True, "is_favorite": False, "count": count}

@api_router.get("/cams/{username}")
async def cams_get(username: str, user: Optional[dict] = Depends(optional_current_user)):
    async def _with_fav(it: dict) -> dict:
        if not user:
            return it
        fav = await db.cam_favorites.find_one({"user_id": user["user_id"], "username": username.lower()})
        return {**it, "is_favorite": bool(fav)}

    # Try the cached list first
    for entry in CAMS_CACHE.values():
        for it in entry["data"].get("items", []):
            if it.get("username", "").lower() == username.lower():
                return await _with_fav(it)
    try:
        async with httpx.AsyncClient(timeout=7.0, follow_redirects=True) as client:
            r = await client.get(CAMS_SOURCE_URL, params={"limit": 60, "username": username},
                                 headers={"User-Agent": _CAMS_UA, "Accept": "application/json"})
            raw = r.json()
            for m in (raw.get("models") or []):
                if m.get("username", "").lower() == username.lower():
                    return await _with_fav(_cam_card(m))
    except httpx.HTTPError:
        pass
    raise HTTPException(status_code=404, detail="Cam hors-ligne ou introuvable")


# -------- HLS proxy for external cams (avoids referrer/CORS browser blocks) --------
_ALLOWED_HLS_HOSTS = {
    "edge-hls.saawsedge.com",
    "media-hls.saawsedge.com",
    "b-hls-01.strpst.com",
    "b-hls-02.strpst.com",
    "b-hls-03.strpst.com",
    "b-hls-04.strpst.com",
    "b-hls-05.strpst.com",
    "b-hls-06.strpst.com",
    "b-hls-07.strpst.com",
    "b-hls-08.strpst.com",
    "b-hls-09.strpst.com",
    "b-hls-10.strpst.com",
    "b-hls-11.strpst.com",
    "b-hls-12.strpst.com",
    "cdn-hls.strpst.com",
}

def _is_allowed_hls(u: str) -> bool:
    from urllib.parse import urlparse
    try:
        host = urlparse(u).hostname or ""
    except Exception:
        return False
    return host in _ALLOWED_HLS_HOSTS

@api_router.get("/hls/{b64url:path}")
async def hls_proxy(b64url: str, request: Request):
    """Transparent HLS proxy: fetches upstream manifests/segments with proper headers,
    rewrites m3u8 segment URIs to go through this proxy. Keeps the browser same-origin.
    """
    try:
        target = _b64url_dec(b64url)
    except Exception:
        raise HTTPException(status_code=400, detail="URL invalide")
    if not _is_allowed_hls(target):
        raise HTTPException(status_code=403, detail="Host non autorisé")

    headers = {
        "User-Agent": _CAMS_UA,
        "Referer": "https://stripchat.com/",
        "Origin": "https://stripchat.com",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            r = await client.get(target, headers=headers)
    except httpx.HTTPError as e:
        logger.warning("hls proxy fetch error: %s", e)
        raise HTTPException(status_code=502, detail="Flux indisponible")
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Upstream {r.status_code}")

    content_type = r.headers.get("content-type", "").lower()
    is_m3u8 = "mpegurl" in content_type or target.split("?")[0].endswith(".m3u8")
    if is_m3u8:
        body = r.text
        from urllib.parse import urljoin
        import re as _re
        def _rewrite_uri_attr(match):
            inner = match.group(2)
            if inner.startswith(("http://", "https://", "/")):
                abs_url = urljoin(target, inner)
            else:
                abs_url = urljoin(target, inner)
            return f'{match.group(1)}URI="/api/hls/{_b64url_enc(abs_url)}"'
        # Rewrite URI="..." attributes inside tags (e.g. EXT-X-MAP, EXT-X-KEY, EXT-X-MEDIA)
        body = _re.sub(r'(#EXT-X-[^\s]+?[:,]?[^\n]*?)URI="([^"]+)"', _rewrite_uri_attr, body)
        # Rewrite bare URIs (segment lines + sub-manifest references)
        out_lines = []
        for line in body.splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                out_lines.append(line)
                continue
            if stripped.startswith("/api/hls/"):
                out_lines.append(line)
                continue
            abs_url = urljoin(target, stripped)
            out_lines.append(f"/api/hls/{_b64url_enc(abs_url)}")
        rewritten = "\n".join(out_lines) + "\n"
        return PlainTextResponse(rewritten, media_type="application/vnd.apple.mpegurl",
                                 headers={"Cache-Control": "no-store",
                                          "Access-Control-Allow-Origin": "*"})
    # Binary segment (ts/m4s/aac/etc.)
    seg_ct = r.headers.get("content-type") or "video/MP2T"
    return Response(content=r.content, media_type=seg_ct,
                    headers={"Cache-Control": "public, max-age=4",
                             "Access-Control-Allow-Origin": "*"})

@api_router.post("/live/start")
async def live_start(payload: LiveStartIn, user: dict = Depends(get_current_user)):
    creator = await db.creators.find_one({"creator_id": user["user_id"]}, {"_id": 0})
    if not creator:
        raise HTTPException(status_code=403, detail="Seules les créatrices peuvent lancer un live")
    # Stop previous active live
    await db.live_sessions.update_many(
        {"creator_id": user["user_id"], "status": "live"},
        {"$set": {"status": "ended", "ended_at": now_utc().isoformat()}},
    )
    session_id = f"live_{uuid.uuid4().hex[:12]}"
    room = session_id
    session = {
        "session_id": session_id,
        "room": room,
        "creator_id": user["user_id"],
        "creator_name": creator.get("display_name"),
        "creator_handle": creator.get("handle"),
        "creator_avatar": creator.get("avatar_url"),
        "title": payload.title,
        "description": payload.description or "",
        "is_ppv": payload.is_ppv,
        "ppv_coins": payload.ppv_coins if payload.is_ppv else 0,
        "goal_coins": payload.goal_coins,
        "goal_description": payload.goal_description or "",
        "goal_reached": False,
        "private_mode": payload.private_mode,
        "private_entry_coins": payload.private_entry_coins if payload.private_mode else 0,
        "tip_menu": [item.model_dump() for item in payload.tip_menu],
        "status": "live",
        "viewer_count": 0,
        "total_tips": 0,
        "demo_mode": not LIVEKIT_ENABLED,
        "started_at": now_utc().isoformat(),
        "host_last_ping": now_utc().isoformat(),
        "ended_at": None,
    }
    await db.live_sessions.insert_one(session)
    token = _lk_create_token(room, user["user_id"], creator.get("display_name") or "Creator", can_publish=True)
    session.pop("_id", None)
    return {"session": session, "token": token, "url": LIVEKIT_URL if LIVEKIT_ENABLED else None, "demo_mode": not LIVEKIT_ENABLED}

# -------- Newsletter subscription (popup on landing) --------
class NewsletterSubscribeIn(BaseModel):
    email: EmailStr
    source: Optional[str] = "popup"

@api_router.post("/newsletter/subscribe")
async def newsletter_subscribe(payload: NewsletterSubscribeIn):
    email = payload.email.lower()
    await db.users.update_one({"email": email}, {"$set": {"newsletter_opt_in": True}})
    await db.newsletter_subscribers.update_one(
        {"email": email},
        {"$set": {"email": email, "source": payload.source,
                  "subscribed_at": now_utc().isoformat(), "unsubscribed": False}},
        upsert=True,
    )
    try:
        from emails import _send, _layout
        body = """
        <p>Merci pour ton inscription à la newsletter me&amp;you 💌</p>
        <p>Tu recevras nos actus : nouvelles créatrices, lives à ne pas rater, offres exclusives de coins.</p>
        <p style="color:#9d94a8;font-size:13px;">Tu peux te désabonner à tout moment.</p>
        """
        html = _layout("Inscrite à la newsletter ✓", "On te tient au jus.",
                       body, "Découvrir les créatrices", f"{FRONTEND_URL}/createurs")
        await _send(email, "Bienvenue à la newsletter me&you 💌", html)
    except Exception as e:
        logger.warning("newsletter welcome email failed: %s", e)
    return {"ok": True}

@api_router.post("/live/{session_id}/stop")
async def live_stop(session_id: str, user: dict = Depends(get_current_user)):
    session = await db.live_sessions.find_one({"session_id": session_id}, {"_id": 0})
    if not session or session["creator_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Accès interdit")
    await db.live_sessions.update_one(
        {"session_id": session_id},
        {"$set": {"status": "ended", "ended_at": now_utc().isoformat(), "ended_reason": "host_stop"}},
    )
    # Best-effort kick all participants out of the LiveKit room
    if LIVEKIT_ENABLED and session.get("room"):
        try:
            from livekit import api as lk_api
            lkapi = lk_api.LiveKitAPI(LIVEKIT_URL.replace("wss://", "https://"), LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
            await lkapi.room.delete_room(lk_api.DeleteRoomRequest(room=session["room"]))
            await lkapi.aclose()
        except Exception as e:
            logger.warning("LiveKit room delete failed: %s", e)
    return {"ok": True}


@api_router.patch("/live/{session_id}/settings")
async def live_update_settings(session_id: str, payload: LiveSettingsIn,
                                user: dict = Depends(get_current_user)):
    """Host-only: update tip goal, recording, or private-mode mid-stream.
    Toggling private_mode ON kicks all non-paying viewers (they need to call
    /private-pay to come back). Toggling OFF keeps everyone."""
    session = await db.live_sessions.find_one({"session_id": session_id}, {"_id": 0})
    if not session or session["creator_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Accès interdit")
    if session.get("status") != "live":
        raise HTTPException(status_code=400, detail="Live terminé")

    updates = {}
    going_private = False
    if payload.goal_coins is not None:
        updates["goal_coins"] = payload.goal_coins
        # Reset reached flag if the goal was lowered/raised manually
        if (session.get("total_tips") or 0) < payload.goal_coins:
            updates["goal_reached"] = False
    if payload.goal_description is not None:
        updates["goal_description"] = payload.goal_description
    if payload.private_mode is not None:
        updates["private_mode"] = payload.private_mode
        if payload.private_mode and not session.get("private_mode"):
            going_private = True
        if not payload.private_mode:
            updates["private_entry_coins"] = 0
    if payload.private_entry_coins is not None:
        updates["private_entry_coins"] = payload.private_entry_coins
    if payload.tip_menu is not None:
        updates["tip_menu"] = [item.model_dump() for item in payload.tip_menu]

    if updates:
        await db.live_sessions.update_one({"session_id": session_id}, {"$set": updates})

    # When flipping ON private mode: clear the access list (only paying viewers come back)
    if going_private:
        await db.live_private_access.delete_many({"session_id": session_id})
        # Best-effort: kick all non-host LiveKit participants
        if LIVEKIT_ENABLED and session.get("room"):
            try:
                from livekit import api as lk_api
                lkapi = lk_api.LiveKitAPI(LIVEKIT_URL.replace("wss://", "https://"), LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
                participants = await lkapi.room.list_participants(lk_api.ListParticipantsRequest(room=session["room"]))
                for p in (participants.participants if hasattr(participants, "participants") else []):
                    if p.identity != user["user_id"]:
                        try:
                            await lkapi.room.remove_participant(lk_api.RoomParticipantIdentity(
                                room=session["room"], identity=p.identity,
                            ))
                        except Exception:
                            pass
                await lkapi.aclose()
            except Exception as e:
                logger.warning("private mode kick failed: %s", e)
        # Send a chat marker
        await db.live_chat.insert_one({
            "message_id": f"lsys_{uuid.uuid4().hex[:10]}",
            "session_id": session_id,
            "user_id": "system",
            "name": "🔒 Mode privé activé",
            "body": f"Le live est maintenant privé · {payload.private_entry_coins or session.get('private_entry_coins', 0)} coins pour entrer.",
            "is_system": True,
            "created_at": now_utc().isoformat(),
        })

    refreshed = await db.live_sessions.find_one({"session_id": session_id}, {"_id": 0})
    return {"ok": True, "session": refreshed}


class LivePrivatePayIn(BaseModel):
    """No body fields needed — coins price is read from the session."""
    pass


@api_router.post("/live/{session_id}/private-pay")
async def live_private_pay(session_id: str, user: dict = Depends(get_current_user)):
    """Fan pays the private-mode entry fee to gain access to the live.
    After paying once, the fan can rejoin freely until the live ends.
    Idempotent: paying again when already unlocked is a no-op."""
    session = await db.live_sessions.find_one({"session_id": session_id}, {"_id": 0})
    if not session or session.get("status") != "live":
        raise HTTPException(status_code=404, detail="Live introuvable ou terminé")
    if not session.get("private_mode"):
        return {"ok": True, "already_public": True}
    if user["user_id"] == session.get("creator_id"):
        return {"ok": True, "is_host": True}
    existing = await db.live_private_access.find_one({"session_id": session_id, "user_id": user["user_id"]}, {"_id": 0})
    if existing:
        return {"ok": True, "already_paid": True}
    price = int(session.get("private_entry_coins") or 0)
    if price <= 0:
        # private mode but no fee — give free access
        await db.live_private_access.insert_one({
            "session_id": session_id, "user_id": user["user_id"],
            "coins": 0, "created_at": now_utc().isoformat(),
        })
        return {"ok": True, "free": True}
    ok = await _debit_wallet(user["user_id"], price, reason="live_private_entry", related_id=session_id)
    if not ok:
        w = await _get_wallet(user["user_id"])
        raise HTTPException(status_code=402, detail={"error": "insufficient_coins", "needed": price, "balance": w["coin_balance"]})
    share = int(round(price * 0.8))
    await _credit_wallet(session["creator_id"], share, reason="live_private_earn", related_id=user["user_id"])
    await db.live_private_access.insert_one({
        "session_id": session_id, "user_id": user["user_id"],
        "coins": price, "created_at": now_utc().isoformat(),
    })
    await db.live_sessions.update_one({"session_id": session_id}, {"$inc": {"private_coins_earned": price}})
    return {"ok": True, "coins": price}


@api_router.post("/live/{session_id}/host-heartbeat")
async def live_host_heartbeat(session_id: str, user: dict = Depends(get_current_user)):
    """Called by the host every ~15s to keep the live session alive.
    If we don't receive a host heartbeat for >60s, the reaper auto-ends the session."""
    session = await db.live_sessions.find_one(
        {"session_id": session_id}, {"_id": 0, "creator_id": 1, "status": 1},
    )
    if not session or session.get("creator_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="Accès interdit")
    if session.get("status") != "live":
        return {"ok": True, "ended": True}
    await db.live_sessions.update_one(
        {"session_id": session_id},
        {"$set": {"host_last_ping": now_utc().isoformat()}},
    )
    return {"ok": True, "ended": False}


@api_router.post("/live/{session_id}/host-quit")
async def live_host_quit(session_id: str, request: Request):
    """Best-effort endpoint called from the host's `beforeunload`/`pagehide` event
    via navigator.sendBeacon to immediately end the session when the creator
    leaves the page (close tab, navigate away, refresh, etc.).

    Auth: accepts Bearer token in `Authorization` header OR a `{"token":"..."}`
    JSON body — sendBeacon cannot set custom headers, so we fall back to the body.

    Idempotent: returns ok even if the session is already ended."""
    user = None
    auth_header = request.headers.get("authorization") or ""
    body_token = None
    try:
        body = await request.json()
        body_token = body.get("token") if isinstance(body, dict) else None
    except Exception:
        pass
    token = None
    if auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1].strip()
    if not token and body_token:
        token = body_token
    if token:
        try:
            payload_jwt = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            user = await db.users.find_one({"user_id": payload_jwt.get("sub")}, {"_id": 0, "password_hash": 0})
        except Exception:
            user = None
    if not user:
        # Always 200 to avoid sendBeacon retry storms
        return {"ok": True, "ignored": True, "reason": "auth"}

    session = await db.live_sessions.find_one({"session_id": session_id}, {"_id": 0})
    if not session:
        return {"ok": True}
    if session.get("creator_id") != user["user_id"]:
        return {"ok": True, "ignored": True}
    if session.get("status") == "live":
        await db.live_sessions.update_one(
            {"session_id": session_id},
            {"$set": {"status": "ended", "ended_at": now_utc().isoformat(),
                      "ended_reason": "host_quit"}},
        )
        if LIVEKIT_ENABLED and session.get("room"):
            try:
                from livekit import api as lk_api
                lkapi = lk_api.LiveKitAPI(LIVEKIT_URL.replace("wss://", "https://"), LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
                await lkapi.room.delete_room(lk_api.DeleteRoomRequest(room=session["room"]))
                await lkapi.aclose()
            except Exception as e:
                logger.warning("LiveKit room delete failed (host-quit): %s", e)
    return {"ok": True}

# -------- Live moderation: kick/ban participants --------
class KickParticipantIn(BaseModel):
    user_id: str
    ban: bool = False  # If True, also add to session banned_users so they can't rejoin

class LiveModeratorIn(BaseModel):
    """Permissions a creator grants to a moderator for a live session."""
    user_id: str
    can_kick: bool = True
    can_ban: bool = True
    can_delete_msg: bool = True
    can_mute: bool = True
    can_pin: bool = False
    can_view_revenue: bool = False

class LiveMuteIn(BaseModel):
    user_id: str
    minutes: int = Field(default=5, ge=1, le=1440)  # max 24 h

class LiveSnapshotIn(BaseModel):
    """Tiny preview thumbnail captured from the host's camera every ~10 s.
    Sent as a data: URL (base64 JPEG). Capped at ~250 KB to keep doc small."""
    data_url: str = Field(min_length=20, max_length=350_000)

@api_router.post("/live/{session_id}/kick")
async def live_kick_participant(session_id: str, payload: KickParticipantIn,
                                 user: dict = Depends(get_current_user)):
    """Host or moderators with `can_kick`/`can_ban` can kick/ban viewers."""
    session = await db.live_sessions.find_one({"session_id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Live introuvable")
    is_host = session["creator_id"] == user["user_id"]
    mod = None
    if not is_host:
        mod = await db.live_moderators.find_one(
            {"session_id": session_id, "user_id": user["user_id"]}, {"_id": 0},
        )
    if not is_host and not mod:
        raise HTTPException(status_code=403, detail="Accès interdit — créatrice ou modérateur uniquement")
    if not is_host:
        if payload.ban and not mod.get("can_ban"):
            raise HTTPException(status_code=403, detail="Permission `can_ban` requise")
        if not payload.ban and not mod.get("can_kick"):
            raise HTTPException(status_code=403, detail="Permission `can_kick` requise")
    if payload.user_id == user["user_id"]:
        raise HTTPException(status_code=400, detail="Tu ne peux pas te kicker toi-même")
    if payload.user_id == session["creator_id"]:
        raise HTTPException(status_code=400, detail="Impossible de kicker la créatrice")
    # Remove from LiveKit room if enabled
    if LIVEKIT_ENABLED:
        try:
            from livekit import api as lk_api
            lkapi = lk_api.LiveKitAPI(LIVEKIT_URL.replace("wss://", "https://"), LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
            await lkapi.room.remove_participant(lk_api.RoomParticipantIdentity(
                room=session["room"], identity=payload.user_id,
            ))
            await lkapi.aclose()
        except Exception as e:
            logger.warning("LiveKit kick failed: %s", e)
    if payload.ban:
        await db.live_sessions.update_one(
            {"session_id": session_id},
            {"$addToSet": {"banned_users": payload.user_id}},
        )
    return {"ok": True, "kicked": payload.user_id, "banned": payload.ban}


@api_router.get("/live/{session_id}/banned")
async def live_list_banned(session_id: str, user: dict = Depends(get_current_user)):
    """Host-only list of users banned from this session, with name/avatar/handle."""
    session = await db.live_sessions.find_one({"session_id": session_id}, {"_id": 0})
    if not session or session["creator_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Accès interdit")
    banned_ids = list(session.get("banned_users") or [])
    if not banned_ids:
        return []
    users = await db.users.find(
        {"user_id": {"$in": banned_ids}},
        {"_id": 0, "user_id": 1, "name": 1, "avatar_url": 1, "email": 1},
    ).to_list(length=200)
    return users


@api_router.post("/live/{session_id}/banned/{user_id}/unban")
async def live_unban(session_id: str, user_id: str, user: dict = Depends(get_current_user)):
    """Host removes a user from the session ban list — they can rejoin."""
    session = await db.live_sessions.find_one({"session_id": session_id}, {"_id": 0, "creator_id": 1})
    if not session or session["creator_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Accès interdit")
    await db.live_sessions.update_one(
        {"session_id": session_id},
        {"$pull": {"banned_users": user_id}},
    )
    return {"ok": True, "unbanned": user_id}


@api_router.get("/live/{session_id}/moderators")
async def live_list_moderators(session_id: str, user: dict = Depends(get_current_user)):
    """Host-only list of moderators with their permissions."""
    session = await db.live_sessions.find_one({"session_id": session_id}, {"_id": 0, "creator_id": 1})
    if not session or session["creator_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Accès interdit")
    rows = await db.live_moderators.find(
        {"session_id": session_id}, {"_id": 0},
    ).to_list(length=50)
    out = []
    for r in rows:
        u = await db.users.find_one(
            {"user_id": r.get("user_id")},
            {"_id": 0, "user_id": 1, "name": 1, "avatar_url": 1},
        ) or {}
        c = await db.creators.find_one(
            {"creator_id": r.get("user_id")}, {"_id": 0, "handle": 1},
        ) or {}
        out.append({
            **r,
            "name": u.get("name") or "Utilisateur",
            "avatar_url": u.get("avatar_url"),
            "handle": c.get("handle"),
        })
    return out


@api_router.post("/live/{session_id}/moderators")
async def live_add_moderator(session_id: str, payload: LiveModeratorIn,
                              user: dict = Depends(get_current_user)):
    """Host-only: add a moderator with a custom permission set."""
    session = await db.live_sessions.find_one({"session_id": session_id}, {"_id": 0, "creator_id": 1})
    if not session or session["creator_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Accès interdit")
    if payload.user_id == user["user_id"]:
        raise HTTPException(status_code=400, detail="Tu es déjà l'hôte du live")
    target = await db.users.find_one({"user_id": payload.user_id}, {"_id": 0, "user_id": 1, "name": 1})
    if not target:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    doc = {
        "session_id": session_id,
        "user_id": payload.user_id,
        "added_by": user["user_id"],
        "added_at": now_utc().isoformat(),
        "can_kick": bool(payload.can_kick),
        "can_ban": bool(payload.can_ban),
        "can_delete_msg": bool(payload.can_delete_msg),
        "can_mute": bool(payload.can_mute),
        "can_pin": bool(payload.can_pin),
        "can_view_revenue": bool(payload.can_view_revenue),
    }
    await db.live_moderators.update_one(
        {"session_id": session_id, "user_id": payload.user_id},
        {"$set": doc}, upsert=True,
    )
    return {"ok": True, "moderator": doc}


@api_router.delete("/live/{session_id}/moderators/{user_id}")
async def live_remove_moderator(session_id: str, user_id: str,
                                 user: dict = Depends(get_current_user)):
    session = await db.live_sessions.find_one({"session_id": session_id}, {"_id": 0, "creator_id": 1})
    if not session or session["creator_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Accès interdit")
    await db.live_moderators.delete_one({"session_id": session_id, "user_id": user_id})
    return {"ok": True}


@api_router.post("/live/{session_id}/mute")
async def live_mute_user(session_id: str, payload: LiveMuteIn,
                          user: dict = Depends(get_current_user)):
    """Mute a viewer in chat for N minutes. Host or mod with `can_mute`."""
    session = await db.live_sessions.find_one({"session_id": session_id}, {"_id": 0, "creator_id": 1})
    if not session:
        raise HTTPException(status_code=404, detail="Live introuvable")
    is_host = session["creator_id"] == user["user_id"]
    if not is_host:
        mod = await db.live_moderators.find_one(
            {"session_id": session_id, "user_id": user["user_id"]}, {"_id": 0, "can_mute": 1},
        )
        if not mod or not mod.get("can_mute"):
            raise HTTPException(status_code=403, detail="Permission `can_mute` requise")
    if payload.user_id == session["creator_id"]:
        raise HTTPException(status_code=400, detail="Impossible de muter la créatrice")
    until = now_utc() + timedelta(minutes=int(payload.minutes))
    await db.live_chat_mutes.update_one(
        {"session_id": session_id, "user_id": payload.user_id},
        {"$set": {"session_id": session_id, "user_id": payload.user_id,
                  "muted_until": until.isoformat(), "by": user["user_id"]}},
        upsert=True,
    )
    return {"ok": True, "muted_until": until.isoformat()}


@api_router.delete("/live/{session_id}/chat/{message_id}")
async def live_delete_chat(session_id: str, message_id: str,
                            user: dict = Depends(get_current_user)):
    """Delete a chat message. Host or mod with `can_delete_msg`."""
    session = await db.live_sessions.find_one({"session_id": session_id}, {"_id": 0, "creator_id": 1})
    if not session:
        raise HTTPException(status_code=404, detail="Live introuvable")
    is_host = session["creator_id"] == user["user_id"]
    if not is_host:
        mod = await db.live_moderators.find_one(
            {"session_id": session_id, "user_id": user["user_id"]}, {"_id": 0, "can_delete_msg": 1},
        )
        if not mod or not mod.get("can_delete_msg"):
            raise HTTPException(status_code=403, detail="Permission `can_delete_msg` requise")
    await db.live_chat.delete_one({"session_id": session_id, "message_id": message_id})
    return {"ok": True}


@api_router.post("/live/{session_id}/pin/{message_id}")
async def live_pin_message(session_id: str, message_id: str,
                            user: dict = Depends(get_current_user)):
    """Pin/unpin a chat message. Host or mod with `can_pin`."""
    session = await db.live_sessions.find_one({"session_id": session_id}, {"_id": 0, "creator_id": 1, "pinned_message_id": 1})
    if not session:
        raise HTTPException(status_code=404, detail="Live introuvable")
    is_host = session["creator_id"] == user["user_id"]
    if not is_host:
        mod = await db.live_moderators.find_one(
            {"session_id": session_id, "user_id": user["user_id"]}, {"_id": 0, "can_pin": 1},
        )
        if not mod or not mod.get("can_pin"):
            raise HTTPException(status_code=403, detail="Permission `can_pin` requise")
    new_pinned = None if session.get("pinned_message_id") == message_id else message_id
    await db.live_sessions.update_one(
        {"session_id": session_id},
        {"$set": {"pinned_message_id": new_pinned}},
    )
    return {"ok": True, "pinned_message_id": new_pinned}


@api_router.post("/live/{session_id}/snapshot")
async def live_update_snapshot(session_id: str, payload: LiveSnapshotIn,
                                user: dict = Depends(get_current_user)):
    """Host-only: every ~10 s the host pushes a JPEG thumbnail of their live
    feed. We expose it as `preview_url` on the active-lives list so fans see a
    real recent frame instead of the static avatar."""
    session = await db.live_sessions.find_one({"session_id": session_id}, {"_id": 0, "creator_id": 1, "status": 1})
    if not session or session["creator_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Accès interdit")
    if session.get("status") != "live":
        return {"ok": True, "skipped": "not_live"}
    # Quick safety: must look like a JPEG/PNG data URL
    if not payload.data_url.startswith("data:image/"):
        raise HTTPException(status_code=400, detail="Format invalide (data:image/jpeg attendu)")
    await db.live_sessions.update_one(
        {"session_id": session_id},
        {"$set": {"preview_data_url": payload.data_url, "preview_updated_at": now_utc().isoformat()}},
    )
    return {"ok": True}


# -------- User lookup for moderator selection --------
@api_router.get("/users/lookup")
async def lookup_users(
    q: str = "",
    scope: str = "all",  # "all" | "subscribers"
    user: dict = Depends(get_current_user),
):
    """Tiny search endpoint used by the live "add moderator" picker.
    `scope=subscribers` restricts the result set to users currently subscribed
    to the requester (creator-only). `q` matches case-insensitively against
    name, email, or @handle. Returns at most 10 lean rows."""
    qn = (q or "").strip().lstrip("@").lower()
    if len(qn) < 2:
        return []
    filt: dict = {}
    if scope == "subscribers":
        active_subs = await db.subscriptions.find(
            {"creator_id": user["user_id"], "status": "active"},
            {"_id": 0, "user_id": 1},
        ).to_list(length=1000)
        sub_ids = [s["user_id"] for s in active_subs]
        if not sub_ids:
            return []
        filt["user_id"] = {"$in": sub_ids}
    # Match against handle (creators) OR name/email (users)
    creator_ids: List[str] = []
    matching_creators = await db.creators.find(
        {"handle": {"$regex": f"^{qn}", "$options": "i"}},
        {"_id": 0, "creator_id": 1, "handle": 1},
    ).to_list(length=10)
    creator_ids = [c["creator_id"] for c in matching_creators]
    or_clauses: list = [
        {"name": {"$regex": qn, "$options": "i"}},
        {"email": {"$regex": qn, "$options": "i"}},
    ]
    if creator_ids:
        or_clauses.append({"user_id": {"$in": creator_ids}})
    filt["$or"] = or_clauses
    rows = await db.users.find(
        filt, {"_id": 0, "user_id": 1, "name": 1, "avatar_url": 1, "email": 1},
    ).limit(10).to_list(length=10)
    out = []
    for r in rows:
        if r["user_id"] == user["user_id"]:
            continue  # never include self
        c = await db.creators.find_one(
            {"creator_id": r["user_id"]}, {"_id": 0, "handle": 1},
        ) or {}
        out.append({
            "user_id": r["user_id"],
            "name": r.get("name") or "Utilisateur",
            "avatar_url": r.get("avatar_url"),
            "handle": c.get("handle"),
        })
    return out



# -------- OBS / RTMP ingress (stream via OBS Studio) --------
@api_router.post("/live/{session_id}/obs-ingress")
async def live_obs_ingress(session_id: str, user: dict = Depends(get_current_user)):
    """Generate an RTMP ingress endpoint (URL + stream key) so the creator can
    publish their live feed from OBS Studio / Streamlabs / etc. directly to
    LiveKit (who transcodes it to WebRTC for fans)."""
    session = await db.live_sessions.find_one({"session_id": session_id}, {"_id": 0})
    if not session or session["creator_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Accès interdit")
    if not LIVEKIT_ENABLED:
        raise HTTPException(status_code=503, detail="LiveKit non configuré")
    # Check if ingress already exists for this session
    existing = await db.live_ingress.find_one({"session_id": session_id}, {"_id": 0})
    if existing:
        return {
            "url": existing["rtmp_url"], "stream_key": existing["stream_key"],
            "ingress_id": existing["ingress_id"], "room": session["room"],
        }
    try:
        from livekit import api as lk_api
        lkapi = lk_api.LiveKitAPI(LIVEKIT_URL.replace("wss://", "https://"), LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
        res = await lkapi.ingress.create_ingress(lk_api.CreateIngressRequest(
            input_type=lk_api.IngressInput.RTMP_INPUT,
            name=f"meandyou-{session_id}",
            room_name=session["room"],
            participant_identity=user["user_id"],
            participant_name=f"{user.get('name', 'Creator')} (OBS)",
        ))
        await lkapi.aclose()
    except Exception as e:
        logger.exception("OBS ingress failed: %s", e)
        raise HTTPException(status_code=502, detail=f"Erreur OBS: {str(e)}")
    await db.live_ingress.insert_one({
        "session_id": session_id, "creator_id": user["user_id"],
        "ingress_id": res.ingress_id, "rtmp_url": res.url, "stream_key": res.stream_key,
        "created_at": now_utc().isoformat(),
    })
    return {
        "url": res.url, "stream_key": res.stream_key,
        "ingress_id": res.ingress_id, "room": session["room"],
    }

# -------- Lovense stub (donation-triggered toy control) --------
class LovenseLinkIn(BaseModel):
    qr_token: Optional[str] = None  # Lovense QR-linked developer token

@api_router.get("/creators/me/lovense/status")
async def lovense_status(user: dict = Depends(get_current_user)):
    """Stub: Returns whether the creator has linked a Lovense toy.
    Full integration requires Lovense Developer account + QR pairing flow."""
    creator = await db.creators.find_one({"creator_id": user["user_id"]}, {"_id": 0})
    if not creator:
        raise HTTPException(status_code=403, detail="Créatrice uniquement")
    return {
        "connected": bool(creator.get("lovense_token")),
        "coming_soon": not bool(creator.get("lovense_token")),
        "info": "Lovense Connect intégration en cours — scanne bientôt ton QR code pour lier ton toy aux tips de tes fans.",
    }

@api_router.post("/creators/me/lovense/link")
async def lovense_link(payload: LovenseLinkIn, user: dict = Depends(get_current_user)):
    """Placeholder to store a Lovense token once the QR flow is implemented."""
    creator = await db.creators.find_one({"creator_id": user["user_id"]}, {"_id": 0})
    if not creator:
        raise HTTPException(status_code=403, detail="Créatrice uniquement")
    await db.creators.update_one(
        {"creator_id": user["user_id"]},
        {"$set": {"lovense_token": payload.qr_token, "lovense_linked_at": now_utc().isoformat()}},
    )
    return {"ok": True, "connected": True}


@api_router.get("/live/active")
async def live_active_list():
    items = await db.live_sessions.find(
        {"status": "live"}, {"_id": 0},
    ).sort("started_at", -1).to_list(length=50)
    # Surface a single "preview_url" — recent host snapshot if present, else
    # fall back to the creator avatar so older sessions still render.
    for it in items:
        it["preview_url"] = it.get("preview_data_url") or it.get("creator_avatar")
        # Don't ship the full base64 in the lobby payload twice.
        it.pop("preview_data_url", None)
    return items

@api_router.get("/live/{session_id}")
async def live_get(session_id: str, user: Optional[dict] = Depends(optional_current_user)):
    session = await db.live_sessions.find_one({"session_id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Live introuvable")
    # Check PPV access
    has_access = True
    if session["is_ppv"] and session["ppv_coins"] > 0 and user and user["user_id"] != session["creator_id"]:
        unlocked = await db.live_unlocks.find_one({"session_id": session_id, "user_id": user["user_id"]})
        has_access = bool(unlocked)
    session["has_access"] = has_access
    # Private mode access (paid entry)
    has_private_access = True
    if session.get("private_mode") and user and user["user_id"] != session.get("creator_id"):
        access = await db.live_private_access.find_one(
            {"session_id": session_id, "user_id": user["user_id"]}, {"_id": 0},
        )
        has_private_access = bool(access)
    session["has_private_access"] = has_private_access
    # Real-time viewer count: unique user_ids with a heartbeat in the last 30 s
    thirty_ago = (now_utc() - timedelta(seconds=30)).isoformat()
    session["viewer_count"] = await db.live_viewers.count_documents({
        "session_id": session_id, "last_seen": {"$gte": thirty_ago},
    })
    # Track peak viewer count for the post-stream recap.
    if session["viewer_count"] > int(session.get("peak_viewer_count") or 0):
        await db.live_sessions.update_one(
            {"session_id": session_id},
            {"$set": {"peak_viewer_count": session["viewer_count"]}},
        )
        session["peak_viewer_count"] = session["viewer_count"]
    # Live coins earned (tips + ppv + private entries) — computed for the host only.
    # All these flows already credit the creator's wallet via _credit_wallet() at 80%; this is just the
    # in-session display so the host sees a single "coins gagnés" badge that matches their wallet.
    if user and user["user_id"] == session["creator_id"]:
        tips = int(session.get("total_tips") or session.get("tips_coins") or 0)
        ppv = int(session.get("ppv_coins_earned") or 0)
        private_in = int(session.get("private_coins_earned") or 0)
        session["coins_earned"] = int(round((tips + ppv + private_in) * CREATOR_PAYOUT_RATIO))
    # Favorites
    session["favorites_count"] = int(session.get("favorites_count") or 0)
    session["is_favorited"] = False
    if user:
        fav = await db.live_favorites.find_one({"session_id": session_id, "user_id": user["user_id"]})
        session["is_favorited"] = bool(fav)
    # Expose preview snapshot for non-host fan UI (so the rejoin / locked state
    # can show the actual recent frame instead of a black aspect-video box).
    session["preview_url"] = session.get("preview_data_url") or session.get("creator_avatar")
    if not user or user.get("user_id") != session.get("creator_id"):
        # Trim the heavy blob from non-host responses — only the URL matters.
        session.pop("preview_data_url", None)
    # Tag whether the current viewer is a moderator (so the chat UI can show
    # the "delete msg" / "kick" affordances on hover).
    session["is_moderator"] = False
    session["my_mod_perms"] = None
    if user and user["user_id"] != session.get("creator_id"):
        mod = await db.live_moderators.find_one(
            {"session_id": session_id, "user_id": user["user_id"]}, {"_id": 0},
        )
        if mod:
            session["is_moderator"] = True
            session["my_mod_perms"] = {
                k: bool(mod.get(k)) for k in
                ("can_kick", "can_ban", "can_delete_msg", "can_mute", "can_pin", "can_view_revenue")
            }
    return session


@api_router.post("/live/{session_id}/heartbeat")
async def live_heartbeat(session_id: str, user: dict = Depends(get_current_user)):
    """Fans call this every ~10 s while watching so we have an accurate real-time viewer count."""
    session = await db.live_sessions.find_one({"session_id": session_id}, {"_id": 0, "status": 1, "creator_id": 1})
    if not session or session.get("status") != "live":
        raise HTTPException(status_code=404, detail="Live terminé")
    if user["user_id"] == session.get("creator_id"):
        return {"ok": True, "skipped": True}
    await db.live_viewers.update_one(
        {"session_id": session_id, "user_id": user["user_id"]},
        {"$set": {
            "session_id": session_id,
            "user_id": user["user_id"],
            "last_seen": now_utc().isoformat(),
        }},
        upsert=True,
    )
    return {"ok": True}


@api_router.get("/live/{session_id}/leaderboard")
async def live_leaderboard(session_id: str, _user: Optional[dict] = Depends(optional_current_user)):
    """Top tippers for a session — used by the live ended recap to show the
    gold/silver/bronze podium. Aggregated from `live_tip_totals`."""
    rows = await db.live_tip_totals.find(
        {"session_id": session_id}, {"_id": 0},
    ).sort("coins", -1).limit(10).to_list(length=10)
    out = []
    for r in rows:
        u = await db.users.find_one(
            {"user_id": r.get("user_id")},
            {"_id": 0, "name": 1, "avatar_url": 1},
        ) or {}
        out.append({
            "user_id": r.get("user_id"),
            "name": u.get("name") or "Anonyme",
            "avatar_url": u.get("avatar_url"),
            "coins": int(r.get("coins") or 0),
        })
    return out



@api_router.post("/live/{session_id}/favorite")
async def live_favorite(session_id: str, user: dict = Depends(get_current_user)):
    session = await db.live_sessions.find_one({"session_id": session_id}, {"_id": 0, "status": 1})
    if not session:
        raise HTTPException(status_code=404, detail="Live introuvable")
    res = await db.live_favorites.update_one(
        {"session_id": session_id, "user_id": user["user_id"]},
        {"$setOnInsert": {
            "session_id": session_id,
            "user_id": user["user_id"],
            "created_at": now_utc().isoformat(),
        }},
        upsert=True,
    )
    if res.upserted_id is not None:
        await db.live_sessions.update_one({"session_id": session_id}, {"$inc": {"favorites_count": 1}})
    s = await db.live_sessions.find_one({"session_id": session_id}, {"_id": 0, "favorites_count": 1})
    return {"ok": True, "is_favorited": True, "favorites_count": int((s or {}).get("favorites_count") or 0)}


@api_router.delete("/live/{session_id}/favorite")
async def live_unfavorite(session_id: str, user: dict = Depends(get_current_user)):
    res = await db.live_favorites.delete_one({"session_id": session_id, "user_id": user["user_id"]})
    if res.deleted_count > 0:
        await db.live_sessions.update_one({"session_id": session_id}, {"$inc": {"favorites_count": -1}})
    s = await db.live_sessions.find_one({"session_id": session_id}, {"_id": 0, "favorites_count": 1})
    return {"ok": True, "is_favorited": False, "favorites_count": max(0, int((s or {}).get("favorites_count") or 0))}


@api_router.post("/live/{session_id}/join")
async def live_join(session_id: str, user: dict = Depends(get_current_user)):
    session = await db.live_sessions.find_one({"session_id": session_id}, {"_id": 0})
    if not session or session["status"] != "live":
        raise HTTPException(status_code=404, detail="Live introuvable ou terminé")
    # Check ban list (kicked out by host)
    if user["user_id"] in (session.get("banned_users") or []) and user["user_id"] != session.get("creator_id"):
        raise HTTPException(status_code=403, detail="Tu as été exclu·e de ce live par la créatrice")
    # PPV check
    if session["is_ppv"] and session["ppv_coins"] > 0 and user["user_id"] != session["creator_id"]:
        unlocked = await db.live_unlocks.find_one({"session_id": session_id, "user_id": user["user_id"]})
        if not unlocked:
            ok = await _debit_wallet(user["user_id"], session["ppv_coins"], reason="live_ppv", related_id=session_id)
            if not ok:
                w = await _get_wallet(user["user_id"])
                raise HTTPException(status_code=402, detail={"error": "insufficient_coins", "needed": session["ppv_coins"], "balance": w["coin_balance"]})
            share = int(round(session["ppv_coins"] * 0.8))
            await _credit_wallet(session["creator_id"], share, reason="live_ppv_earn", related_id=session_id)
            await db.live_unlocks.insert_one({
                "session_id": session_id, "user_id": user["user_id"],
                "coins": session["ppv_coins"], "created_at": now_utc().isoformat(),
            })
            await db.live_sessions.update_one(
                {"session_id": session_id},
                {"$inc": {"ppv_coins_earned": session["ppv_coins"]}},
            )
    # Private-mode gate: viewer must have paid the private entry fee
    if session.get("private_mode") and user["user_id"] != session.get("creator_id"):
        access = await db.live_private_access.find_one(
            {"session_id": session_id, "user_id": user["user_id"]}, {"_id": 0},
        )
        if not access:
            raise HTTPException(status_code=402, detail={
                "error": "private_mode_locked",
                "needed": int(session.get("private_entry_coins") or 0),
                "message": "Ce live est en mode privé — règle l'entrée pour rejoindre.",
            })
    # Create token — publisher for the host (creator), viewer for fans
    is_host = user["user_id"] == session.get("creator_id")
    token = _lk_create_token(session["room"], user["user_id"], user.get("name") or "Fan",
                              can_publish=is_host)
    if not is_host:
        await db.live_sessions.update_one({"session_id": session_id}, {"$inc": {"viewer_count": 1}})
    return {"session_id": session_id, "room": session["room"], "token": token,
            "url": LIVEKIT_URL if LIVEKIT_ENABLED else None,
            "demo_mode": not LIVEKIT_ENABLED, "is_host": is_host}

@api_router.post("/live/{session_id}/chat")
async def live_chat(session_id: str, payload: LiveChatIn, user: dict = Depends(get_current_user)):
    session = await db.live_sessions.find_one({"session_id": session_id}, {"_id": 0})
    if not session or session["status"] != "live":
        raise HTTPException(status_code=404, detail="Live terminé")
    # Enforce active mute (chat-only timeout from host or moderator)
    if user["user_id"] != session.get("creator_id"):
        mute = await db.live_chat_mutes.find_one(
            {"session_id": session_id, "user_id": user["user_id"]}, {"_id": 0},
        )
        if mute and mute.get("muted_until") and mute["muted_until"] > now_utc().isoformat():
            raise HTTPException(status_code=403, detail={
                "error": "muted", "muted_until": mute["muted_until"],
            })
    msg = {
        "message_id": f"lmsg_{uuid.uuid4().hex[:10]}",
        "session_id": session_id,
        "user_id": user["user_id"],
        "name": user.get("name") or "Anonyme",
        "avatar_url": user.get("avatar_url"),
        "body": payload.body,
        "is_creator": user["user_id"] == session["creator_id"],
        "created_at": now_utc().isoformat(),
    }
    await db.live_chat.insert_one(msg)
    msg.pop("_id", None)
    return msg

async def _compute_live_badges(user_id: str, session: dict) -> List[str]:
    """Return the badge list for a fan in a given live session.
    Possible badges:
      - "host"        — the creator hosting this live
      - "top_tipper"  — biggest cumulative tipper of THIS session
      - "subscriber"  — has an active subscription to this creator
      - "vip"         — fidelity badge gold/diamond (lifetime spend tier)
      - "referrer"    — referred at least one fan who funded their wallet
    Order matters: rendered left-to-right in the UI.
    """
    if not user_id or user_id == "system":
        return []
    badges: List[str] = []
    creator_id = session.get("creator_id")
    if user_id == creator_id:
        badges.append("host")
        return badges
    if session.get("top_tipper_user_id") == user_id:
        badges.append("top_tipper")
    sub = await db.subscriptions.find_one(
        {"user_id": user_id, "creator_id": creator_id, "status": "active"},
        {"_id": 0, "expires_at": 1},
    )
    if sub:
        try:
            exp = sub.get("expires_at") or ""
            if not exp or datetime.fromisoformat(exp.replace("Z", "+00:00")) > now_utc():
                badges.append("subscriber")
        except Exception:
            badges.append("subscriber")
    wallet = await db.wallets.find_one({"user_id": user_id}, {"_id": 0, "lifetime_spent": 1}) or {}
    spent = int(wallet.get("lifetime_spent") or 0)
    if spent >= 1000:
        badges.append("vip")
    refcount = await db.users.count_documents({
        "referred_by": user_id, "referral_bonus_granted": True,
    })
    if refcount > 0:
        badges.append("referrer")
    return badges


@api_router.get("/live/{session_id}/chat")
async def live_chat_list(session_id: str, since: Optional[str] = None):
    q = {"session_id": session_id}
    if since:
        q["created_at"] = {"$gt": since}
    items = await db.live_chat.find(q, {"_id": 0}).sort("created_at", 1).limit(80).to_list(length=80)
    if not items:
        return items
    session = await db.live_sessions.find_one(
        {"session_id": session_id},
        {"_id": 0, "creator_id": 1, "top_tipper_user_id": 1},
    ) or {}
    # Per-author cache so each unique user is only resolved once per request
    cache: Dict[str, List[str]] = {}
    for m in items:
        uid = m.get("user_id") or ""
        if uid in cache:
            m["badges"] = cache[uid]
        else:
            badges = await _compute_live_badges(uid, session)
            cache[uid] = badges
            m["badges"] = badges
    return items

@api_router.post("/live/{session_id}/tip")
async def live_tip(session_id: str, payload: LiveTipIn, user: dict = Depends(get_current_user)):
    session = await db.live_sessions.find_one({"session_id": session_id}, {"_id": 0})
    if not session or session["status"] != "live":
        raise HTTPException(status_code=404, detail="Live terminé")
    ok = await _debit_wallet(user["user_id"], payload.coins, reason="live_tip", related_id=session_id)
    if not ok:
        w = await _get_wallet(user["user_id"])
        raise HTTPException(status_code=402, detail={"error": "insufficient_coins", "needed": payload.coins, "balance": w["coin_balance"]})
    share = int(round(payload.coins * 0.8))
    await _credit_wallet(session["creator_id"], share, reason="tip_earn", related_id=user["user_id"])
    await db.live_sessions.update_one({"session_id": session_id}, {"$inc": {"total_tips": payload.coins}})
    # Track per-user tip totals on the session for the top-tipper badge.
    await db.live_tip_totals.update_one(
        {"session_id": session_id, "user_id": user["user_id"]},
        {"$inc": {"coins": payload.coins},
         "$setOnInsert": {"session_id": session_id, "user_id": user["user_id"],
                          "creator_id": session["creator_id"], "first_at": now_utc().isoformat()}},
        upsert=True,
    )
    user_total_doc = await db.live_tip_totals.find_one(
        {"session_id": session_id, "user_id": user["user_id"]}, {"_id": 0, "coins": 1},
    )
    user_session_total = int((user_total_doc or {}).get("coins") or 0)
    current_top = int(session.get("top_tipper_coins") or 0)
    if user_session_total > current_top:
        await db.live_sessions.update_one(
            {"session_id": session_id},
            {"$set": {"top_tipper_user_id": user["user_id"],
                      "top_tipper_coins": user_session_total}},
        )
    # Tip-goal celebration: when crossing the goal threshold, mark goal_reached + push a system message
    goal = int(session.get("goal_coins") or 0)
    if goal > 0 and not session.get("goal_reached"):
        new_total = int((session.get("total_tips") or 0) + payload.coins)
        if new_total >= goal:
            await db.live_sessions.update_one(
                {"session_id": session_id},
                {"$set": {"goal_reached": True, "goal_reached_at": now_utc().isoformat()}},
            )
            await db.live_chat.insert_one({
                "message_id": f"lgoal_{uuid.uuid4().hex[:10]}",
                "session_id": session_id,
                "user_id": "system",
                "name": "🎉 Objectif atteint !",
                "body": f"L'objectif {goal} coins est atteint — merci tout le monde 💜",
                "is_system": True,
                "is_goal_reached": True,
                "created_at": now_utc().isoformat(),
            })
    await db.live_chat.insert_one({
        "message_id": f"ltip_{uuid.uuid4().hex[:10]}",
        "session_id": session_id,
        "user_id": user["user_id"],
        "name": user.get("name") or "Anonyme",
        "avatar_url": user.get("avatar_url"),
        "body": payload.message or "",
        "is_tip": True,
        "tip_coins": payload.coins,
        "created_at": now_utc().isoformat(),
    })
    return {"ok": True, "coins": payload.coins}


# -------- MASS MESSAGE (broadcast) --------
@api_router.post("/creators/me/broadcast")
async def creator_broadcast(payload: BroadcastIn, user: dict = Depends(get_current_user)):
    creator = await db.creators.find_one({"creator_id": user["user_id"]}, {"_id": 0})
    if not creator:
        raise HTTPException(status_code=403, detail="Réservé aux créatrices")
    subs = await db.subscriptions.find(
        {"creator_id": user["user_id"], "status": "active"},
        {"_id": 0, "user_id": 1},
    ).to_list(length=5000)
    if not subs:
        return {"ok": True, "count": 0}
    broadcast_id = f"bcast_{uuid.uuid4().hex[:10]}"
    now_iso = now_utc().isoformat()
    docs = [{
        "message_id": f"msg_{uuid.uuid4().hex[:10]}",
        "creator_id": user["user_id"],
        "fan_id": s["user_id"],
        "sender_id": user["user_id"],
        "body": payload.body,
        "media_url": payload.media_url,
        "media_paywall_coins": payload.media_paywall_coins if payload.media_url else 0,
        "is_broadcast": True,
        "broadcast_id": broadcast_id,
        "created_at": now_iso,
    } for s in subs]
    await db.messages.insert_many(docs)
    # Notifications
    for s in subs:
        await _create_notification(
            s["user_id"], "new_message",
            f"{creator.get('display_name')} t'a envoyé un message",
            (payload.body or "")[:120],
            {"creator_id": user["user_id"]},
        )
    return {"ok": True, "count": len(subs), "broadcast_id": broadcast_id}


# -------- MESSAGE MEDIA UNLOCK (paid content in DM) --------
@api_router.post("/messages/{message_id}/unlock")
async def unlock_message_media(message_id: str, user: dict = Depends(get_current_user)):
    msg = await db.messages.find_one({"message_id": message_id}, {"_id": 0})
    if not msg:
        raise HTTPException(status_code=404, detail="Message introuvable")
    if msg.get("fan_id") != user["user_id"]:
        raise HTTPException(status_code=403, detail="Ce message n'est pas pour toi")
    cost = int(msg.get("media_paywall_coins") or 0)
    if cost <= 0:
        return {"ok": True, "already_free": True, "media_url": msg.get("media_url")}
    already = await db.message_unlocks.find_one({"message_id": message_id, "user_id": user["user_id"]})
    if already:
        return {"ok": True, "already_unlocked": True, "media_url": msg.get("media_url")}
    ok = await _debit_wallet(user["user_id"], cost, reason="msg_media_unlock", related_id=message_id)
    if not ok:
        w = await _get_wallet(user["user_id"])
        raise HTTPException(status_code=402, detail={"error": "insufficient_coins", "needed": cost, "balance": w["coin_balance"]})
    share = int(round(cost * 0.8))
    await _credit_wallet(msg["creator_id"], share, reason="unlock_earn", related_id=message_id)
    await db.message_unlocks.insert_one({
        "message_id": message_id, "user_id": user["user_id"],
        "coins": cost, "created_at": now_utc().isoformat(),
    })
    return {"ok": True, "media_url": msg.get("media_url"), "coins_spent": cost}


# -------- SUBSCRIPTION BUNDLES --------
BUNDLE_DISCOUNTS = {1: 0, 3: 10, 6: 20, 12: 30}  # months → % off

@api_router.get("/creators/{creator_id}/bundles")
async def get_bundles(creator_id: str):
    creator = await db.creators.find_one({"creator_id": creator_id}, {"_id": 0})
    if not creator:
        raise HTTPException(status_code=404, detail="Créatrice introuvable")
    base_price = float(creator.get("subscription_price") or 0)
    promo = await _get_active_promotion(creator_id)
    effective = _effective_price(creator, promo)
    out = []
    for months, pct in BUNDLE_DISCOUNTS.items():
        monthly_price = round(effective * (100 - pct) / 100, 2)
        total_eur = round(monthly_price * months, 2)
        total_coins = eur_to_coins(total_eur)
        out.append({
            "months": months,
            "discount_percent": pct,
            "monthly_eur": monthly_price,
            "total_eur": total_eur,
            "total_coins": total_coins,
            "saved_eur": round((effective - monthly_price) * months, 2),
        })
    return {"base_monthly": base_price, "effective_monthly": effective, "has_promo": bool(promo), "bundles": out}

@api_router.post("/payments/subscribe-bundle")
async def subscribe_bundle(payload: SubscribeBundleIn, user: dict = Depends(get_current_user)):
    if payload.months not in BUNDLE_DISCOUNTS:
        raise HTTPException(status_code=400, detail="Durée invalide (1, 3, 6 ou 12 mois)")
    creator = await db.creators.find_one({"creator_id": payload.creator_id}, {"_id": 0})
    if not creator:
        raise HTTPException(status_code=404, detail="Créatrice introuvable")
    promo = await _get_active_promotion(payload.creator_id)
    effective = _effective_price(creator, promo)
    pct = BUNDLE_DISCOUNTS[payload.months]
    monthly_price = round(effective * (100 - pct) / 100, 2)
    total_eur = round(monthly_price * payload.months, 2)
    total_coins = eur_to_coins(total_eur)
    wallet = await _get_wallet(user["user_id"])
    if wallet["coin_balance"] < total_coins:
        raise HTTPException(status_code=402, detail={"error": "insufficient_coins", "needed": total_coins, "balance": wallet["coin_balance"]})
    await _debit_wallet(user["user_id"], total_coins, reason="subscription", related_id=payload.creator_id)
    share = int(round(total_coins * 0.8))
    await _credit_wallet(payload.creator_id, share, reason="subscription_earn", related_id=user["user_id"])
    expires = now_utc() + timedelta(days=30 * payload.months)
    await db.subscriptions.update_one(
        {"user_id": user["user_id"], "creator_id": payload.creator_id},
        {"$set": {
            "status": "active",
            "auto_renew": False,  # bundle = no auto-renew
            "bundle_months": payload.months,
            "expires_at": expires.isoformat(),
            "renewed_at": now_utc().isoformat(),
        }, "$setOnInsert": {"user_id": user["user_id"], "creator_id": payload.creator_id, "created_at": now_utc().isoformat()}},
        upsert=True,
    )
    await db.creators.update_one({"creator_id": payload.creator_id}, {"$inc": {"subscribers_count": 1}})
    return {"ok": True, "months": payload.months, "coins_paid": total_coins, "expires_at": expires.isoformat()}


@api_router.post("/payments/subscribe-bundle-stripe")
async def subscribe_bundle_stripe(payload: SubscribeBundleStripeIn, request: Request,
                                  user: dict = Depends(get_current_user)):
    """Create a Stripe Checkout session to pay for a subscription bundle directly in EUR (no coins needed).
    On payment success (webhook / status), activates the subscription for the chosen number of months."""
    if payload.months not in BUNDLE_DISCOUNTS:
        raise HTTPException(status_code=400, detail="Durée invalide (1, 3, 6 ou 12 mois)")
    creator = await db.creators.find_one({"creator_id": payload.creator_id}, {"_id": 0})
    if not creator:
        raise HTTPException(status_code=404, detail="Créatrice introuvable")
    promo = await _get_active_promotion(payload.creator_id)
    effective = _effective_price(creator, promo)
    pct = BUNDLE_DISCOUNTS[payload.months]
    monthly_price = round(effective * (100 - pct) / 100, 2)
    total_eur = round(monthly_price * payload.months, 2)
    if total_eur < 0.5:
        raise HTTPException(status_code=400, detail="Montant trop faible pour Stripe")

    origin = _normalize_origin(payload.origin_url, request)
    success_url = f"{origin}/payment/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/createurs/{creator.get('handle') or payload.creator_id}"

    # Stripe Connect: if creator has a fully-onboarded Express account, use destination charges
    # → fan pays → 80% goes directly to creator's Stripe balance, 20% stays on platform
    connect_acct = creator.get("stripe_account_id")
    connect_active = bool(creator.get("stripe_account_charges_enabled"))
    use_connect = bool(connect_acct and connect_active)
    application_fee_cents = int(round(total_eur * 100 * (1 - CREATOR_PAYOUT_RATIO))) if use_connect else None

    if _stripe_live_enabled():
        session = _create_checkout_session_direct(
            amount_eur=float(total_eur), currency="eur",
            success_url=success_url, cancel_url=cancel_url,
            product_name=f"Abonnement {creator.get('display_name', 'créatrice')} · {payload.months} mois",
            metadata={
                "type": "bundle_subscription",
                "user_id": user["user_id"],
                "creator_id": payload.creator_id,
                "months": str(payload.months),
                "connect": "1" if use_connect else "0",
            },
            customer_email=user.get("email"),
            destination_account=connect_acct if use_connect else None,
            application_fee_amount=application_fee_cents,
        )
        session_id, session_url = session["id"], session["url"]
    else:
        stripe_checkout = get_stripe(request)
        req = CheckoutSessionRequest(
            amount=float(total_eur), currency="eur",
            success_url=success_url, cancel_url=cancel_url,
            metadata={
                "type": "bundle_subscription",
                "user_id": user["user_id"],
                "creator_id": payload.creator_id,
                "months": str(payload.months),
            },
        )
        s = await stripe_checkout.create_checkout_session(req)
        session_id, session_url = s.session_id, s.url

    await db.payment_transactions.insert_one({
        "session_id": session_id,
        "type": "bundle_subscription",
        "user_id": user["user_id"],
        "creator_id": payload.creator_id,
        "months": payload.months,
        "amount": float(total_eur),
        "currency": "eur",
        "payment_status": "initiated",
        "status": "open",
        "connect_account": connect_acct if use_connect else None,
        "application_fee_cents": application_fee_cents,
        "metadata": {
            "type": "bundle_subscription",
            "creator_id": payload.creator_id,
            "months": payload.months,
            "connect": use_connect,
        },
        "created_at": now_utc().isoformat(),
    })
    return {"url": session_url, "session_id": session_id, "amount": total_eur, "months": payload.months, "direct_payout": use_connect}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    # Attach fidelity badge (based on lifetime_spent)
    user["badge"] = await _get_user_badge(user["user_id"])
    user["referral_code"] = user.get("referral_code")
    return user

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "").strip()
GOOGLE_OAUTH_ENABLED = bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)

@api_router.get("/auth/google/config")
async def google_oauth_config():
    """Tell the frontend which OAuth mode to use."""
    return {
        "direct": GOOGLE_OAUTH_ENABLED,
        "client_id": GOOGLE_CLIENT_ID if GOOGLE_OAUTH_ENABLED else None,
    }

@api_router.post("/auth/google/direct")
async def google_direct_login(request: Request, response: Response):
    """Direct Google OAuth flow: frontend sends {code, redirect_uri} obtained from
    Google's OAuth authorization code redirect. Backend exchanges code for tokens,
    verifies the id_token, upserts the user, issues our JWT."""
    if not GOOGLE_OAUTH_ENABLED:
        raise HTTPException(status_code=503, detail="Google OAuth non configuré")
    body = await request.json()
    code = body.get("code")
    redirect_uri = body.get("redirect_uri")
    if not code or not redirect_uri:
        raise HTTPException(status_code=400, detail="code et redirect_uri requis")

    # Exchange authorization code for tokens
    async with httpx.AsyncClient(timeout=15.0) as hc:
        token_res = await hc.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    if token_res.status_code != 200:
        err_text = token_res.text
        logger.warning("Google token exchange failed: %s", err_text)
        # Parse Google's error for a clearer message
        try:
            import json as _json
            err = _json.loads(err_text)
            detail = f"Google: {err.get('error', 'invalid')} — {err.get('error_description', 'vérifie que le redirect_uri est autorisé dans Google Cloud Console')}"
        except Exception:
            detail = "Échec Google OAuth (code invalide ou redirect_uri non autorisé)"
        raise HTTPException(status_code=401, detail=detail)
    tok = token_res.json()
    id_token = tok.get("id_token")
    if not id_token:
        raise HTTPException(status_code=401, detail="id_token manquant")

    # Verify id_token with Google's tokeninfo endpoint (simpler than local JWK verify)
    async with httpx.AsyncClient(timeout=10.0) as hc:
        v_res = await hc.get(f"https://oauth2.googleapis.com/tokeninfo?id_token={id_token}")
    if v_res.status_code != 200:
        raise HTTPException(status_code=401, detail="Impossible de vérifier le token Google")
    claims = v_res.json()
    if claims.get("aud") != GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=401, detail="Audience invalide")
    email = (claims.get("email") or "").lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email Google manquant")

    existing = await db.users.find_one({"email": email})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"avatar_url": claims.get("picture"), "provider": "google"}},
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        referral_code = _generate_referral_code()
        # Ensure unique
        for _ in range(5):
            if not await db.users.find_one({"referral_code": referral_code}):
                break
            referral_code = _generate_referral_code()
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": claims.get("name") or email.split("@")[0],
            "password_hash": None,
            "role": "fan",
            "age_verified": False,
            "avatar_url": claims.get("picture"),
            "provider": "google",
            "referral_code": referral_code,
            "created_at": now_utc().isoformat(),
        })
        await db.wallets.insert_one({
            "user_id": user_id, "coin_balance": 0,
            "lifetime_spent": 0, "lifetime_earned": 0,
        })

    access = create_access_token(user_id, email)
    refresh = create_refresh_token(user_id)
    set_auth_cookies(response, access, refresh)
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return {"user": user, "access_token": access, "refresh_token": refresh}

@api_router.post("/auth/google/callback")
async def google_callback(request: Request, response: Response):
    """Exchange Emergent session_id for our JWT cookies + upsert user."""
    body = await request.json()
    session_id = body.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id manquant")

    async with httpx.AsyncClient(timeout=10.0) as hc:
        r = await hc.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Échec de l'authentification Google")
    data = r.json()
    email = (data.get("email") or "").lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email Google manquant")

    existing = await db.users.find_one({"email": email})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"avatar_url": data.get("picture"), "provider": "google"}},
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": data.get("name") or email.split("@")[0],
            "password_hash": None,
            "role": "fan",
            "age_verified": False,
            "avatar_url": data.get("picture"),
            "provider": "google",
            "created_at": now_utc().isoformat(),
        })

    access = create_access_token(user_id, email)
    refresh = create_refresh_token(user_id)
    set_auth_cookies(response, access, refresh)
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return {"user": user, "access_token": access, "refresh_token": refresh}

# -------- Creators --------
@api_router.get("/creators")
async def list_creators(limit: int = 20, trending: bool = False):
    now_iso = now_utc().isoformat()
    # Featured creators first (from the weekly challenge), then trending/others
    featured = await db.creators.find(
        {"featured_until": {"$gt": now_iso}},
        {"_id": 0},
    ).sort("featured_until", -1).to_list(length=limit)
    featured_ids = {c["creator_id"] for c in featured}
    for c in featured:
        c["is_featured"] = True
    remaining = limit - len(featured)
    if remaining > 0:
        q = {"creator_id": {"$nin": list(featured_ids)}} if featured_ids else {}
        cursor = db.creators.find(q, {"_id": 0})
        if trending:
            cursor = cursor.sort("subscribers_count", -1)
        others = await cursor.to_list(length=remaining)
        for c in others:
            c["is_featured"] = False
        return featured + others
    return featured

@api_router.get("/creators/{creator_id}")
async def get_creator(creator_id: str, user: Optional[dict] = Depends(optional_current_user)):
    creator = await db.creators.find_one({"creator_id": creator_id}, {"_id": 0})
    if not creator:
        # Fallback: maybe caller passed a handle
        creator = await db.creators.find_one({"handle": creator_id.lstrip("@").lower()}, {"_id": 0})
    if not creator:
        raise HTTPException(status_code=404, detail="Créateur introuvable")
    creator_id = creator["creator_id"]

    is_subscribed = False
    if user:
        sub = await db.subscriptions.find_one({
            "user_id": user["user_id"],
            "creator_id": creator_id,
            "status": "active",
        })
        is_subscribed = sub is not None
    creator["is_subscribed"] = is_subscribed

    # Attach active promotion + effective price
    promo = await _get_active_promotion(creator_id)
    creator["active_promo"] = promo
    creator["effective_price"] = _effective_price(creator, promo)

    # Attach content list (locked flags). Filter scheduled (not yet published) + expired.
    now_dt = now_utc()
    is_self = user and user["user_id"] == creator_id
    content_filter = {"creator_id": creator_id}
    if not is_self:
        # Viewers see only already-published + not-expired content + non-hidden
        content_filter["$and"] = [
            {"$or": [{"scheduled_at": {"$lte": now_dt}}, {"scheduled_at": {"$exists": False}}, {"scheduled_at": None}]},
            {"$or": [{"expires_at": {"$gt": now_dt}}, {"expires_at": {"$exists": False}}, {"expires_at": None}]},
            {"hidden_by_moderation": {"$ne": True}},
        ]
    contents = await db.content.find(content_filter, {"_id": 0}).sort("created_at", -1).to_list(length=100)
    unlocked_ids = set()
    liked_ids = set()
    if user:
        ups = await db.unlocks.find({"user_id": user["user_id"]}, {"_id": 0, "content_id": 1}).to_list(length=500)
        unlocked_ids = {u["content_id"] for u in ups}
        likes = await db.content_likes.find({"user_id": user["user_id"]}, {"_id": 0, "content_id": 1}).to_list(length=500)
        liked_ids = {l["content_id"] for l in likes}
    for c in contents:
        # ISO-format datetime fields for JSON
        for f in ("scheduled_at", "expires_at"):
            if isinstance(c.get(f), datetime):
                c[f] = c[f].isoformat()
        if not c.get("is_premium"):
            c["is_unlocked"] = True
        elif c["content_id"] in unlocked_ids:
            c["is_unlocked"] = True
        elif is_subscribed and c.get("included_in_subscription", True):
            # Subscribers get all "included in subscription" content for free.
            # Default True when the field is missing (legacy content behaves as before).
            c["is_unlocked"] = True
        else:
            c["is_unlocked"] = False
        c["is_liked"] = c["content_id"] in liked_ids
        c["likes_count"] = int(c.get("likes_count") or 0)
    creator["content"] = contents
    return creator

@api_router.post("/creators/me/become")
async def become_creator(payload: BecomeCreatorIn, request: Request, user: dict = Depends(get_current_user)):
    """Upgrade an existing fan account to a creator account in one click.
    Pre-fills display_name/handle from user data if missing.
    Idempotent — returns the existing creator profile if already a creator.

    Requires `terms_accepted=true` (proof of consent to CGU + AUP). The acceptance
    timestamp, IP and policy versions are persisted on the user doc for legal evidence."""
    existing = await db.creators.find_one({"creator_id": user["user_id"]}, {"_id": 0})
    if existing:
        # Already a creator — just ensure role is correct
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"role": "creator"}})
        return {"ok": True, "creator": existing, "already_creator": True}

    if not payload.terms_accepted:
        raise HTTPException(
            status_code=400,
            detail="Tu dois accepter les Conditions d'utilisation et la Politique d'utilisation acceptable pour devenir créatrice.",
        )

    # Generate display_name + handle
    display_name = (payload.display_name or user.get("name") or user.get("email", "").split("@")[0] or "Créatrice").strip()
    raw_handle = (payload.handle or user.get("name") or user.get("email", "").split("@")[0] or f"user_{user['user_id'][-6:]}")
    handle = ''.join(c for c in raw_handle.lower() if c.isalnum() or c == '_')[:24] or f"user_{user['user_id'][-6:]}"

    # Ensure handle is unique
    base_handle = handle
    i = 1
    while await db.creators.find_one({"handle": handle}, {"_id": 0}):
        i += 1
        handle = f"{base_handle}{i}"[:30]

    # Capture legal acceptance proof (timestamp + IP + UA + policy version)
    accepted_at = now_utc().isoformat()
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent", "")[:300]
    legal_consent = {
        "creator_terms_accepted": True,
        "creator_terms_accepted_at": accepted_at,
        "creator_terms_accepted_ip": client_ip,
        "creator_terms_accepted_ua": user_agent,
        "creator_terms_version": "2026-04-29",  # bump when CGU/AUP change substantially
        "creator_aup_version": "2026-04-29",
    }

    creator_doc = {
        "creator_id": user["user_id"],
        "user_id": user["user_id"],
        "display_name": display_name,
        "handle": handle,
        "bio": "",
        "subscription_price": 9.99,
        "avatar_url": user.get("avatar_url"),
        "cover_url": None,
        "tags": [],
        "total_earned": 0.0,
        "subscribers_count": 0,
        "created_at": now_utc().isoformat(),
        **{k: v for k, v in legal_consent.items() if not k.startswith("creator_terms_accepted_") or k == "creator_terms_accepted_at"},
    }
    await db.creators.insert_one(creator_doc)
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"role": "creator", **legal_consent}},
    )
    creator_doc.pop("_id", None)
    return {"ok": True, "creator": creator_doc, "already_creator": False}

@api_router.post("/creators/me/setup")
async def setup_creator(payload: CreatorCreate, user: dict = Depends(get_current_user)):
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"role": "creator"}})
    update = {
        "display_name": payload.display_name,
        "handle": payload.handle,
        "bio": payload.bio,
        "subscription_price": payload.subscription_price,
        "cover_url": payload.cover_url,
        "avatar_url": payload.avatar_url,
        "tags": payload.tags,
    }
    await db.creators.update_one(
        {"creator_id": user["user_id"]},
        {"$set": update,
         "$setOnInsert": {
             "creator_id": user["user_id"],
             "user_id": user["user_id"],
             "total_earned": 0.0,
             "subscribers_count": 0,
             "created_at": now_utc().isoformat(),
         }},
        upsert=True,
    )
    return {"ok": True}

@api_router.patch("/creators/me")
async def update_creator(payload: CreatorUpdate, user: dict = Depends(get_current_user)):
    """Edit creator profile (only provided fields are updated)."""
    existing = await db.creators.find_one({"creator_id": user["user_id"]}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Profil créatrice introuvable")
    update = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if not update:
        return existing
    # Handle unique handle
    if "handle" in update and update["handle"] != existing.get("handle"):
        dup = await db.creators.find_one({"handle": update["handle"]}, {"_id": 0})
        if dup and dup.get("creator_id") != user["user_id"]:
            raise HTTPException(status_code=400, detail="Ce pseudo est déjà utilisé")
    if "subscription_price" in update and update["subscription_price"] < 0:
        raise HTTPException(status_code=400, detail="Prix invalide")
    update["updated_at"] = now_utc().isoformat()
    await db.creators.update_one({"creator_id": user["user_id"]}, {"$set": update})
    # Also sync display_name to user
    if "display_name" in update:
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"name": update["display_name"]}},
        )
    if "avatar_url" in update:
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"avatar_url": update["avatar_url"]}},
        )
    refreshed = await db.creators.find_one({"creator_id": user["user_id"]}, {"_id": 0})
    return refreshed

# -------- Stripe Connect Express (creator payouts) --------
async def _refresh_connect_account_status(creator_id: str, account_id: str) -> dict:
    """Fetch latest status from Stripe and persist to db.creators.
    Returns the connect status dict."""
    try:
        with _with_direct_stripe_api():
            acct_obj = stripe_sdk.Account.retrieve(account_id, api_key=STRIPE_API_KEY)
        acct = acct_obj.to_dict() if hasattr(acct_obj, "to_dict") else dict(acct_obj)
    except Exception as e:
        logger.warning("Stripe Connect Account retrieve failed %s: %s", account_id, e)
        return {
            "connected": True, "account_id": account_id,
            "charges_enabled": False, "payouts_enabled": False,
            "details_submitted": False, "requirements_due": [],
            "error": str(e),
        }
    requirements = acct.get("requirements") or {}
    if hasattr(requirements, "to_dict"):
        requirements = requirements.to_dict()
    status = {
        "stripe_account_charges_enabled": bool(acct.get("charges_enabled")),
        "stripe_account_payouts_enabled": bool(acct.get("payouts_enabled")),
        "stripe_account_details_submitted": bool(acct.get("details_submitted")),
        "stripe_account_requirements": list(requirements.get("currently_due") or []),
        "stripe_account_updated_at": now_utc().isoformat(),
    }
    await db.creators.update_one({"creator_id": creator_id}, {"$set": status})
    return {
        "connected": True,
        "account_id": account_id,
        "charges_enabled": status["stripe_account_charges_enabled"],
        "payouts_enabled": status["stripe_account_payouts_enabled"],
        "details_submitted": status["stripe_account_details_submitted"],
        "requirements_due": status["stripe_account_requirements"],
    }

class ConnectOnboardIn(BaseModel):
    return_url: str  # frontend URL where Stripe redirects after onboarding complete
    refresh_url: Optional[str] = None  # frontend URL if the link expires; defaults to return_url

@api_router.post("/creators/me/stripe-connect/onboard")
async def stripe_connect_onboard(payload: ConnectOnboardIn, request: Request, user: dict = Depends(get_current_user)):
    """Create an Express connected account (if missing) and return an AccountLink URL
    for the creator to complete onboarding (KYC, bank details, etc.). Idempotent."""
    if not _stripe_live_enabled():
        raise HTTPException(status_code=503, detail="Stripe non configuré en mode live")
    creator = await db.creators.find_one({"creator_id": user["user_id"]}, {"_id": 0})
    if not creator:
        raise HTTPException(status_code=403, detail="Compte créatrice requis")
    account_id = creator.get("stripe_account_id")
    if not account_id:
        # Create a fresh Express account for this creator
        try:
            with _with_direct_stripe_api():
                acct = stripe_sdk.Account.create(
                    type="express",
                    country="FR",
                    email=user.get("email"),
                    capabilities={
                        "card_payments": {"requested": True},
                        "transfers": {"requested": True},
                    },
                    business_type="individual",
                    metadata={
                        "user_id": user["user_id"],
                        "creator_id": user["user_id"],
                        "handle": creator.get("handle") or "",
                    },
                    api_key=STRIPE_API_KEY,
                )
        except Exception as e:
            logger.exception("Stripe Connect account create failed: %s", e)
            raise HTTPException(status_code=502, detail=f"Erreur Stripe Connect: {str(e)}")
        account_id = acct["id"]
        await db.creators.update_one(
            {"creator_id": user["user_id"]},
            {"$set": {
                "stripe_account_id": account_id,
                "stripe_account_created_at": now_utc().isoformat(),
                "stripe_account_charges_enabled": False,
                "stripe_account_payouts_enabled": False,
                "stripe_account_details_submitted": False,
            }},
        )
    # Generate onboarding link — normalize return/refresh to a trusted origin so Stripe
    # redirects back to meandyou.fans (not preview) regardless of what the client sent.
    def _as_path(u: str) -> str:
        from urllib.parse import urlparse
        try:
            p = urlparse(u or "")
            return (p.path or "/") + (("?" + p.query) if p.query else "") + (("#" + p.fragment) if p.fragment else "")
        except Exception:
            return "/dashboard?stripe_connect=return"
    origin = _normalize_origin(None, request)
    return_url = origin + _as_path(payload.return_url)
    refresh_url = origin + _as_path(payload.refresh_url or payload.return_url)
    try:
        with _with_direct_stripe_api():
            link_obj = stripe_sdk.AccountLink.create(
                account=account_id,
                refresh_url=refresh_url,
                return_url=return_url,
                type="account_onboarding",
                api_key=STRIPE_API_KEY,
            )
        link = link_obj.to_dict() if hasattr(link_obj, "to_dict") else dict(link_obj)
    except Exception as e:
        logger.exception("Stripe AccountLink create failed: %s", e)
        raise HTTPException(status_code=502, detail=f"Erreur onboarding Stripe: {str(e)}")
    return {"url": link["url"], "expires_at": link.get("expires_at"), "account_id": account_id}

@api_router.get("/creators/me/stripe-connect/status")
async def stripe_connect_status(user: dict = Depends(get_current_user)):
    creator = await db.creators.find_one({"creator_id": user["user_id"]}, {"_id": 0})
    if not creator:
        raise HTTPException(status_code=403, detail="Compte créatrice requis")
    account_id = creator.get("stripe_account_id")
    if not account_id:
        return {"connected": False, "charges_enabled": False, "payouts_enabled": False,
                "details_submitted": False, "requirements_due": []}
    # Live refresh from Stripe
    return await _refresh_connect_account_status(user["user_id"], account_id)

@api_router.post("/creators/me/stripe-connect/dashboard-link")
async def stripe_connect_dashboard_link(user: dict = Depends(get_current_user)):
    """Return a single-use login link for the creator to access their Express dashboard."""
    creator = await db.creators.find_one({"creator_id": user["user_id"]}, {"_id": 0})
    if not creator or not creator.get("stripe_account_id"):
        raise HTTPException(status_code=400, detail="Compte Stripe Connect non activé")
    try:
        with _with_direct_stripe_api():
            link_obj = stripe_sdk.Account.create_login_link(
                creator["stripe_account_id"], api_key=STRIPE_API_KEY,
            )
        link = link_obj.to_dict() if hasattr(link_obj, "to_dict") else dict(link_obj)
    except Exception as e:
        logger.exception("Stripe login link failed: %s", e)
        raise HTTPException(status_code=502, detail=f"Erreur Stripe: {str(e)}")
    return {"url": link["url"]}

@api_router.post("/creators/me/content")
async def add_content(payload: ContentCreate, user: dict = Depends(get_current_user)):
    creator = await db.creators.find_one({"creator_id": user["user_id"]}, {"_id": 0})
    if not creator:
        raise HTTPException(status_code=403, detail="Compte créateur requis")
    content_id = f"ct_{uuid.uuid4().hex[:12]}"
    # Infer content_type from media_url extension if not provided
    content_type = payload.content_type
    if not content_type or content_type not in ("image", "video"):
        url_lower = (payload.media_url or "").lower().split("?")[0]
        content_type = "video" if url_lower.endswith((".mp4", ".mov", ".webm", ".avi", ".mkv")) else "image"
    # Scheduled publish: default to now if not specified or past
    scheduled_at_dt = None
    if payload.scheduled_at:
        try:
            scheduled_at_dt = datetime.fromisoformat(payload.scheduled_at.replace("Z", "+00:00"))
            if scheduled_at_dt.tzinfo is None:
                scheduled_at_dt = scheduled_at_dt.replace(tzinfo=timezone.utc)
        except Exception:
            raise HTTPException(status_code=400, detail="scheduled_at invalide (ISO 8601)")
    # 24h expiry
    expires_at_dt = None
    if payload.expires_in_hours and payload.expires_in_hours > 0:
        hours = min(int(payload.expires_in_hours), 24 * 30)  # cap 30 days
        expires_at_dt = (scheduled_at_dt or now_utc()) + timedelta(hours=hours)
    doc = {
        "content_id": content_id,
        "creator_id": user["user_id"],
        "title": payload.title,
        "description": payload.description,
        "media_url": payload.media_url,
        "is_premium": payload.is_premium,
        "unlock_price": payload.unlock_price,
        "included_in_subscription": bool(payload.included_in_subscription),
        "content_type": content_type,
        "likes_count": 0,
        "views_count": 0,
        "unlocks_count": 0,
        "scheduled_at": (scheduled_at_dt or now_utc()),
        "expires_at": expires_at_dt,  # native datetime for TTL
        "created_at": now_utc().isoformat(),
    }
    await db.content.insert_one(doc)
    doc.pop("_id", None)
    # AI moderation: scan title + description (text-only, image scan is a future
    # extension via vision models). Runs asynchronously-ish via asyncio.create_task
    # so the API returns fast — verdicts arrive a couple seconds later.
    text_to_scan = " · ".join(filter(None, [doc.get("title"), doc.get("description")]))
    if text_to_scan:
        asyncio.create_task(_run_moderation_for_content(
            user_id=user["user_id"],
            content_id=doc["content_id"],
            text=text_to_scan,
        ))
    # Serialize datetime for JSON response
    if doc.get("scheduled_at"):
        doc["scheduled_at"] = doc["scheduled_at"].isoformat() if isinstance(doc["scheduled_at"], datetime) else doc["scheduled_at"]
    if doc.get("expires_at"):
        doc["expires_at"] = doc["expires_at"].isoformat() if isinstance(doc["expires_at"], datetime) else doc["expires_at"]
    return doc


async def _run_moderation_for_content(*, user_id: str, content_id: str, text: str):
    """Background helper that runs moderate_text and applies the verdict."""
    try:
        policy = await _get_mod_policy()
        if not policy.get("scan_content"):
            return
        verdict = await moderate_text(text, kind="content", creator_id=user_id)
        if not verdict:
            return
        await _record_mod_report(
            target_user_id=user_id, target_content_id=content_id,
            kind="content", source_text=text, verdict=verdict,
        )
        await _maybe_auto_apply_violation(
            target_user_id=user_id, target_content_id=content_id,
            verdict=verdict, policy=policy,
        )
    except Exception as e:
        logging.warning("Content moderation pipeline error: %s", e)


@api_router.delete("/creators/me/content/{content_id}")
async def delete_content(content_id: str, user: dict = Depends(get_current_user)):
    """Creator can delete their own post. Cascades to unlocks/likes."""
    doc = await db.content.find_one({"content_id": content_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Contenu introuvable")
    if doc["creator_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Accès interdit")
    await db.content.delete_one({"content_id": content_id})
    await db.unlocks.delete_many({"content_id": content_id})
    await db.content_likes.delete_many({"content_id": content_id})
    return {"ok": True}


class ContentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    is_premium: Optional[bool] = None
    unlock_price: Optional[float] = None
    included_in_subscription: Optional[bool] = None
    scheduled_at: Optional[str] = None  # ISO or empty string to clear
    expires_in_hours: Optional[int] = None  # set to -1 to clear (remove expiry)


@api_router.patch("/creators/me/content/{content_id}")
async def update_content(content_id: str, payload: ContentUpdate, user: dict = Depends(get_current_user)):
    """Creator updates their own post. Media URL is immutable (re-upload means a new post)."""
    doc = await db.content.find_one({"content_id": content_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Contenu introuvable")
    if doc["creator_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Accès interdit")
    updates: Dict[str, object] = {}
    unset: Dict[str, str] = {}
    for field in ("title", "description", "is_premium", "included_in_subscription"):
        v = getattr(payload, field)
        if v is not None:
            updates[field] = v
    if payload.unlock_price is not None:
        updates["unlock_price"] = max(0.0, float(payload.unlock_price))
    if payload.scheduled_at is not None:
        if payload.scheduled_at == "":
            unset["scheduled_at"] = ""
        else:
            try:
                dt = datetime.fromisoformat(payload.scheduled_at.replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                updates["scheduled_at"] = dt
            except Exception:
                raise HTTPException(status_code=400, detail="scheduled_at invalide (ISO 8601)")
    if payload.expires_in_hours is not None:
        if payload.expires_in_hours < 0:
            unset["expires_at"] = ""
        else:
            base = updates.get("scheduled_at") or doc.get("scheduled_at") or now_utc()
            if isinstance(base, str):
                try:
                    base = datetime.fromisoformat(base.replace("Z", "+00:00"))
                    if base.tzinfo is None:
                        base = base.replace(tzinfo=timezone.utc)
                except Exception:
                    base = now_utc()
            updates["expires_at"] = base + timedelta(hours=min(int(payload.expires_in_hours), 24 * 30))
    if updates or unset:
        ops: Dict[str, object] = {}
        if updates:
            ops["$set"] = {**updates, "updated_at": now_utc().isoformat()}
        if unset:
            ops["$unset"] = unset
        await db.content.update_one({"content_id": content_id}, ops)
    fresh = await db.content.find_one({"content_id": content_id}, {"_id": 0})
    for f in ("scheduled_at", "expires_at"):
        if isinstance(fresh.get(f), datetime):
            fresh[f] = fresh[f].isoformat()
    return fresh


# -------- Likes --------
@api_router.post("/content/{content_id}/like")
async def like_content(content_id: str, user: dict = Depends(get_current_user)):
    content = await db.content.find_one({"content_id": content_id}, {"_id": 0})
    if not content:
        raise HTTPException(status_code=404, detail="Contenu introuvable")
    # Upsert — idempotent
    res = await db.content_likes.update_one(
        {"user_id": user["user_id"], "content_id": content_id},
        {"$setOnInsert": {
            "user_id": user["user_id"],
            "content_id": content_id,
            "creator_id": content["creator_id"],
            "created_at": now_utc().isoformat(),
        }},
        upsert=True,
    )
    if res.upserted_id is not None:
        await db.content.update_one({"content_id": content_id}, {"$inc": {"likes_count": 1}})
    likes = await db.content.find_one({"content_id": content_id}, {"_id": 0, "likes_count": 1})
    return {"ok": True, "is_liked": True, "likes_count": int((likes or {}).get("likes_count") or 0)}


@api_router.delete("/content/{content_id}/like")
async def unlike_content(content_id: str, user: dict = Depends(get_current_user)):
    res = await db.content_likes.delete_one({"user_id": user["user_id"], "content_id": content_id})
    if res.deleted_count > 0:
        await db.content.update_one({"content_id": content_id}, {"$inc": {"likes_count": -1}})
    likes = await db.content.find_one({"content_id": content_id}, {"_id": 0, "likes_count": 1})
    count = max(0, int((likes or {}).get("likes_count") or 0))
    return {"ok": True, "is_liked": False, "likes_count": count}


@api_router.post("/content/{content_id}/bookmark")
async def bookmark_content(content_id: str, user: dict = Depends(get_current_user)):
    content = await db.content.find_one({"content_id": content_id}, {"_id": 0})
    if not content:
        raise HTTPException(status_code=404, detail="Contenu introuvable")
    await db.content_bookmarks.update_one(
        {"user_id": user["user_id"], "content_id": content_id},
        {"$setOnInsert": {
            "user_id": user["user_id"],
            "content_id": content_id,
            "creator_id": content["creator_id"],
            "created_at": now_utc().isoformat(),
        }},
        upsert=True,
    )
    return {"ok": True, "is_bookmarked": True}


@api_router.delete("/content/{content_id}/bookmark")
async def unbookmark_content(content_id: str, user: dict = Depends(get_current_user)):
    await db.content_bookmarks.delete_one({"user_id": user["user_id"], "content_id": content_id})
    return {"ok": True, "is_bookmarked": False}


@api_router.get("/users/me/bookmarks")
async def my_bookmarks(user: dict = Depends(get_current_user)):
    rows = await db.content_bookmarks.find(
        {"user_id": user["user_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(length=200)
    items = []
    for r in rows:
        c = await db.content.find_one({"content_id": r["content_id"]}, {"_id": 0})
        if c:
            items.append({
                "content_id": c["content_id"],
                "thumbnail_url": c.get("thumbnail_url") or c.get("media_url"),
                "title": c.get("title"),
                "creator_id": c.get("creator_id"),
                "bookmarked_at": r["created_at"],
            })
    return {"items": items}




# -------- Analytics (creator) --------
@api_router.get("/creators/me/analytics")
async def creator_analytics(days: int = 30, user: dict = Depends(get_current_user)):
    """Return 30-day analytics for the creator dashboard.
    Includes: earnings timeline, subscribers growth, top posts by unlocks & likes,
    totals (tips, unlocks, subscription earnings)."""
    creator = await db.creators.find_one({"creator_id": user["user_id"]}, {"_id": 0})
    if not creator:
        raise HTTPException(status_code=403, detail="Compte créatrice requis")
    days = max(1, min(int(days), 90))
    since_dt = now_utc() - timedelta(days=days)
    since_iso = since_dt.isoformat()
    # Earnings per day (coin_transactions credits)
    pipeline = [
        {"$match": {
            "user_id": user["user_id"],
            "delta": {"$gt": 0},
            "reason": {"$in": ["subscription_earn", "tip_earn", "unlock_earn", "live_ppv_earn", "custom_request_earn"]},
            "created_at": {"$gte": since_iso},
        }},
        {"$project": {
            "day": {"$substr": ["$created_at", 0, 10]},
            "delta": 1, "reason": 1,
        }},
        {"$group": {
            "_id": {"day": "$day", "reason": "$reason"},
            "coins": {"$sum": "$delta"},
        }},
    ]
    earnings_by_day: Dict[str, Dict[str, int]] = {}
    async for row in db.coin_transactions.aggregate(pipeline):
        day = row["_id"]["day"]
        reason = row["_id"]["reason"]
        earnings_by_day.setdefault(day, {"tip_earn": 0, "unlock_earn": 0, "subscription_earn": 0, "live_ppv_earn": 0, "custom_request_earn": 0})
        earnings_by_day[day][reason] = int(row["coins"])
    # Build timeline for every day in range
    timeline = []
    for i in range(days):
        d = (now_utc() - timedelta(days=days - 1 - i)).strftime("%Y-%m-%d")
        row = earnings_by_day.get(d, {})
        total = sum(row.values())
        timeline.append({"day": d, "coins": int(total), **{k: int(row.get(k, 0)) for k in ("tip_earn", "unlock_earn", "subscription_earn", "live_ppv_earn", "custom_request_earn")}})
    # Totals
    totals = {"tip_earn": 0, "unlock_earn": 0, "subscription_earn": 0, "live_ppv_earn": 0, "custom_request_earn": 0}
    for row in earnings_by_day.values():
        for k, v in row.items():
            totals[k] = totals.get(k, 0) + v
    totals["all"] = sum(totals.values())
    # Top posts by unlocks
    top_posts = await db.content.find(
        {"creator_id": user["user_id"]},
        {"_id": 0, "content_id": 1, "title": 1, "media_url": 1, "content_type": 1, "likes_count": 1, "unlock_price": 1, "created_at": 1},
    ).sort("likes_count", -1).limit(5).to_list(length=5)
    # Count unlocks per content
    unlock_agg = await db.unlocks.aggregate([
        {"$match": {"creator_id": user["user_id"]}},
        {"$group": {"_id": "$content_id", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 50},
    ]).to_list(length=50)
    unlock_counts = {row["_id"]: row["count"] for row in unlock_agg}
    for p in top_posts:
        p["unlocks_count"] = int(unlock_counts.get(p["content_id"], 0))
        p["likes_count"] = int(p.get("likes_count") or 0)
    # Subscribers history (new subs per day)
    subs_pipeline = [
        {"$match": {"creator_id": user["user_id"], "created_at": {"$gte": since_iso}}},
        {"$project": {"day": {"$substr": ["$created_at", 0, 10]}}},
        {"$group": {"_id": "$day", "count": {"$sum": 1}}},
    ]
    new_subs_by_day: Dict[str, int] = {}
    async for row in db.subscriptions.aggregate(subs_pipeline):
        new_subs_by_day[row["_id"]] = int(row["count"])
    subs_timeline = []
    for i in range(days):
        d = (now_utc() - timedelta(days=days - 1 - i)).strftime("%Y-%m-%d")
        subs_timeline.append({"day": d, "new_subscribers": int(new_subs_by_day.get(d, 0))})
    active_subs = await db.subscriptions.count_documents({
        "creator_id": user["user_id"], "status": "active"
    })
    # Total likes across posts
    total_likes_agg = await db.content.aggregate([
        {"$match": {"creator_id": user["user_id"]}},
        {"$group": {"_id": None, "total": {"$sum": "$likes_count"}}},
    ]).to_list(length=1)
    total_likes = int((total_likes_agg[0] or {}).get("total", 0)) if total_likes_agg else 0
    return {
        "days": days,
        "active_subscribers": active_subs,
        "total_likes": total_likes,
        "totals_coins": totals,
        "totals_eur": {k: round(coins_to_eur(v), 2) for k, v in totals.items()},
        "earnings_timeline": timeline,
        "subscribers_timeline": subs_timeline,
        "top_posts": top_posts,
    }


# -------- Push notifications (Web Push, VAPID) --------
class PushSubscribeIn(BaseModel):
    endpoint: str
    keys: Dict[str, str]


@api_router.get("/push/vapid-public-key")
async def push_vapid_public_key():
    return {"public_key": os.environ.get("VAPID_PUBLIC_KEY", ""), "enabled": bool(os.environ.get("VAPID_PUBLIC_KEY"))}


@api_router.post("/push/subscribe")
async def push_subscribe(payload: PushSubscribeIn, user: dict = Depends(get_current_user)):
    """Store the PushSubscription sent by the browser.
    The frontend should call this after subscribing via the ServiceWorker."""
    if not payload.endpoint or not payload.keys.get("p256dh") or not payload.keys.get("auth"):
        raise HTTPException(status_code=400, detail="Subscription invalide")
    doc = {
        "user_id": user["user_id"],
        "endpoint": payload.endpoint,
        "keys": dict(payload.keys),
        "created_at": now_utc().isoformat(),
        "updated_at": now_utc().isoformat(),
    }
    await db.push_subscriptions.update_one(
        {"user_id": user["user_id"], "endpoint": payload.endpoint},
        {"$set": doc}, upsert=True,
    )
    return {"ok": True}


@api_router.post("/push/unsubscribe")
async def push_unsubscribe(payload: Dict[str, str], user: dict = Depends(get_current_user)):
    endpoint = payload.get("endpoint")
    if endpoint:
        await db.push_subscriptions.delete_one({"user_id": user["user_id"], "endpoint": endpoint})
    else:
        await db.push_subscriptions.delete_many({"user_id": user["user_id"]})
    return {"ok": True}


async def _send_web_push(user_id: str, title: str, body: str, url: Optional[str] = None):
    """Fire-and-forget web push to all subscriptions of a user. Safe no-op if VAPID not configured."""
    try:
        from pywebpush import webpush, WebPushException  # lazy import
    except Exception:
        return
    public = os.environ.get("VAPID_PUBLIC_KEY", "").strip()
    private = os.environ.get("VAPID_PRIVATE_KEY", "").strip()
    if not public or not private:
        return
    claims = {"sub": f"mailto:{os.environ.get('VAPID_CLAIM_EMAIL', 'noreply@meandyou.fans')}"}
    subs = await db.push_subscriptions.find({"user_id": user_id}, {"_id": 0}).to_list(length=20)
    data = json.dumps({"title": title, "body": body, "url": url or "/"})
    dead = []
    for sub in subs:
        try:
            webpush(
                subscription_info={"endpoint": sub["endpoint"], "keys": sub["keys"]},
                data=data,
                vapid_private_key=private,
                vapid_claims=claims,
                timeout=5,
            )
        except WebPushException as e:
            status = getattr(e.response, "status_code", None)
            if status in (404, 410):  # expired / gone
                dead.append(sub["endpoint"])
            else:
                logger.warning("web push failed: %s", e)
        except Exception as e:
            logger.warning("web push error: %s", e)
    for endpoint in dead:
        await db.push_subscriptions.delete_one({"user_id": user_id, "endpoint": endpoint})


@api_router.get("/creators/me/dashboard")
async def creator_dashboard(user: dict = Depends(get_current_user)):
    creator = await db.creators.find_one({"creator_id": user["user_id"]}, {"_id": 0})
    if not creator:
        raise HTTPException(status_code=403, detail="Compte créatrice requis")
    subs_count = await db.subscriptions.count_documents({
        "creator_id": user["user_id"], "status": "active"
    })
    # Monthly coin earnings (from coin_transactions credits this month)
    first_of_month = now_utc().replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    monthly_coins = 0
    async for tx in db.coin_transactions.find({
        "user_id": user["user_id"],
        "delta": {"$gt": 0},
        "reason": {"$in": ["subscription_earn", "tip_earn", "unlock_earn"]},
        "created_at": {"$gte": first_of_month},
    }, {"_id": 0}):
        monthly_coins += int(tx.get("delta", 0))
    content_count = await db.content.count_documents({"creator_id": user["user_id"]})
    wallet = await _get_wallet(user["user_id"])
    total_earned_coins = int(creator.get("total_earned_coins", 0))
    return {
        "subscribers_count": subs_count,
        "content_count": content_count,
        "monthly_earned_coins": monthly_coins,
        "total_earned_coins": total_earned_coins,
        "wallet_balance_coins": wallet["coin_balance"],
        "monthly_earned_eur": round(coins_to_eur(monthly_coins) * CREATOR_PAYOUT_RATIO, 2),
        "total_earned_eur": round(coins_to_eur(total_earned_coins) * CREATOR_PAYOUT_RATIO, 2),
        "available_eur": round(coins_to_eur(wallet["coin_balance"]) * CREATOR_PAYOUT_RATIO, 2),
        "payout_min_coins": PAYOUT_MIN_COINS,
        "creator": creator,
    }

# -------- Messaging --------
@api_router.get("/messages/threads")
async def list_threads(user: dict = Depends(get_current_user)):
    # Distinct creators messaged
    threads = await db.messages.aggregate([
        {"$match": {"$or": [{"fan_id": user["user_id"]}, {"creator_id": user["user_id"]}]}},
        {"$sort": {"created_at": -1}},
        {"$group": {
            "_id": {"creator_id": "$creator_id", "fan_id": "$fan_id"},
            "last_body": {"$first": "$body"},
            "last_at": {"$first": "$created_at"},
        }},
    ]).to_list(length=200)
    out = []
    for t in threads:
        partner_id = t["_id"]["creator_id"] if user["user_id"] == t["_id"]["fan_id"] else t["_id"]["fan_id"]
        partner = await db.users.find_one({"user_id": partner_id}, {"_id": 0, "password_hash": 0})
        creator = await db.creators.find_one({"creator_id": t["_id"]["creator_id"]}, {"_id": 0})
        out.append({
            "creator_id": t["_id"]["creator_id"],
            "fan_id": t["_id"]["fan_id"],
            "partner": partner,
            "creator": creator,
            "last_body": t["last_body"],
            "last_at": t["last_at"],
        })
    return out

@api_router.get("/messages/{creator_id}")
async def thread_messages(creator_id: str, fan_id: Optional[str] = None,
                          user: dict = Depends(get_current_user)):
    """Return messages for a (creator_id, fan_id) thread.
    - Fan calling: thread is (creator_id, user.user_id)
    - Creator calling: must pass fan_id query param
    """
    if user["user_id"] == creator_id:
        if not fan_id:
            raise HTTPException(status_code=400, detail="fan_id requis pour la créatrice")
        target_fan = fan_id
    else:
        target_fan = user["user_id"]
    msgs = await db.messages.find(
        {"creator_id": creator_id, "fan_id": target_fan},
        {"_id": 0},
    ).sort("created_at", 1).to_list(length=500)
    # Annotate media paywall unlock state for each message
    locked_ids = [m["message_id"] for m in msgs if int(m.get("media_paywall_coins") or 0) > 0]
    unlocked_set = set()
    if locked_ids:
        unlocks = await db.message_unlocks.find(
            {"message_id": {"$in": locked_ids}, "user_id": user["user_id"]},
            {"_id": 0, "message_id": 1},
        ).to_list(length=1000)
        unlocked_set = {u["message_id"] for u in unlocks}
    for m in msgs:
        cost = int(m.get("media_paywall_coins") or 0)
        if cost <= 0:
            m["is_unlocked"] = True
        else:
            # Sender (creator) always has access; recipient fan must have unlocked
            if m.get("sender_id") == user["user_id"] or m["message_id"] in unlocked_set:
                m["is_unlocked"] = True
            else:
                m["is_unlocked"] = False
                m["media_url"] = None  # hide raw url until unlocked
    # Mark notifications related to this thread as read
    await db.notifications.update_many(
        {"user_id": user["user_id"], "kind": "message",
         "data.creator_id": creator_id, "data.fan_id": target_fan},
        {"$set": {"read": True}},
    )
    return msgs

@api_router.post("/messages")
async def send_message(payload: MessageIn, background: BackgroundTasks,
                       user: dict = Depends(get_current_user)):
    creator = await db.creators.find_one({"creator_id": payload.creator_id}, {"_id": 0})
    if not creator:
        raise HTTPException(status_code=404, detail="Créatrice introuvable")
    is_creator_reply = user["user_id"] == payload.creator_id
    if is_creator_reply:
        if not payload.fan_id:
            raise HTTPException(status_code=400, detail="fan_id requis pour répondre")
        fan_id = payload.fan_id
        recipient_id = fan_id
    else:
        fan_id = user["user_id"]
        recipient_id = payload.creator_id
    doc = {
        "message_id": f"msg_{uuid.uuid4().hex[:10]}",
        "creator_id": payload.creator_id,
        "fan_id": fan_id,
        "sender_id": user["user_id"],
        "body": payload.body,
        "media_url": payload.media_url,
        "media_paywall_coins": int(payload.media_paywall_coins or 0) if payload.media_url else 0,
        "kind": payload.kind if payload.kind in ("voice",) else None,
        "voice_duration_seconds": int(payload.voice_duration_seconds) if (payload.kind == "voice" and payload.voice_duration_seconds) else None,
        "created_at": now_utc().isoformat(),
    }
    await db.messages.insert_one(doc)
    doc.pop("_id", None)
    background.add_task(_notify_new_message, sender=user, recipient_id=recipient_id,
                        creator=creator, fan_id=fan_id, body=payload.body)
    return doc

@api_router.post("/messages/{creator_id}/reply")
async def creator_reply(creator_id: str, payload: MessageIn, fan_id: str,
                        background: BackgroundTasks,
                        user: dict = Depends(get_current_user)):
    if user["user_id"] != creator_id:
        raise HTTPException(status_code=403, detail="Interdit")
    payload.fan_id = fan_id
    payload.creator_id = creator_id
    return await send_message(payload, background, user)

# -------- Coin Wallet --------
async def _get_wallet(user_id: str) -> dict:
    w = await db.wallets.find_one({"user_id": user_id}, {"_id": 0})
    if not w:
        w = {
            "user_id": user_id,
            "coin_balance": 0,
            "lifetime_spent": 0,
            "lifetime_earned": 0,
            "created_at": now_utc().isoformat(),
        }
        await db.wallets.insert_one(dict(w))
    return w

async def _credit_wallet(user_id: str, coins: int, reason: str, related_id: str = None):
    if coins <= 0:
        return
    await _get_wallet(user_id)
    await db.wallets.update_one(
        {"user_id": user_id},
        {"$inc": {"coin_balance": coins, "lifetime_earned": coins}},
    )
    await db.coin_transactions.insert_one({
        "tx_id": f"ctx_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "delta": coins,
        "reason": reason,
        "related_id": related_id,
        "created_at": now_utc().isoformat(),
    })

async def _debit_wallet(user_id: str, coins: int, reason: str, related_id: str = None) -> bool:
    """Atomic debit. Returns True on success, False if insufficient balance."""
    if coins <= 0:
        return True
    await _get_wallet(user_id)
    res = await db.wallets.find_one_and_update(
        {"user_id": user_id, "coin_balance": {"$gte": coins}},
        {"$inc": {"coin_balance": -coins, "lifetime_spent": coins}},
    )
    if not res:
        return False
    await db.coin_transactions.insert_one({
        "tx_id": f"ctx_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "delta": -coins,
        "reason": reason,
        "related_id": related_id,
        "created_at": now_utc().isoformat(),
    })
    return True

def _generate_referral_code() -> str:
    """6-char uppercase alphanumeric (no ambiguous chars)."""
    import random
    chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(random.choices(chars, k=6))

async def _get_or_create_referral_code(user_id: str) -> str:
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if u and u.get("referral_code"):
        return u["referral_code"]
    # Generate unique
    for _ in range(12):
        code = _generate_referral_code()
        if not await db.users.find_one({"referral_code": code}):
            await db.users.update_one({"user_id": user_id}, {"$set": {"referral_code": code}})
            return code
    # Fallback: deterministic from user_id
    fallback = user_id[-6:].upper()
    await db.users.update_one({"user_id": user_id}, {"$set": {"referral_code": fallback}})
    return fallback

REFERRAL_BONUS_COINS = 100  # Awarded to BOTH referrer & new user after first top-up

# -------- Fidelity Badges --------
FIDELITY_TIERS = [
    {"tier": "vip",    "label": "VIP",    "min": 20000, "color": "#ffd700"},
    {"tier": "gold",   "label": "Gold",   "min": 5000,  "color": "#ffa500"},
    {"tier": "silver", "label": "Silver", "min": 1000,  "color": "#c0c0c0"},
    {"tier": "bronze", "label": "Bronze", "min": 200,   "color": "#cd7f32"},
]

def _badge_for_spent(lifetime_spent: int) -> Optional[dict]:
    for t in FIDELITY_TIERS:
        if lifetime_spent >= t["min"]:
            # Find next tier
            higher = [x for x in FIDELITY_TIERS if x["min"] > t["min"]]
            next_tier = min(higher, key=lambda x: x["min"]) if higher else None
            return {**t, "next_min": next_tier["min"] if next_tier else None, "next_label": next_tier["label"] if next_tier else None}
    return None

async def _get_user_badge(user_id: str) -> Optional[dict]:
    w = await db.wallets.find_one({"user_id": user_id}, {"_id": 0})
    spent = int((w or {}).get("lifetime_spent", 0))
    return _badge_for_spent(spent)

@api_router.get("/wallet")
async def wallet_get(user: dict = Depends(get_current_user)):
    w = await _get_wallet(user["user_id"])
    spent = int(w.get("lifetime_spent", 0))
    out = {
        "coin_balance": w["coin_balance"],
        "lifetime_spent": spent,
        "lifetime_earned": w.get("lifetime_earned", 0),
        "eur_equivalent": coins_to_eur(w["coin_balance"]),
        "badge": _badge_for_spent(spent),
    }
    return out

# -------- Referral endpoints --------
@api_router.get("/referral/me")
async def my_referral(user: dict = Depends(get_current_user)):
    code = await _get_or_create_referral_code(user["user_id"])
    # Count people who signed up with my code + how many completed the bonus
    signed_up = await db.users.count_documents({"referred_by": user["user_id"]})
    completed = await db.users.count_documents({
        "referred_by": user["user_id"],
        "referral_bonus_granted": True,
    })
    coins_earned = completed * REFERRAL_BONUS_COINS
    return {
        "code": code,
        "bonus_per_referral": REFERRAL_BONUS_COINS,
        "signed_up": signed_up,
        "completed": completed,
        "coins_earned": coins_earned,
    }

@api_router.get("/referral/validate/{code}")
async def validate_referral_code(code: str):
    code = (code or "").strip().upper()
    referrer = await db.users.find_one({"referral_code": code}, {"_id": 0, "user_id": 1, "name": 1})
    if not referrer:
        raise HTTPException(status_code=404, detail="Code de parrainage invalide")
    return {"valid": True, "referrer_name": referrer.get("name"), "bonus": REFERRAL_BONUS_COINS}

# -------- Top tippers (public per creator, 7 days) --------
@api_router.get("/creators/{handle}/top-tippers")
async def creator_top_tippers(handle: str, days: int = 7, limit: int = 3):
    creator = await db.creators.find_one({"handle": handle}, {"_id": 0})
    if not creator:
        raise HTTPException(status_code=404, detail="Créatrice introuvable")
    since = (now_utc() - timedelta(days=max(1, min(days, 30)))).isoformat()

    pipeline = [
        {"$match": {
            "reason": "tip_earn",
            "user_id": creator["creator_id"],
            "related_id": {"$ne": None},
            "created_at": {"$gte": since},
            "delta": {"$gt": 0},
        }},
        {"$group": {"_id": "$related_id", "total_coins": {"$sum": "$delta"}}},
        {"$sort": {"total_coins": -1}},
        {"$limit": max(1, min(limit, 10))},
    ]
    rows = await db.coin_transactions.aggregate(pipeline).to_list(length=limit)
    out = []
    for rank, row in enumerate(rows, start=1):
        fan_id = row["_id"]
        if not fan_id:
            continue
        u = await db.users.find_one({"user_id": fan_id}, {"_id": 0, "name": 1, "avatar_url": 1, "user_id": 1})
        if not u:
            continue
        badge = await _get_user_badge(fan_id)
        out.append({
            "rank": rank,
            "user_id": fan_id,
            "name": u.get("name") or "Anonyme",
            "avatar_url": u.get("avatar_url"),
            "total_coins": int(row["total_coins"]),
            "badge": badge,
        })
    return {"period_days": days, "top": out}


# -------- Promotions (creator subscription discounts) --------
async def _get_active_promotion(creator_id: str) -> Optional[dict]:
    now = now_utc().isoformat()
    promo = await db.promotions.find_one(
        {"creator_id": creator_id, "active": True, "ends_at": {"$gt": now}},
        {"_id": 0},
    )
    return promo

def _effective_price(creator: dict, promo: Optional[dict]) -> float:
    base = float(creator.get("subscription_price") or 0)
    if not promo:
        return base
    off = int(promo.get("percent_off") or 0)
    discounted = round(base * (100 - off) / 100, 2)
    return max(0.01, discounted)

@api_router.post("/creators/me/promotions")
async def create_promotion(payload: PromotionIn, user: dict = Depends(get_current_user)):
    creator = await db.creators.find_one({"creator_id": user["user_id"]}, {"_id": 0})
    if not creator:
        raise HTTPException(status_code=404, detail="Profil créatrice introuvable")
    # Deactivate previous active promos
    await db.promotions.update_many(
        {"creator_id": user["user_id"], "active": True},
        {"$set": {"active": False}},
    )
    now = now_utc()
    ends_at = now + timedelta(hours=payload.duration_hours)
    doc = {
        "promo_id": f"promo_{uuid.uuid4().hex[:12]}",
        "creator_id": user["user_id"],
        "percent_off": payload.percent_off,
        "label": payload.label or f"-{payload.percent_off}%",
        "active": True,
        "starts_at": now.isoformat(),
        "ends_at": ends_at.isoformat(),
        "created_at": now.isoformat(),
    }
    await db.promotions.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/creators/me/promotions")
async def my_promotions(user: dict = Depends(get_current_user)):
    items = await db.promotions.find({"creator_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(length=20)
    return items

@api_router.delete("/creators/me/promotions/{promo_id}")
async def stop_promotion(promo_id: str, user: dict = Depends(get_current_user)):
    res = await db.promotions.update_one(
        {"promo_id": promo_id, "creator_id": user["user_id"]},
        {"$set": {"active": False, "stopped_at": now_utc().isoformat()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Promotion introuvable")
    return {"ok": True}


# -------- Custom content requests --------
@api_router.post("/creators/{creator_id}/custom-request")
async def create_custom_request(creator_id: str, payload: CustomRequestIn, user: dict = Depends(get_current_user)):
    creator = await db.creators.find_one({"creator_id": creator_id}, {"_id": 0})
    if not creator:
        raise HTTPException(status_code=404, detail="Créatrice introuvable")
    if user["user_id"] == creator_id:
        raise HTTPException(status_code=400, detail="Impossible de te commander à toi-même")
    # Debit coins into escrow
    ok = await _debit_wallet(user["user_id"], payload.price_coins, reason="custom_request_escrow", related_id=creator_id)
    if not ok:
        w = await _get_wallet(user["user_id"])
        raise HTTPException(status_code=402, detail={"error": "insufficient_coins", "needed": payload.price_coins, "balance": w["coin_balance"]})
    req_id = f"cr_{uuid.uuid4().hex[:12]}"
    doc = {
        "request_id": req_id,
        "fan_id": user["user_id"],
        "creator_id": creator_id,
        "description": payload.description,
        "price_coins": payload.price_coins,
        "status": "pending",
        "delivery": None,
        "created_at": now_utc().isoformat(),
    }
    await db.custom_requests.insert_one(doc)
    await _create_notification(
        creator_id, "custom_request",
        f"Nouvelle commande personnalisée · {payload.price_coins} coins 💎",
        (payload.description or "")[:120],
        {"request_id": req_id, "price_coins": payload.price_coins},
    )
    doc.pop("_id", None)
    return doc


# ============================================================================
# AI FLYER GENERATION (creator-only)
# ============================================================================
@api_router.post("/creators/me/flyer")
async def creator_generate_flyer(
    phrase: str = Form(..., min_length=2, max_length=200),
    style: str = Form("apple"),
    photo: Optional[UploadFile] = File(None),
    user: dict = Depends(get_current_user),
):
    """Generate an AI poster for the authenticated creator.
    Inputs:
      - phrase: French headline shown on the poster
      - style:  apple | glamour | white
      - photo:  optional reference photo of the creator
    Returns: { url, filename, style }
    """
    if user.get("role") != "creator":
        raise HTTPException(status_code=403, detail="Réservé aux créatrices·eurs.")
    if style not in ("apple", "glamour", "white"):
        style = "apple"

    creator = await db.creators.find_one({"creator_id": user["user_id"]}, {"_id": 0})
    if not creator:
        raise HTTPException(status_code=404, detail="Profil créateur introuvable.")

    ref_bytes: Optional[bytes] = None
    if photo is not None and photo.filename:
        try:
            data = await photo.read()
            if len(data) > 8 * 1024 * 1024:  # 8MB cap to keep latency reasonable
                raise HTTPException(status_code=413, detail="Photo trop lourde (max 8 Mo).")
            if data:
                ref_bytes = data
        except HTTPException:
            raise
        except Exception:
            ref_bytes = None

    try:
        from flyers import generate_flyer
        result = await generate_flyer(
            creator_handle=creator.get("handle") or user["user_id"][:8],
            creator_name=creator.get("display_name") or "Créatrice",
            user_phrase=phrase.strip(),
            style=style,
            reference_bytes=ref_bytes,
        )
    except Exception as e:
        logging.exception("flyer gen failed: %s", e)
        raise HTTPException(status_code=502, detail=f"Génération IA impossible : {str(e)[:160]}")

    # Track for the dashboard "history" (last 12)
    rec = {
        "flyer_id": str(uuid4()),
        "creator_id": user["user_id"],
        "url": result["url"],
        "filename": result["filename"],
        "style": style,
        "phrase": phrase.strip(),
        "had_photo": ref_bytes is not None,
        "created_at": now_utc().isoformat(),
    }
    await db.flyers.insert_one(rec)
    rec.pop("_id", None)

    # Email the flyer to the creator (best-effort, doesn't block response)
    rec["emailed"] = False
    try:
        creator_email = (await db.users.find_one({"user_id": user["user_id"]}, {"email": 1}) or {}).get("email")
        if creator_email:
            from emails import send_with_attachments, _layout
            png_path = UPLOAD_DIR / result["filename"]
            png_bytes = png_path.read_bytes() if png_path.exists() else None
            if png_bytes:
                handle = creator.get("handle") or "creator"
                share_url = f"{_resolve_origin(request)}/c/{handle}" if False else f"https://meandyou.fans/c/{handle}"
                body_html = (
                    f"<p>Salut <strong>{creator.get('display_name', 'créatrice')}</strong>,</p>"
                    f"<p>Voici ton flyer fraîchement généré ✨</p>"
                    f"<p style=\"background:#1a1a1a;padding:14px 18px;border-radius:14px;font-style:italic;color:#fafafa;\">"
                    f"« {phrase.strip()} »</p>"
                    f"<p>Style : <strong>{style.title()}</strong>.</p>"
                    f"<p>Tu peux le télécharger en pièce jointe et le poster sur Insta, TikTok, Twitter "
                    f"avec ton lien <a href=\"{share_url}\" style=\"color:#E879F9\">{share_url}</a> en bio.</p>"
                )
                html = _layout(
                    title="Ton flyer est prêt 🎨",
                    preheader=phrase.strip()[:120],
                    body_html=body_html,
                    cta_text="Voir mon dashboard",
                    cta_url="https://meandyou.fans/dashboard",
                )
                ok = await send_with_attachments(
                    to=creator_email,
                    subject="Ton flyer me&you est prêt 🎨",
                    html=html,
                    attachments=[(result["filename"], png_bytes, "image/png")],
                )
                rec["emailed"] = bool(ok)
                if ok:
                    await db.flyers.update_one({"flyer_id": rec["flyer_id"]}, {"$set": {"emailed": True}})
    except Exception as e:
        logging.warning("flyer email failed: %s", e)

    return rec


@api_router.get("/creators/me/flyers")
async def creator_list_flyers(user: dict = Depends(get_current_user)):
    if user.get("role") != "creator":
        raise HTTPException(status_code=403, detail="Réservé aux créatrices·eurs.")
    items = await db.flyers.find(
        {"creator_id": user["user_id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(length=12)
    return {"items": items}


@api_router.delete("/creators/me/flyers/{flyer_id}")
async def creator_delete_flyer(flyer_id: str, user: dict = Depends(get_current_user)):
    rec = await db.flyers.find_one({"flyer_id": flyer_id, "creator_id": user["user_id"]})
    if not rec:
        raise HTTPException(status_code=404, detail="Flyer introuvable.")
    # Remove the file (best-effort)
    try:
        fp = UPLOAD_DIR / rec["filename"]
        if fp.exists():
            fp.unlink()
    except Exception:
        pass
    await db.flyers.delete_one({"flyer_id": flyer_id})
    return {"ok": True}



@api_router.get("/creators/me/custom-requests")
async def creator_custom_requests(status: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {"creator_id": user["user_id"]}
    if status:
        q["status"] = status
    items = await db.custom_requests.find(q, {"_id": 0}).sort("created_at", -1).to_list(length=60)
    # Attach fan basic info
    fan_ids = list({i["fan_id"] for i in items})
    fans = {u["user_id"]: u async for u in db.users.find({"user_id": {"$in": fan_ids}}, {"_id": 0, "user_id": 1, "name": 1, "avatar_url": 1})}
    for it in items:
        f = fans.get(it["fan_id"], {})
        it["fan"] = {"user_id": it["fan_id"], "name": f.get("name") or "Anonyme", "avatar_url": f.get("avatar_url")}
    return items

@api_router.get("/custom-requests/me")
async def fan_custom_requests(user: dict = Depends(get_current_user)):
    items = await db.custom_requests.find({"fan_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(length=40)
    creator_ids = list({i["creator_id"] for i in items})
    creators = {c["creator_id"]: c async for c in db.creators.find({"creator_id": {"$in": creator_ids}}, {"_id": 0, "creator_id": 1, "display_name": 1, "handle": 1, "avatar_url": 1})}
    for it in items:
        c = creators.get(it["creator_id"], {})
        it["creator"] = {"creator_id": it["creator_id"], "display_name": c.get("display_name") or "Créatrice", "handle": c.get("handle"), "avatar_url": c.get("avatar_url")}
    return items

@api_router.post("/custom-requests/{request_id}/respond")
async def respond_custom_request(request_id: str, payload: CustomRequestRespondIn, user: dict = Depends(get_current_user)):
    req = await db.custom_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Demande introuvable")
    if req["creator_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Accès interdit")
    if req["status"] != "pending":
        raise HTTPException(status_code=400, detail="Cette demande a déjà été traitée")
    if payload.action == "accept":
        await db.custom_requests.update_one({"request_id": request_id}, {"$set": {"status": "accepted", "accepted_at": now_utc().isoformat(), "reply_message": payload.reply_message}})
        await _create_notification(
            req["fan_id"], "custom_request",
            "Ta commande a été acceptée ✅",
            (payload.reply_message or "")[:120],
            {"request_id": request_id},
        )
        return {"ok": True, "status": "accepted"}
    if payload.action == "decline":
        # Refund fan
        await _credit_wallet(req["fan_id"], int(req["price_coins"]), reason="custom_request_refund", related_id=request_id)
        await db.custom_requests.update_one({"request_id": request_id}, {"$set": {"status": "declined", "declined_at": now_utc().isoformat(), "reply_message": payload.reply_message}})
        await _create_notification(
            req["fan_id"], "custom_request",
            f"Commande refusée — {req['price_coins']} coins remboursés",
            (payload.reply_message or "")[:120],
            {"request_id": request_id, "refunded": req["price_coins"]},
        )
        return {"ok": True, "status": "declined", "refunded": req["price_coins"]}
    raise HTTPException(status_code=400, detail="Action invalide")

@api_router.post("/custom-requests/{request_id}/deliver")
async def deliver_custom_request(request_id: str, payload: CustomRequestDeliverIn, user: dict = Depends(get_current_user)):
    req = await db.custom_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Demande introuvable")
    if req["creator_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Accès interdit")
    if req["status"] != "accepted":
        raise HTTPException(status_code=400, detail="Accepte la demande avant de livrer")
    price = int(req["price_coins"])
    creator_share = int(round(price * 0.8))
    await _credit_wallet(user["user_id"], creator_share, reason="custom_request_earn", related_id=request_id)
    await db.custom_requests.update_one(
        {"request_id": request_id},
        {"$set": {
            "status": "delivered",
            "delivered_at": now_utc().isoformat(),
            "delivery": {
                "media_url": payload.media_url,
                "media_type": payload.media_type,
                "caption": payload.caption,
            },
        }},
    )
    await _create_notification(
        req["fan_id"], "custom_request",
        "Ta commande personnalisée est prête 🎁",
        "Ouvre-la pour découvrir ton contenu.",
        {"request_id": request_id},
    )
    return {"ok": True, "status": "delivered", "creator_share": creator_share}


# -------- Creators leaderboard (top revenues last N days) --------
@api_router.get("/leaderboard/creators")
async def creators_leaderboard(days: int = 7, limit: int = 10):
    since = (now_utc() - timedelta(days=max(1, min(days, 30)))).isoformat()
    pipeline = [
        {"$match": {
            "reason": {"$in": ["subscription_earn", "tip_earn", "unlock_earn", "custom_request_earn"]},
            "created_at": {"$gte": since},
            "delta": {"$gt": 0},
        }},
        {"$group": {"_id": "$user_id", "total_coins": {"$sum": "$delta"}}},
        {"$sort": {"total_coins": -1}},
        {"$limit": max(1, min(limit, 50))},
    ]
    rows = await db.coin_transactions.aggregate(pipeline).to_list(length=limit)
    out = []
    for rank, row in enumerate(rows, start=1):
        creator = await db.creators.find_one({"creator_id": row["_id"]}, {"_id": 0})
        if not creator:
            continue
        out.append({
            "rank": rank,
            "creator_id": creator["creator_id"],
            "display_name": creator.get("display_name"),
            "handle": creator.get("handle"),
            "avatar_url": creator.get("avatar_url"),
            "total_coins": int(row["total_coins"]),
        })
    return {"period_days": days, "top": out}


# -------- Challenge hebdo : 3 posts / 7j = featured_until --------
CHALLENGE_POSTS_REQUIRED = 3
CHALLENGE_FEATURE_HOURS = 48

async def _posts_this_week(creator_id: str) -> int:
    since = (now_utc() - timedelta(days=7)).isoformat()
    return await db.content.count_documents({"creator_id": creator_id, "created_at": {"$gte": since}})

@api_router.get("/creators/me/challenge")
async def my_challenge(user: dict = Depends(get_current_user)):
    creator = await db.creators.find_one({"creator_id": user["user_id"]}, {"_id": 0})
    if not creator:
        raise HTTPException(status_code=404, detail="Profil créatrice introuvable")
    done = await _posts_this_week(user["user_id"])
    completed = done >= CHALLENGE_POSTS_REQUIRED
    featured_until = creator.get("featured_until")
    now_iso = now_utc().isoformat()
    is_featured = bool(featured_until and featured_until > now_iso)
    return {
        "required": CHALLENGE_POSTS_REQUIRED,
        "done": done,
        "completed": completed,
        "feature_hours": CHALLENGE_FEATURE_HOURS,
        "featured_until": featured_until if is_featured else None,
    }

async def _run_challenge_rewards():
    """Called by scheduler: grant featured_until=48h to creators with >=3 posts in the last 7 days."""
    since = (now_utc() - timedelta(days=7)).isoformat()
    pipeline = [
        {"$match": {"created_at": {"$gte": since}}},
        {"$group": {"_id": "$creator_id", "count": {"$sum": 1}}},
        {"$match": {"count": {"$gte": CHALLENGE_POSTS_REQUIRED}}},
    ]
    eligible = set()
    async for row in db.content.aggregate(pipeline):
        eligible.add(row["_id"])
    if not eligible:
        return
    new_until = (now_utc() + timedelta(hours=CHALLENGE_FEATURE_HOURS)).isoformat()
    for cid in eligible:
        creator = await db.creators.find_one({"creator_id": cid}, {"_id": 0})
        if not creator:
            continue
        current = creator.get("featured_until")
        if current and current > new_until:
            continue  # already featured longer
        await db.creators.update_one({"creator_id": cid}, {"$set": {"featured_until": new_until}})
        await _create_notification(
            cid, "challenge",
            "Challenge hebdo validé ! 🚀",
            f"Tu es mise en avant pendant {CHALLENGE_FEATURE_HOURS}h sur la page Créatrices.",
            {"featured_until": new_until},
        )


# -------- Priority messages (fan pays coins to unlock priority inbox) --------
PRIORITY_MSG_COST = 50

@api_router.post("/messages/{creator_id}/priority")
async def send_priority_message(creator_id: str, payload: PriorityMessageIn,
                                 background: BackgroundTasks,
                                 user: dict = Depends(get_current_user)):
    creator = await db.creators.find_one({"creator_id": creator_id}, {"_id": 0})
    if not creator:
        raise HTTPException(status_code=404, detail="Créatrice introuvable")
    if user["user_id"] == creator_id:
        raise HTTPException(status_code=400, detail="Impossible de t'envoyer un message à toi-même")
    cost = PRIORITY_MSG_COST
    ok = await _debit_wallet(user["user_id"], cost, reason="priority_msg", related_id=creator_id)
    if not ok:
        w = await _get_wallet(user["user_id"])
        raise HTTPException(status_code=402, detail={"error": "insufficient_coins", "needed": cost, "balance": w["coin_balance"]})
    creator_share = int(round(cost * 0.8))
    await _credit_wallet(creator_id, creator_share, reason="priority_msg_earn", related_id=user["user_id"])
    doc = {
        "message_id": f"msg_{uuid.uuid4().hex[:10]}",
        "creator_id": creator_id,
        "fan_id": user["user_id"],
        "sender_id": user["user_id"],
        "body": payload.body,
        "is_priority": True,
        "priority_cost": cost,
        "created_at": now_utc().isoformat(),
    }
    await db.messages.insert_one(doc)
    doc.pop("_id", None)
    background.add_task(_notify_new_message, sender=user, recipient_id=creator_id,
                        creator=creator, fan_id=user["user_id"], body=f"⚡ PRIORITAIRE · {payload.body}")
    return doc


# -------- Similar creators (discovery) --------
@api_router.get("/creators/{creator_id}/similar")
async def similar_creators(creator_id: str, limit: int = 4):
    target = await db.creators.find_one({"creator_id": creator_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Créatrice introuvable")
    target_tags = set(target.get("tags") or [])
    candidates = await db.creators.find(
        {"creator_id": {"$ne": creator_id}},
        {"_id": 0},
    ).to_list(length=200)
    scored = []
    for c in candidates:
        tags = set(c.get("tags") or [])
        union = target_tags | tags
        jaccard = (len(target_tags & tags) / len(union)) if union else 0
        subs = int(c.get("subscribers_count") or 0)
        # score: jaccard (0-1) dominant, subscribers as tiebreaker
        score = jaccard * 1000 + min(subs, 100)
        scored.append((score, c))
    scored.sort(key=lambda x: x[0], reverse=True)
    top = [c for _, c in scored[:max(1, min(limit, 20))] if _ > 0 or len(target_tags) == 0]
    if not top:
        top = [c for _, c in scored[:max(1, min(limit, 20))]]
    return [{
        "creator_id": c["creator_id"],
        "display_name": c.get("display_name"),
        "handle": c.get("handle"),
        "avatar_url": c.get("avatar_url"),
        "tags": c.get("tags", []),
        "subscribers_count": int(c.get("subscribers_count") or 0),
    } for c in top]


@api_router.get("/wallet/transactions")
async def wallet_txs(limit: int = 30, user: dict = Depends(get_current_user)):
    items = await db.coin_transactions.find(
        {"user_id": user["user_id"]}, {"_id": 0},
    ).sort("created_at", -1).to_list(length=limit)
    return items

@api_router.get("/wallet/packs")
async def wallet_packs():
    return list(COIN_PACKS.values())

# -------- Stripe (direct live API, bypass emergent proxy) --------
def _stripe_live_enabled() -> bool:
    """True when a live/test Stripe secret key is present (sk_live_* or sk_test_*)."""
    return bool(STRIPE_API_KEY) and STRIPE_API_KEY != "sk_test_emergent"

def get_stripe(request: Request) -> StripeCheckout:
    """Legacy helper — kept for webhook compat only."""
    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    return StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)

def _create_checkout_session_direct(amount_eur: float, currency: str,
                                    success_url: str, cancel_url: str,
                                    product_name: str, metadata: dict,
                                    customer_email: Optional[str] = None,
                                    destination_account: Optional[str] = None,
                                    application_fee_amount: Optional[int] = None) -> dict:
    """Create a Stripe Checkout Session via direct Stripe API (user's real account).
    If destination_account is provided, uses Connect destination charges:
    the specified connected account receives the funds minus application_fee_amount (in cents)
    which stays on the platform.
    Returns a dict with {id, url}."""
    unit_amount = int(round(amount_eur * 100))
    params = dict(
        api_key=STRIPE_API_KEY,
        mode="payment",
        payment_method_types=["card"],
        line_items=[{
            "price_data": {
                "currency": currency,
                "product_data": {"name": product_name},
                "unit_amount": unit_amount,
            },
            "quantity": 1,
        }],
        success_url=success_url,
        cancel_url=cancel_url,
        metadata=metadata,
        customer_email=customer_email,
    )
    if destination_account:
        pid = {"transfer_data": {"destination": destination_account}}
        if application_fee_amount is not None and application_fee_amount > 0:
            pid["application_fee_amount"] = int(application_fee_amount)
        params["payment_intent_data"] = pid
    with _with_direct_stripe_api():
        session = stripe_sdk.checkout.Session.create(**params)
    return {"id": session["id"], "url": session["url"]}

@api_router.post("/wallet/buy")
async def buy_coin_pack(payload: BuyPackIn, request: Request, user: dict = Depends(get_current_user)):
    pack = COIN_PACKS.get(payload.pack_id)
    if not pack:
        raise HTTPException(status_code=400, detail="Pack invalide")
    origin = _normalize_origin(payload.origin_url, request)
    success_url = f"{origin}/payment/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/wallet"
    total_coins = pack["coins"] + pack["bonus"]

    if _stripe_live_enabled():
        # Direct Stripe API with the user's live secret key
        session = _create_checkout_session_direct(
            amount_eur=float(pack["eur"]), currency="eur",
            success_url=success_url, cancel_url=cancel_url,
            product_name=f"Pack {pack.get('label', pack['pack_id'])} · {total_coins} coins me&you",
            metadata={
                "type": "coin_pack",
                "user_id": user["user_id"],
                "pack_id": pack["pack_id"],
                "coins": str(total_coins),
            },
            customer_email=user.get("email"),
        )
        session_id, session_url = session["id"], session["url"]
    else:
        # Fallback to emergentintegrations proxy (test mode)
        stripe_checkout = get_stripe(request)
        req = CheckoutSessionRequest(
            amount=float(pack["eur"]), currency="eur",
            success_url=success_url, cancel_url=cancel_url,
            metadata={
                "type": "coin_pack",
                "user_id": user["user_id"],
                "pack_id": pack["pack_id"],
                "coins": str(total_coins),
            },
        )
        s = await stripe_checkout.create_checkout_session(req)
        session_id, session_url = s.session_id, s.url

    await db.payment_transactions.insert_one({
        "session_id": session_id,
        "type": "coin_pack",
        "user_id": user["user_id"],
        "pack_id": pack["pack_id"],
        "coins": total_coins,
        "amount": float(pack["eur"]),
        "currency": "eur",
        "payment_status": "initiated",
        "status": "open",
        "metadata": {"type": "coin_pack", "pack_id": pack["pack_id"], "coins": total_coins},
        "created_at": now_utc().isoformat(),
    })
    return {"url": session_url, "session_id": session_id}

# -------- Coin-based actions --------
@api_router.post("/payments/subscribe")
async def subscribe_with_coins(payload: SubscribeIn, background: BackgroundTasks, user: dict = Depends(get_current_user)):
    creator = await db.creators.find_one({"creator_id": payload.creator_id}, {"_id": 0})
    if not creator:
        raise HTTPException(status_code=404, detail="Créatrice introuvable")
    # Apply active promotion if any
    promo = await _get_active_promotion(payload.creator_id)
    eur_price = _effective_price(creator, promo)
    coins_needed = eur_to_coins(eur_price)
    wallet = await _get_wallet(user["user_id"])
    if wallet["coin_balance"] < coins_needed:
        raise HTTPException(
            status_code=402,
            detail={"error": "insufficient_coins",
                    "needed": coins_needed, "balance": wallet["coin_balance"]},
        )

    ok = await _debit_wallet(user["user_id"], coins_needed,
                             reason="subscription", related_id=payload.creator_id)
    if not ok:
        raise HTTPException(status_code=402, detail="Solde insuffisant")

    creator_share = int(round(coins_needed * CREATOR_PAYOUT_RATIO))
    await _credit_wallet(payload.creator_id, creator_share,
                         reason="subscription_earn", related_id=user["user_id"])
    await db.subscriptions.update_one(
        {"user_id": user["user_id"], "creator_id": payload.creator_id},
        {"$set": {
            "user_id": user["user_id"],
            "creator_id": payload.creator_id,
            "status": "active",
            "price_coins": coins_needed,
            "auto_renew": True,
            "started_at": now_utc().isoformat(),
            "expires_at": (now_utc() + timedelta(days=30)).isoformat(),
            "last_renewed_at": now_utc().isoformat(),
        }},
        upsert=True,
    )
    await db.creators.update_one(
        {"creator_id": payload.creator_id},
        {"$inc": {"subscribers_count": 1, "total_earned_coins": creator_share}},
    )
    await _create_notification(payload.creator_id, "subscription",
                               "Nouvel abonné 💜",
                               f"{user['name']} vient de s'abonner (+{creator_share} coins).",
                               {"user_id": user["user_id"], "coins": creator_share})
    await _create_notification(user["user_id"], "subscription_paid",
                               "Abonnement activé",
                               f"Tu es abonné(e) à {creator['display_name']} pour 30 jours.",
                               {"creator_id": payload.creator_id, "coins": coins_needed})
    background.add_task(_notify_creator_sale, payload.creator_id, user["user_id"],
                        "subscription", creator_share, f"Abonnement {eur_price:.2f}€/mois")
    return {"ok": True, "coins_spent": coins_needed}

@api_router.post("/payments/tip")
async def tip_with_coins(payload: TipIn, background: BackgroundTasks,
                         user: dict = Depends(get_current_user)):
    if payload.coins <= 0 or payload.coins > 10000:
        raise HTTPException(status_code=400, detail="Montant invalide")
    creator = await db.creators.find_one({"creator_id": payload.creator_id}, {"_id": 0})
    if not creator:
        raise HTTPException(status_code=404, detail="Créatrice introuvable")
    wallet = await _get_wallet(user["user_id"])
    if wallet["coin_balance"] < payload.coins:
        raise HTTPException(status_code=402, detail={
            "error": "insufficient_coins",
            "needed": payload.coins, "balance": wallet["coin_balance"],
        })
    ok = await _debit_wallet(user["user_id"], payload.coins,
                             reason="tip", related_id=payload.creator_id)
    if not ok:
        raise HTTPException(status_code=402, detail="Solde insuffisant")
    creator_share = int(round(payload.coins * CREATOR_PAYOUT_RATIO))
    await _credit_wallet(payload.creator_id, creator_share,
                         reason="tip_earn", related_id=user["user_id"])
    await db.creators.update_one(
        {"creator_id": payload.creator_id},
        {"$inc": {"total_earned_coins": creator_share}},
    )
    await db.messages.insert_one({
        "message_id": f"msg_{uuid.uuid4().hex[:10]}",
        "creator_id": payload.creator_id,
        "fan_id": user["user_id"],
        "sender_id": user["user_id"],
        "body": f"💎 Pourboire de {payload.coins} coins"
                + (f" — {payload.message}" if payload.message else ""),
        "kind": "tip",
        "coins": payload.coins,
        "created_at": now_utc().isoformat(),
    })
    await _create_notification(payload.creator_id, "tip",
                               f"Pourboire reçu · {payload.coins} coins",
                               f"{user['name']} t'a envoyé un pourboire (+{creator_share} coins).",
                               {"user_id": user["user_id"], "coins": creator_share})
    background.add_task(_notify_new_message, sender=user, recipient_id=payload.creator_id,
                        creator=creator, fan_id=user["user_id"],
                        body=f"Pourboire {payload.coins} coins — {payload.message or ''}")
    background.add_task(_notify_creator_sale, payload.creator_id, user["user_id"],
                        "tip", creator_share, payload.message or None)
    return {"ok": True, "coins_spent": payload.coins}

@api_router.post("/payments/unlock")
async def unlock_with_coins(payload: UnlockIn, background: BackgroundTasks, user: dict = Depends(get_current_user)):
    content = await db.content.find_one({"content_id": payload.content_id}, {"_id": 0})
    if not content:
        raise HTTPException(status_code=404, detail="Contenu introuvable")
    price_eur = float(content.get("unlock_price", 0) or 0)
    if price_eur <= 0:
        raise HTTPException(status_code=400, detail="Ce contenu n'est pas à l'unité")
    coins_needed = eur_to_coins(price_eur)
    wallet = await _get_wallet(user["user_id"])
    if wallet["coin_balance"] < coins_needed:
        raise HTTPException(status_code=402, detail={
            "error": "insufficient_coins",
            "needed": coins_needed, "balance": wallet["coin_balance"],
        })
    ok = await _debit_wallet(user["user_id"], coins_needed,
                             reason="unlock", related_id=payload.content_id)
    if not ok:
        raise HTTPException(status_code=402, detail="Solde insuffisant")
    creator_share = int(round(coins_needed * CREATOR_PAYOUT_RATIO))
    await _credit_wallet(content["creator_id"], creator_share,
                         reason="unlock_earn", related_id=payload.content_id)
    await db.unlocks.update_one(
        {"user_id": user["user_id"], "content_id": payload.content_id},
        {"$set": {
            "user_id": user["user_id"],
            "content_id": payload.content_id,
            "creator_id": content["creator_id"],
            "unlocked_at": now_utc().isoformat(),
        }},
        upsert=True,
    )
    await db.creators.update_one(
        {"creator_id": content["creator_id"]},
        {"$inc": {"total_earned_coins": creator_share}},
    )
    background.add_task(_notify_creator_sale, content["creator_id"], user["user_id"],
                        "unlock", creator_share, content.get("title") or "Contenu premium")
    return {"ok": True, "coins_spent": coins_needed}

# -------- Subscription helpers --------
@api_router.get("/subscriptions")
async def my_subs(user: dict = Depends(get_current_user)):
    subs = await db.subscriptions.find(
        {"user_id": user["user_id"]}, {"_id": 0},
    ).sort("started_at", -1).to_list(length=50)
    creator_ids = [s["creator_id"] for s in subs]
    creators = {c["creator_id"]: c for c in
                await db.creators.find({"creator_id": {"$in": creator_ids}},
                                       {"_id": 0}).to_list(length=100)}
    for s in subs:
        s["creator"] = creators.get(s["creator_id"])
    return subs

@api_router.post("/subscriptions/{creator_id}/auto-renew")
async def toggle_auto_renew(creator_id: str, user: dict = Depends(get_current_user)):
    sub = await db.subscriptions.find_one(
        {"user_id": user["user_id"], "creator_id": creator_id}, {"_id": 0},
    )
    if not sub:
        raise HTTPException(status_code=404, detail="Abonnement introuvable")
    new_val = not bool(sub.get("auto_renew", True))
    await db.subscriptions.update_one(
        {"user_id": user["user_id"], "creator_id": creator_id},
        {"$set": {"auto_renew": new_val}},
    )
    return {"auto_renew": new_val}

# -------- Payout requests (creator) --------
@api_router.post("/payouts/request")
async def request_payout(payload: PayoutIn, user: dict = Depends(get_current_user)):
    creator = await db.creators.find_one({"creator_id": user["user_id"]}, {"_id": 0})
    if not creator:
        raise HTTPException(status_code=403, detail="Compte créatrice requis")
    if payload.coins < PAYOUT_MIN_COINS:
        raise HTTPException(status_code=400,
                            detail=f"Minimum {PAYOUT_MIN_COINS} coins pour demander un retrait")
    bank = await db.creator_bank_accounts.find_one({"creator_id": user["user_id"]})
    if not bank:
        raise HTTPException(status_code=400,
                            detail="Renseigne ton IBAN dans Paramètres avant de demander un retrait")
    wallet = await _get_wallet(user["user_id"])
    if wallet["coin_balance"] < payload.coins:
        raise HTTPException(status_code=402, detail="Solde insuffisant")
    ok = await _debit_wallet(user["user_id"], payload.coins, reason="payout_hold")
    if not ok:
        raise HTTPException(status_code=402, detail="Solde insuffisant")
    eur_value = round(coins_to_eur(payload.coins) * CREATOR_PAYOUT_RATIO, 2)
    req = {
        "request_id": f"po_{uuid.uuid4().hex[:12]}",
        "creator_id": user["user_id"],
        "coins": payload.coins,
        "eur_value": eur_value,
        "status": "pending",
        "iban_snapshot": bank["iban"],
        "bic_snapshot": bank.get("bic", ""),
        "holder_snapshot": bank.get("holder_name", ""),
        "created_at": now_utc().isoformat(),
    }
    await db.payout_requests.insert_one(req)
    req.pop("_id", None)
    return req

@api_router.get("/payouts")
async def list_payouts(user: dict = Depends(get_current_user)):
    items = await db.payout_requests.find(
        {"creator_id": user["user_id"]}, {"_id": 0},
    ).sort("created_at", -1).to_list(length=50)
    return items

async def _grant_referral_bonus(buyer: dict):
    """Credit referral bonus to both referrer and new user. Idempotent."""
    referrer_id = buyer.get("referred_by")
    if not referrer_id or buyer.get("referral_bonus_granted"):
        return
    # Mark granted FIRST to avoid race (before any credits)
    res = await db.users.update_one(
        {"user_id": buyer["user_id"], "referral_bonus_granted": {"$ne": True}},
        {"$set": {"referral_bonus_granted": True, "referral_bonus_at": now_utc().isoformat()}},
    )
    if res.modified_count != 1:
        return  # already granted by concurrent call
    # Credit both
    await _credit_wallet(buyer["user_id"], REFERRAL_BONUS_COINS,
                         reason="referral_signup", related_id=referrer_id)
    await _credit_wallet(referrer_id, REFERRAL_BONUS_COINS,
                         reason="referral_bonus", related_id=buyer["user_id"])
    await _create_notification(
        buyer["user_id"], "referral",
        f"+{REFERRAL_BONUS_COINS} coins parrainage 🎁",
        "Ta 1ʳᵉ recharge débloque ton bonus de parrainage.",
        {"coins": REFERRAL_BONUS_COINS},
    )
    await _create_notification(
        referrer_id, "referral",
        f"Ton filleul a rechargé ! +{REFERRAL_BONUS_COINS} coins 🎁",
        f"{buyer.get('name','Un filleul')} vient de créditer son wallet. Merci pour le parrainage !",
        {"coins": REFERRAL_BONUS_COINS, "referred_user_id": buyer["user_id"]},
    )

async def _apply_payment_success(tx: dict):
    """Apply side effects for a paid Stripe tx. Idempotency is guaranteed by the
    atomic find_one_and_update({applied: false} → {applied: true}) lock that
    the only callers (webhook + polling) use BEFORE invoking us. So we DO NOT
    re-check `applied` here — the caller already won the race."""
    t = tx.get("type")
    buyer = await db.users.find_one({"user_id": tx["user_id"]}, {"_id": 0, "password_hash": 0})
    if t == "coin_pack":
        coins = int(tx.get("coins") or 0)
        if coins > 0:
            await _credit_wallet(tx["user_id"], coins,
                                 reason="coin_pack", related_id=tx.get("session_id"))
        if buyer:
            await _create_notification(buyer["user_id"], "payment",
                                       f"+{coins} coins ajoutés 💰",
                                       f"Ta recharge de {tx.get('amount', 0):.2f}€ est confirmée.",
                                       {"type": t, "coins": coins})
            try:
                await send_payment_confirmation(buyer["email"], buyer["name"], float(tx["amount"]),
                                                "coins", None, FRONTEND_URL)
            except Exception as e:
                logging.warning("payment email failed: %s", e)
            # Referral bonus: on FIRST coin pack top-up, credit both referrer & new user
            if buyer.get("referred_by") and not buyer.get("referral_bonus_granted"):
                await _grant_referral_bonus(buyer)

    elif t == "bundle_subscription":
        months = int(tx.get("months") or 1)
        creator_id = tx.get("creator_id")
        amount = float(tx.get("amount") or 0)
        is_direct_payout = bool(tx.get("connect_account"))
        if creator_id and buyer:
            if not is_direct_payout:
                # Legacy flow: creator didn't have Stripe Connect → credit 80% as platform coins
                total_coins = eur_to_coins(amount)
                share = int(round(total_coins * CREATOR_PAYOUT_RATIO))
                await _credit_wallet(creator_id, share, reason="subscription_earn_stripe", related_id=buyer["user_id"])
            # Activate subscription (no auto-renew, bundle flavour)
            expires = now_utc() + timedelta(days=30 * months)
            await db.subscriptions.update_one(
                {"user_id": buyer["user_id"], "creator_id": creator_id},
                {"$set": {
                    "status": "active",
                    "auto_renew": False,
                    "bundle_months": months,
                    "expires_at": expires.isoformat(),
                    "renewed_at": now_utc().isoformat(),
                }, "$setOnInsert": {
                    "user_id": buyer["user_id"], "creator_id": creator_id,
                    "created_at": now_utc().isoformat(),
                }},
                upsert=True,
            )
            await db.creators.update_one({"creator_id": creator_id}, {"$inc": {"subscribers_count": 1}})
            creator_doc = await db.creators.find_one({"creator_id": creator_id}, {"_id": 0, "display_name": 1})
            creator_name = (creator_doc or {}).get("display_name", "la créatrice")
            await _create_notification(buyer["user_id"], "subscription",
                                       "Abonnement activé 💖",
                                       f"{months} mois avec {creator_name} — jusqu'au {expires.strftime('%d/%m/%Y')}.",
                                       {"creator_id": creator_id, "months": months})
            # Notify creator with direct payout info
            creator_share_eur = round(amount * CREATOR_PAYOUT_RATIO, 2)
            await _create_notification(creator_id, "stripe_connect_earn" if is_direct_payout else "subscription_earn",
                                       "Nouvel abonnement 💎",
                                       (f"{creator_share_eur:.2f} € crédités sur ton compte Stripe ({months} mois)." if is_direct_payout
                                        else f"+{int(round(eur_to_coins(amount) * CREATOR_PAYOUT_RATIO))} coins ({months} mois)."),
                                       {"user_id": buyer["user_id"], "amount_eur": creator_share_eur, "months": months})
            try:
                await send_payment_confirmation(buyer["email"], buyer["name"], amount,
                                                "bundle", f"{months} mois", FRONTEND_URL)
            except Exception as e:
                logging.warning("bundle email failed: %s", e)


@api_router.post("/wallet/reconcile")
async def reconcile_pending_payments(user: dict = Depends(get_current_user)):
    """Safety net for the user → if a Stripe checkout finished after the
    PaymentSuccess polling timed out, this endpoint scans recent unfinished
    transactions for the user and credits any that Stripe now reports as paid.
    Called on /wallet page load so users never have to chase their coins."""
    cutoff = (now_utc() - timedelta(hours=24)).isoformat()
    pending = await db.payment_transactions.find({
        "user_id": user["user_id"],
        "type": "coin_pack",
        "applied": {"$ne": True},
        "created_at": {"$gte": cutoff},
    }, {"_id": 0}).to_list(length=20)
    credited = 0
    coins_added = 0
    for tx in pending:
        try:
            sid = tx["session_id"]
            new_payment_status = "initiated"
            if _stripe_live_enabled():
                with _with_direct_stripe_api():
                    s = stripe_sdk.checkout.Session.retrieve(sid, api_key=STRIPE_API_KEY)
                new_payment_status = s.get("payment_status") or "initiated"
            if new_payment_status == "paid":
                await db.payment_transactions.update_one(
                    {"session_id": sid},
                    {"$set": {"payment_status": "paid", "status": "complete",
                              "applied": True, "paid_at": now_utc().isoformat()}},
                )
                tx["payment_status"] = "paid"
                await _apply_payment_success(tx)
                credited += 1
                coins_added += int(tx.get("coins") or 0)
        except Exception as e:
            logging.warning("reconcile %s failed: %s", tx.get("session_id"), e)
    return {"reconciled": credited, "coins_added": coins_added, "scanned": len(pending)}


@api_router.get("/payments/status/{session_id}")
async def payment_status(session_id: str, request: Request):
    tx = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not tx:
        raise HTTPException(status_code=404, detail="Session introuvable")
    # Poll Stripe — use direct API when sk_live/sk_test is set, else fall back to emergent proxy
    try:
        if _stripe_live_enabled():
            with _with_direct_stripe_api():
                s = stripe_sdk.checkout.Session.retrieve(session_id, api_key=STRIPE_API_KEY)
            new_status_val = s.get("status") or "open"
            new_payment_status = s.get("payment_status") or "initiated"
        else:
            stripe_checkout = get_stripe(request)
            status = await stripe_checkout.get_checkout_status(session_id)
            new_status_val = status.status
            new_payment_status = status.payment_status
        if new_payment_status == "paid":
            # Atomic claim: only the first caller (webhook OR poll) wins
            claim = await db.payment_transactions.find_one_and_update(
                {"session_id": session_id, "applied": {"$ne": True}},
                {"$set": {
                    "applied": True,
                    "payment_status": "paid",
                    "status": new_status_val,
                    "paid_at": now_utc().isoformat(),
                }},
                return_document=False,
            )
            if claim:
                # We won the race → apply side effects
                tx.update({"applied": True, "payment_status": "paid", "status": new_status_val,
                           "paid_at": now_utc().isoformat()})
                await _apply_payment_success(tx)
            else:
                # Already applied by webhook or another poller → just refresh local view
                refreshed = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
                if refreshed:
                    tx = refreshed
        else:
            await db.payment_transactions.update_one(
                {"session_id": session_id},
                {"$set": {"status": new_status_val, "payment_status": new_payment_status}},
            )
            tx.update({"status": new_status_val, "payment_status": new_payment_status})
    except Exception as e:
        logging.exception("Stripe status error: %s", e)
    return {
        "session_id": session_id,
        "status": tx.get("status"),
        "payment_status": tx.get("payment_status"),
        "amount": tx.get("amount"),
        "currency": tx.get("currency"),
        "type": tx.get("type"),
        "applied": bool(tx.get("applied")),
        "coins": int(tx.get("coins") or 0),
    }

@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    body = await request.body()
    sig = request.headers.get("Stripe-Signature", "")
    session_id = None
    payment_status = None
    try:
        if _stripe_live_enabled() and STRIPE_WEBHOOK_SECRET:
            # Verify signature using user's own live webhook secret
            with _with_direct_stripe_api():
                event = stripe_sdk.Webhook.construct_event(body, sig, STRIPE_WEBHOOK_SECRET)
            evt_type = event.get("type")
            if evt_type == "checkout.session.completed":
                sess = event["data"]["object"]
                session_id = sess.get("id")
                payment_status = sess.get("payment_status")
            elif evt_type == "account.updated":                # Connect account onboarding status changed — sync to DB
                acct_obj = event["data"]["object"]
                acct = acct_obj.to_dict() if hasattr(acct_obj, "to_dict") else dict(acct_obj)
                acct_id = acct.get("id")
                if acct_id:
                    creator = await db.creators.find_one({"stripe_account_id": acct_id}, {"_id": 0, "creator_id": 1})
                    if creator:
                        requirements = acct.get("requirements") or {}
                        if hasattr(requirements, "to_dict"):
                            requirements = requirements.to_dict()
                        await db.creators.update_one(
                            {"creator_id": creator["creator_id"]},
                            {"$set": {
                                "stripe_account_charges_enabled": bool(acct.get("charges_enabled")),
                                "stripe_account_payouts_enabled": bool(acct.get("payouts_enabled")),
                                "stripe_account_details_submitted": bool(acct.get("details_submitted")),
                                "stripe_account_requirements": list(requirements.get("currently_due") or []),
                                "stripe_account_updated_at": now_utc().isoformat(),
                            }},
                        )
                        if acct.get("charges_enabled") and acct.get("payouts_enabled"):
                            await _create_notification(
                                creator["creator_id"], "stripe_connect_ready",
                                "Stripe Connect activé 🎉",
                                "Tes paiements arriveront directement sur ton compte Stripe (80% par abonnement).",
                                {"account_id": acct_id},
                            )
        elif _stripe_live_enabled():
            # Live mode but webhook secret missing → cannot verify signature.
            # Parse the event payload anyway and re-check the session payment
            # status against Stripe before applying. Lets coin packs still
            # credit while the user sets up STRIPE_WEBHOOK_SECRET.
            try:
                payload = json.loads(body.decode("utf-8"))
                if payload.get("type") == "checkout.session.completed":
                    sess = payload["data"]["object"]
                    sid = sess.get("id")
                    if sid:
                        with _with_direct_stripe_api():
                            verified = stripe_sdk.checkout.Session.retrieve(sid, api_key=STRIPE_API_KEY)
                        session_id = verified.get("id")
                        payment_status = verified.get("payment_status")
                logging.warning("Stripe webhook unverified (STRIPE_WEBHOOK_SECRET missing) — re-checked via API.")
            except Exception as e:
                logging.warning("Unverified webhook fallback failed: %s", e)
        else:
            stripe_checkout = get_stripe(request)
            evt = await stripe_checkout.handle_webhook(body, sig)
            session_id = evt.session_id
            payment_status = evt.payment_status
    except Exception as e:
        logging.exception("Webhook error: %s", e)
        return JSONResponse(status_code=400, content={"ok": False})
    if payment_status == "paid" and session_id:
        # Atomic claim — same lock as /payments/status to avoid double-credit
        claim = await db.payment_transactions.find_one_and_update(
            {"session_id": session_id, "applied": {"$ne": True}},
            {"$set": {"payment_status": "paid", "status": "complete",
                      "applied": True, "paid_at": now_utc().isoformat()}},
            return_document=True,
        )
        if claim:
            claim.pop("_id", None)
            await _apply_payment_success(claim)
    return {"ok": True}

# -------- Age verification (Stripe Identity) --------
import stripe as stripe_sdk
stripe_sdk.api_key = STRIPE_API_KEY

@api_router.post("/verification/start")
async def start_verification(user: dict = Depends(get_current_user)):
    """Create a Stripe Identity verification session. Falls back to mock if API key is sandbox placeholder."""
    try:
        with _with_direct_stripe_api():
            vs = stripe_sdk.identity.VerificationSession.create(
                type="document",
                metadata={"user_id": user["user_id"]},
                options={"document": {"require_matching_selfie": True}},
                api_key=STRIPE_API_KEY,
            )
        await db.verifications.update_one(
            {"user_id": user["user_id"]},
            {"$set": {
                "user_id": user["user_id"],
                "session_id": vs.id,
                "status": vs.status,
                "mode": "stripe",
                "created_at": now_utc().isoformat(),
            }},
            upsert=True,
        )
        return {"url": vs.url, "session_id": vs.id, "mode": "stripe"}
    except Exception as e:
        logging.warning("Stripe Identity unavailable (using mock): %s", e)
        mock_id = f"vs_mock_{uuid.uuid4().hex[:10]}"
        await db.verifications.update_one(
            {"user_id": user["user_id"]},
            {"$set": {
                "user_id": user["user_id"],
                "session_id": mock_id,
                "status": "processing",
                "mode": "mock",
                "created_at": now_utc().isoformat(),
            }},
            upsert=True,
        )
        return {"url": None, "session_id": mock_id, "mode": "mock"}

@api_router.post("/verification/complete-mock")
async def complete_mock_verification(user: dict = Depends(get_current_user)):
    """Dev endpoint: simulate a successful verification result (only when verification is in mock mode)."""
    ver = await db.verifications.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if not ver:
        raise HTTPException(status_code=400, detail="Aucune session de vérification")
    if ver.get("mode") != "mock":
        raise HTTPException(status_code=400, detail="Cette session utilise Stripe Identity")
    await db.verifications.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"status": "verified", "verified_at": now_utc().isoformat()}},
    )
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"age_verified": True, "age_verified_at": now_utc().isoformat()}},
    )
    return {"ok": True, "age_verified": True}

@api_router.get("/verification/status")
async def verification_status(user: dict = Depends(get_current_user)):
    ver = await db.verifications.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return {"age_verified": bool(user.get("age_verified")), "verification": ver}

# -------- Admin helper --------
async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Accès admin requis")
    return user



# ============================================================================
#                        AI MODERATION SYSTEM
# ============================================================================
# Admin can configure granular content/account policies. Each new piece of
# content posted by a creator (and each new user signup) is screened by Lou
# (Emergent LLM) against the active rules. Violations are persisted in
# `moderation_reports` so the admin can review or auto-actions can fire.

DEFAULT_MOD_POLICY = {
    "enabled": True,
    "scan_content": True,
    "scan_profiles": True,
    "scan_messages": False,
    "scan_live_chat": False,
    "ban_nudity": True,
    "ban_violence": True,
    "ban_hate_speech": True,
    "ban_spam": True,
    "ban_scam_links": True,
    "ban_drugs": False,
    "ban_weapons": False,
    "ban_minors": True,
    "ban_copyright": False,
    "ban_external_contacts": True,
    "ban_doxxing": True,
    "ban_off_topic": False,
    "auto_suspend_after_violations": 3,
    "ban_fake_identity": True,
    "alert_on_minor_signup": True,
    "action_nudity": "delete",
    "action_violence": "delete",
    "action_hate_speech": "ban_user",
    "action_spam": "delete",
    "action_scam_links": "delete",
    "action_minors": "ban_user",
    "action_default": "report",
    "keyword_blacklist": [],
    "trust_verified_creators": True,
}

class ModPolicyIn(BaseModel):
    enabled: Optional[bool] = None
    scan_content: Optional[bool] = None
    scan_profiles: Optional[bool] = None
    scan_messages: Optional[bool] = None
    scan_live_chat: Optional[bool] = None
    ban_nudity: Optional[bool] = None
    ban_violence: Optional[bool] = None
    ban_hate_speech: Optional[bool] = None
    ban_spam: Optional[bool] = None
    ban_scam_links: Optional[bool] = None
    ban_drugs: Optional[bool] = None
    ban_weapons: Optional[bool] = None
    ban_copyright: Optional[bool] = None
    ban_external_contacts: Optional[bool] = None
    ban_doxxing: Optional[bool] = None
    ban_off_topic: Optional[bool] = None
    auto_suspend_after_violations: Optional[int] = Field(default=None, ge=1, le=20)
    ban_fake_identity: Optional[bool] = None
    alert_on_minor_signup: Optional[bool] = None
    action_nudity: Optional[str] = None
    action_violence: Optional[str] = None
    action_hate_speech: Optional[str] = None
    action_spam: Optional[str] = None
    action_scam_links: Optional[str] = None
    action_minors: Optional[str] = None
    action_default: Optional[str] = None
    keyword_blacklist: Optional[List[str]] = Field(default=None, max_length=500)
    trust_verified_creators: Optional[bool] = None


async def _get_mod_policy() -> dict:
    cfg = await db.config.find_one({"_id": "ai_moderation"}) or {}
    out = {**DEFAULT_MOD_POLICY, **{k: v for k, v in cfg.items() if k != "_id"}}
    return out


@api_router.get("/admin/moderation/policy")
async def admin_get_mod_policy(_admin: dict = Depends(require_admin)):
    return await _get_mod_policy()


@api_router.patch("/admin/moderation/policy")
async def admin_update_mod_policy(payload: ModPolicyIn, _admin: dict = Depends(require_admin)):
    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    if not updates:
        return await _get_mod_policy()
    await db.config.update_one({"_id": "ai_moderation"}, {"$set": updates}, upsert=True)
    return await _get_mod_policy()


@api_router.get("/admin/moderation/reports")
async def admin_list_mod_reports(status: str = "pending", limit: int = 50, _admin: dict = Depends(require_admin)):
    rows = await db.moderation_reports.find({"status": status}, {"_id": 0}).sort("created_at", -1).limit(min(limit, 200)).to_list(length=200)
    return rows


class ModActionIn(BaseModel):
    action: str
    reason: Optional[str] = ""


@api_router.post("/admin/moderation/reports/{report_id}/action")
async def admin_action_mod_report(report_id: str, payload: ModActionIn, admin: dict = Depends(require_admin)):
    rep = await db.moderation_reports.find_one({"report_id": report_id}, {"_id": 0})
    if not rep:
        raise HTTPException(status_code=404, detail="Rapport introuvable")
    act = payload.action
    target_user = rep.get("target_user_id")
    target_content = rep.get("target_content_id")
    if act == "delete_content" and target_content:
        await db.contents.delete_one({"content_id": target_content})
    elif act == "suspend_user" and target_user:
        await db.users.update_one({"user_id": target_user}, {"$set": {"suspended": True, "suspended_at": now_utc().isoformat()}})
    elif act == "ban_user" and target_user:
        await db.users.update_one({"user_id": target_user}, {"$set": {"banned": True, "banned_at": now_utc().isoformat()}})
    elif act in ("approve", "dismiss"):
        pass
    else:
        raise HTTPException(status_code=400, detail="Action invalide")
    await db.moderation_reports.update_one(
        {"report_id": report_id},
        {"$set": {"status": act, "resolved_at": now_utc().isoformat(), "resolved_by": admin["user_id"], "admin_reason": payload.reason or ""}},
    )
    return {"ok": True, "report_id": report_id, "action": act}


async def moderate_text(text: str, *, kind: str = "content", creator_id: Optional[str] = None) -> Optional[dict]:
    """Returns dict with severity/categories/action when text violates policy. None when clean."""
    policy = await _get_mod_policy()
    if not policy.get("enabled") or not text:
        return None
    txt = (text or "").strip()
    low = txt.lower()
    if policy.get("trust_verified_creators") and creator_id:
        c = await db.creators.find_one({"creator_id": creator_id}, {"_id": 0, "verified": 1}) or {}
        if c.get("verified"):
            return None
    blk = policy.get("keyword_blacklist") or []
    for kw in blk:
        kw_low = (kw or "").strip().lower()
        if kw_low and kw_low in low:
            return {"severity": "high", "categories": ["custom_keyword"], "matched": kw_low, "action": policy.get("action_default", "report")}
    import re as _re
    if policy.get("ban_external_contacts"):
        if _re.search(r"(?:\+?\d[\s\-\.]?){8,}", low) or _re.search(r"(?:telegram|whatsapp|snap(?:chat)?|discord|insta(?:gram)?|t\.me)\b", low):
            return {"severity": "medium", "categories": ["external_contact"], "action": policy.get("action_default", "report")}
    if policy.get("ban_scam_links"):
        if _re.search(r"(?:bit\.ly|t\.co|tinyurl|free\s*coins|click\s*here\s*to\s*win|earn\s+\$\d+)", low):
            return {"severity": "medium", "categories": ["scam_link"], "action": policy.get("action_scam_links") or "delete"}
    needs_llm = any([
        policy.get("ban_nudity"), policy.get("ban_violence"),
        policy.get("ban_hate_speech"), policy.get("ban_spam"),
        policy.get("ban_drugs"), policy.get("ban_weapons"),
        policy.get("ban_minors"), policy.get("ban_doxxing"),
    ])
    if not needs_llm:
        return None
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        api_key = os.environ.get("EMERGENT_LLM_KEY", "").strip()
        if not api_key:
            return None
        chat = LlmChat(api_key=api_key,
                       session_id=f"mod-{uuid.uuid4().hex[:8]}",
                       system_message=(
                            "Tu es un modérateur de contenu pour une plateforme premium SFW (compatible Stripe). "
                            "Analyse le texte et renvoie UNIQUEMENT un JSON: "
                            '{"violations":["nudity"|"violence"|"hate"|"spam"|"drugs"|"weapons"|"minors"|"doxxing"|"off_topic"|null...], "severity":"low|medium|high", "summary":"..."}.'
                            " Si rien d'illégal/inapproprié, renvoie violations=[] et severity=low.")
                       ).with_model("gemini", "gemini-2.5-flash")
        prompt = f"Type: {kind}\nTexte:\n```\n{txt[:1500]}\n```\nRenvoie le JSON."
        reply = await chat.send_message(UserMessage(text=prompt))
        body = reply.strip()
        if body.startswith("```"):
            body = body.strip("`").split("\n", 1)[-1].rsplit("```", 1)[0]
        parsed = json.loads(body)
        viols = [v for v in (parsed.get("violations") or []) if v]
        if not viols:
            return None
        flag_map = {"nudity": "ban_nudity", "violence": "ban_violence", "hate": "ban_hate_speech",
                    "spam": "ban_spam", "drugs": "ban_drugs", "weapons": "ban_weapons",
                    "minors": "ban_minors", "doxxing": "ban_doxxing", "off_topic": "ban_off_topic"}
        active = [v for v in viols if policy.get(flag_map.get(v, ""), False)]
        if not active:
            return None
        action = policy.get(f"action_{active[0]}") or policy.get("action_default", "report")
        return {"severity": parsed.get("severity") or "medium", "categories": active,
                "summary": parsed.get("summary") or "", "action": action}
    except Exception as e:
        logging.warning("Lou moderation failed (%s): %s", kind, e)
        return None


async def _record_mod_report(*, target_user_id, target_content_id, kind, source_text, verdict) -> str:
    rep_id = "mr_" + uuid.uuid4().hex[:12]
    await db.moderation_reports.insert_one({
        "report_id": rep_id,
        "target_user_id": target_user_id,
        "target_content_id": target_content_id,
        "kind": kind,
        "source_text": (source_text or "")[:600],
        "severity": verdict.get("severity") or "medium",
        "categories": verdict.get("categories") or [],
        "summary": verdict.get("summary") or "",
        "suggested_action": verdict.get("action") or "report",
        "status": "pending",
        "created_at": now_utc().isoformat(),
    })
    return rep_id


async def _maybe_auto_apply_violation(*, target_user_id, target_content_id, verdict, policy):
    action = verdict.get("action") or "report"
    if action == "delete" and target_content_id:
        await db.contents.delete_one({"content_id": target_content_id})
    elif action == "ban_user" and target_user_id:
        await db.users.update_one(
            {"user_id": target_user_id},
            {"$set": {"banned": True, "banned_at": now_utc().isoformat(), "banned_reason": "ai_moderation"}},
        )
    elif action == "hide" and target_content_id:
        await db.contents.update_one({"content_id": target_content_id}, {"$set": {"hidden_by_moderation": True}})
    threshold = int(policy.get("auto_suspend_after_violations") or 0)
    if threshold and target_user_id:
        cnt = await db.moderation_reports.count_documents({"target_user_id": target_user_id, "status": "pending"})
        if cnt >= threshold:
            await db.users.update_one(
                {"user_id": target_user_id},
                {"$set": {"suspended": True, "suspended_at": now_utc().isoformat(), "suspended_reason": f"ai_moderation_{cnt}_violations"}},
            )


# -------- Site config (public read, admin write) --------
# Curated SFW (Safe For Work) categories — designed to comply with Stripe TOS.
# Each category has: slug (canonical id, used in DB), label_fr (display name FR), emoji (visual cue).
# DO NOT add adult-coded categories (domination, fetish, sexy, etc.) — would trigger Stripe ban.
SFW_CATEGORIES = [
    # Mode & Beauté
    {"slug": "mode", "label": "Mode", "emoji": "👗", "group": "mode_beaute"},
    {"slug": "lifestyle", "label": "Lifestyle", "emoji": "✨", "group": "mode_beaute"},
    {"slug": "beaute", "label": "Beauté", "emoji": "💄", "group": "mode_beaute"},
    {"slug": "lingerie_elegante", "label": "Lingerie élégante", "emoji": "🎀", "group": "mode_beaute"},
    {"slug": "swimwear", "label": "Swimwear", "emoji": "👙", "group": "mode_beaute"},
    {"slug": "tatouage", "label": "Tatouage", "emoji": "🖤", "group": "mode_beaute"},
    # Sport & Fitness
    {"slug": "fitness", "label": "Fitness", "emoji": "💪", "group": "sport"},
    {"slug": "yoga", "label": "Yoga", "emoji": "🧘", "group": "sport"},
    {"slug": "pole_dance", "label": "Pole dance (artistique)", "emoji": "🤸", "group": "sport"},
    {"slug": "danse", "label": "Danse", "emoji": "💃", "group": "sport"},
    {"slug": "pilates", "label": "Pilates", "emoji": "🤍", "group": "sport"},
    {"slug": "sport", "label": "Sport", "emoji": "🏆", "group": "sport"},
    {"slug": "outdoor", "label": "Outdoor & aventure", "emoji": "🏔️", "group": "sport"},
    # Art & Culture
    {"slug": "art", "label": "Art", "emoji": "🎨", "group": "art"},
    {"slug": "photographie", "label": "Photographie", "emoji": "📸", "group": "art"},
    {"slug": "musique", "label": "Musique", "emoji": "🎵", "group": "art"},
    {"slug": "dj", "label": "DJ", "emoji": "🎧", "group": "art"},
    {"slug": "cosplay", "label": "Cosplay", "emoji": "🎭", "group": "art"},
    {"slug": "gaming", "label": "Gaming", "emoji": "🎮", "group": "art"},
    # Lifestyle & Wellness
    {"slug": "voyage", "label": "Voyage", "emoji": "✈️", "group": "wellness"},
    {"slug": "cuisine", "label": "Cuisine", "emoji": "🍳", "group": "wellness"},
    {"slug": "vin_mixologie", "label": "Vin & Mixologie", "emoji": "🍷", "group": "wellness"},
    {"slug": "bien_etre", "label": "Bien-être", "emoji": "🌿", "group": "wellness"},
    {"slug": "meditation", "label": "Méditation & Mindset", "emoji": "🧠", "group": "wellness"},
    {"slug": "coaching", "label": "Coaching", "emoji": "🎯", "group": "wellness"},
    # Glamour & Premium
    {"slug": "glamour", "label": "Glamour", "emoji": "✨", "group": "glamour"},
    {"slug": "boudoir", "label": "Boudoir artistique", "emoji": "🖼️", "group": "glamour"},
    # Vie & Authenticité
    {"slug": "vlog", "label": "Vlog & Daily life", "emoji": "📹", "group": "life"},
    {"slug": "coulisses", "label": "Coulisses & BTS", "emoji": "🎬", "group": "life"},
    {"slug": "asmr_relax", "label": "ASMR & Relaxation", "emoji": "🌙", "group": "life"},
]
SFW_CATEGORY_SLUGS = {c["slug"] for c in SFW_CATEGORIES}
SFW_CATEGORY_LABELS = [c["label"] for c in SFW_CATEGORIES]


@api_router.get("/categories")
async def list_categories():
    """Public endpoint returning the canonical SFW category catalog used across the platform.
    Frontend uses this for: creator profile editor, creators list filter, search."""
    return {"categories": SFW_CATEGORIES}


DEFAULT_SITE_CONFIG = {
    "hero_title": "me&you — le club privé",
    "hero_subtitle": "Rejoins les créatrices vérifiées sur la plateforme française la plus exclusive. Contenu premium, messagerie directe, expérience immersive.",
    "hero_cta": "Explorer les créatrices",
    "about_text": "me&you est une plateforme française dédiée aux créatrices de contenu premium. Notre mission : offrir un espace sûr, élégant et rémunérateur à 80% pour les créatrices.",
    "footer_tagline": "La plateforme française pour fans et créatrices premium. Contenu exclusif, messagerie privée, expérience immersive.",
    "categories": SFW_CATEGORY_LABELS,
    "contact_email": "contact@meandyou.fans",
    "faq": [
        {"q": "Comment fonctionne l'économie de coins ?", "a": "1 coin = 0,10 €. Tu achètes des packs pour t'abonner, donner des pourboires et déverrouiller du contenu."},
        {"q": "Comment les créatrices sont-elles rémunérées ?", "a": "Les créatrices reçoivent 80 % de la valeur en euros, versée sur leur IBAN sous 3 à 5 jours après demande de retrait."},
        {"q": "Le contenu est-il modéré ?", "a": "Oui, toutes les créatrices sont vérifiées et le contenu est modéré par notre équipe."},
    ],
}

async def _get_site_config() -> dict:
    doc = await db.site_config.find_one({"_id": "main"}, {"_id": 0})
    if not doc:
        return DEFAULT_SITE_CONFIG.copy()
    merged = {**DEFAULT_SITE_CONFIG, **doc}
    return merged

@api_router.get("/site-config")
async def get_site_config():
    return await _get_site_config()

@api_router.patch("/admin/site-config")
async def admin_update_site_config(payload: SiteConfigIn, _admin: dict = Depends(require_admin)):
    update = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if not update:
        return await _get_site_config()
    update["updated_at"] = now_utc().isoformat()
    await db.site_config.update_one(
        {"_id": "main"},
        {"$set": update, "$setOnInsert": {"_id": "main", "created_at": now_utc().isoformat()}},
        upsert=True,
    )
    return await _get_site_config()

# -------- Saved cards (real Stripe Elements / SetupIntent) --------
# IMPORTANT: The emergentintegrations library sets stripe.api_base to the emergent proxy
# when using sk_test_emergent. For LIVE keys, we need to use the direct Stripe API.
STRIPE_DIRECT_API_BASE = "https://api.stripe.com"

def _stripe_elements_enabled() -> bool:
    return bool(STRIPE_ELEMENTS_SECRET_KEY and STRIPE_PUBLISHABLE_KEY)

def _with_direct_stripe_api():
    """Context manager to temporarily use direct Stripe API instead of emergent proxy"""
    import contextlib
    @contextlib.contextmanager
    def ctx():
        old_base = stripe_sdk.api_base
        stripe_sdk.api_base = STRIPE_DIRECT_API_BASE
        try:
            yield
        finally:
            stripe_sdk.api_base = old_base
    return ctx()

async def _get_or_create_stripe_customer(user_id: str) -> str:
    u = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not u:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    cust_id = u.get("stripe_customer_id")
    # If we have a cached customer_id, verify it still exists on the current Stripe account
    # (defensive: the Stripe account / key may have changed between sessions)
    if cust_id:
        try:
            with _with_direct_stripe_api():
                cust_obj = stripe_sdk.Customer.retrieve(cust_id, api_key=STRIPE_ELEMENTS_SECRET_KEY)
            cust = cust_obj.to_dict() if hasattr(cust_obj, "to_dict") else dict(cust_obj)
            if not cust.get("deleted"):
                return cust_id
        except Exception as e:
            logger.warning("stripe customer %s stale (will recreate): %s", cust_id, e)
            await db.users.update_one({"user_id": user_id}, {"$unset": {"stripe_customer_id": ""}})
            await db.saved_cards.delete_many({"user_id": user_id})
            cust_id = None
    try:
        with _with_direct_stripe_api():
            cust_obj = stripe_sdk.Customer.create(
                email=u.get("email"),
                name=u.get("name") or u.get("email"),
                metadata={"user_id": user_id},
                api_key=STRIPE_ELEMENTS_SECRET_KEY,
            )
        cust = cust_obj.to_dict() if hasattr(cust_obj, "to_dict") else dict(cust_obj)
    except Exception as e:
        logger.exception("stripe customer create failed: %s", e)
        raise HTTPException(status_code=502, detail="Erreur Stripe (client)")
    cust_id = cust["id"]
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"stripe_customer_id": cust_id}},
    )
    return cust_id

@api_router.get("/wallet/stripe-config")
async def stripe_config():
    return {
        "publishable_key": STRIPE_PUBLISHABLE_KEY,
        "enabled": _stripe_elements_enabled(),
    }

@api_router.post("/wallet/cards/setup-intent")
async def create_setup_intent(user: dict = Depends(get_current_user)):
    if not _stripe_elements_enabled():
        raise HTTPException(status_code=503, detail="Stripe Elements non configuré")
    customer_id = await _get_or_create_stripe_customer(user["user_id"])
    try:
        with _with_direct_stripe_api():
            si = stripe_sdk.SetupIntent.create(
                customer=customer_id,
                payment_method_types=["card"],
                usage="off_session",
                metadata={"user_id": user["user_id"]},
                api_key=STRIPE_ELEMENTS_SECRET_KEY,
            )
    except Exception as e:
        logger.exception("stripe setup intent create failed: %s", e)
        raise HTTPException(status_code=502, detail="Erreur Stripe (setup intent)")
    return {
        "client_secret": si["client_secret"],
        "customer_id": customer_id,
        "publishable_key": STRIPE_PUBLISHABLE_KEY,
    }

@api_router.get("/wallet/cards")
async def list_cards(user: dict = Depends(get_current_user)):
    items = await db.saved_cards.find(
        {"user_id": user["user_id"]}, {"_id": 0},
    ).sort("created_at", -1).to_list(length=20)
    return items

@api_router.post("/wallet/cards/confirm")
async def confirm_card(payload: ConfirmCardIn, user: dict = Depends(get_current_user)):
    if not _stripe_elements_enabled():
        raise HTTPException(status_code=503, detail="Stripe Elements non configuré")
    pm_id = payload.payment_method_id
    customer_id = await _get_or_create_stripe_customer(user["user_id"])
    try:
        with _with_direct_stripe_api():
            pm_obj = stripe_sdk.PaymentMethod.retrieve(pm_id, api_key=STRIPE_ELEMENTS_SECRET_KEY)
        pm = pm_obj.to_dict() if hasattr(pm_obj, "to_dict") else dict(pm_obj)
    except Exception as e:
        logger.exception("stripe pm retrieve failed: %s", e)
        raise HTTPException(status_code=400, detail="PaymentMethod introuvable")
    # Attach if not attached yet
    if pm.get("customer") != customer_id:
        try:
            with _with_direct_stripe_api():
                stripe_sdk.PaymentMethod.attach(
                    pm_id, customer=customer_id, api_key=STRIPE_ELEMENTS_SECRET_KEY,
                )
        except Exception as e:
            logger.exception("stripe pm attach failed: %s", e)
            raise HTTPException(status_code=400, detail="Attachement carte échoué")
    card = pm.get("card") or {}
    existing = await db.saved_cards.count_documents({"user_id": user["user_id"]})
    # Dedupe (same PM id)
    await db.saved_cards.delete_one({"user_id": user["user_id"], "card_id": pm_id})
    doc = {
        "card_id": pm_id,
        "user_id": user["user_id"],
        "stripe_customer_id": customer_id,
        "brand": (card.get("brand") or "card").title(),
        "last4": card.get("last4") or "••••",
        "exp_month": int(card.get("exp_month") or 0),
        "exp_year": int(card.get("exp_year") or 0),
        "holder_name": (pm.get("billing_details") or {}).get("name") or "",
        "is_default": existing == 0,
        "is_simulated": False,
        "created_at": now_utc().isoformat(),
    }
    await db.saved_cards.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.delete("/wallet/cards/{card_id}")
async def remove_card(card_id: str, user: dict = Depends(get_current_user)):
    existing = await db.saved_cards.find_one({"user_id": user["user_id"], "card_id": card_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Carte introuvable")
    # Detach from Stripe if real card
    if not existing.get("is_simulated") and _stripe_elements_enabled():
        try:
            with _with_direct_stripe_api():
                stripe_sdk.PaymentMethod.detach(card_id, api_key=STRIPE_ELEMENTS_SECRET_KEY)
        except Exception as e:
            logger.warning("stripe pm detach failed for %s: %s", card_id, e)
    await db.saved_cards.delete_one({"user_id": user["user_id"], "card_id": card_id})
    # If the deleted card was default, set another as default
    remaining = await db.saved_cards.find(
        {"user_id": user["user_id"]}, {"_id": 0},
    ).to_list(length=20)
    if remaining and not any(c.get("is_default") for c in remaining):
        await db.saved_cards.update_one(
            {"card_id": remaining[0]["card_id"]},
            {"$set": {"is_default": True}},
        )
    return {"ok": True}

@api_router.post("/wallet/cards/{card_id}/default")
async def set_default_card(card_id: str, user: dict = Depends(get_current_user)):
    card = await db.saved_cards.find_one({"user_id": user["user_id"], "card_id": card_id})
    if not card:
        raise HTTPException(status_code=404, detail="Carte introuvable")
    await db.saved_cards.update_many({"user_id": user["user_id"]}, {"$set": {"is_default": False}})
    await db.saved_cards.update_one({"card_id": card_id}, {"$set": {"is_default": True}})
    return {"ok": True}

# -------- Auto-reload settings --------
@api_router.get("/wallet/auto-reload")
async def get_auto_reload(user: dict = Depends(get_current_user)):
    settings = await db.auto_reload_settings.find_one(
        {"user_id": user["user_id"]}, {"_id": 0},
    ) or {
        "user_id": user["user_id"],
        "enabled": False,
        "threshold": 50,
        "pack_id": "popular",
    }
    return settings

@api_router.post("/wallet/auto-reload")
async def set_auto_reload(payload: AutoReloadIn, user: dict = Depends(get_current_user)):
    if payload.pack_id not in COIN_PACKS:
        raise HTTPException(status_code=400, detail="Pack invalide")
    if payload.threshold < 10 or payload.threshold > 5000:
        raise HTTPException(status_code=400, detail="Seuil invalide (10-5000)")
    if payload.enabled:
        card = await db.saved_cards.find_one({"user_id": user["user_id"], "is_default": True})
        if not card:
            raise HTTPException(status_code=400,
                                detail="Ajoute une carte par défaut avant d'activer")
    await db.auto_reload_settings.update_one(
        {"user_id": user["user_id"]},
        {"$set": {
            "user_id": user["user_id"],
            "enabled": payload.enabled,
            "threshold": payload.threshold,
            "pack_id": payload.pack_id,
            "updated_at": now_utc().isoformat(),
        }},
        upsert=True,
    )
    return {"ok": True, "enabled": payload.enabled,
            "threshold": payload.threshold, "pack_id": payload.pack_id}

# -------- Admin: Payouts review --------
@api_router.get("/admin/payouts")
async def admin_list_payouts(status: Optional[str] = None,
                             _admin: dict = Depends(require_admin)):
    query = {}
    if status:
        query["status"] = status
    items = await db.payout_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(length=200)
    creator_ids = list({p["creator_id"] for p in items})
    creators = {c["creator_id"]: c for c in
                await db.creators.find({"creator_id": {"$in": creator_ids}},
                                       {"_id": 0}).to_list(length=400)}
    users = {u["user_id"]: u for u in
             await db.users.find({"user_id": {"$in": creator_ids}},
                                 {"_id": 0, "password_hash": 0}).to_list(length=400)}
    for p in items:
        p["creator"] = creators.get(p["creator_id"])
        p["user"] = users.get(p["creator_id"])
    return items

@api_router.post("/admin/payouts/{request_id}/approve")
async def admin_approve_payout(request_id: str, admin: dict = Depends(require_admin)):
    req = await db.payout_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Demande introuvable")
    if req["status"] != "pending":
        raise HTTPException(status_code=400, detail="Déjà traité")
    await db.payout_requests.update_one(
        {"request_id": request_id},
        {"$set": {"status": "paid",
                  "paid_at": now_utc().isoformat(),
                  "approved_by": admin["user_id"]}},
    )
    await _create_notification(
        req["creator_id"], "payout_paid",
        f"Retrait validé · {req['eur_value']:.2f} €",
        f"{req['coins']} coins ont été versés sur ton compte.",
        {"request_id": request_id, "eur": req["eur_value"]},
    )
    # Email confirmation to the creator (best-effort)
    try:
        from emails import _send, _layout
        creator_user = await db.users.find_one({"user_id": req["creator_id"]}, {"_id": 0})
        if creator_user and creator_user.get("email"):
            iban_tail = (req.get("iban") or "").replace(" ", "")[-4:] or "—"
            body = (
                f"<p>Salut <strong>{creator_user.get('name') or 'créatrice'}</strong>,</p>"
                f"<p>Bonne nouvelle ! Ton retrait a été validé et le virement SEPA est en route 🎉</p>"
                f"<table style=\"width:100%;border-collapse:collapse;background:#0E0E0F;border-radius:14px;overflow:hidden;margin:18px 0\">"
                f"  <tr><td style=\"padding:12px 18px;color:#9ca3af;font-size:12px;text-transform:uppercase;letter-spacing:0.1em\">Montant</td>"
                f"      <td style=\"padding:12px 18px;color:#fff;font-weight:700;text-align:right\">{req['eur_value']:.2f} €</td></tr>"
                f"  <tr><td style=\"padding:12px 18px;color:#9ca3af;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;border-top:1px solid #1f1f23\">Coins retirés</td>"
                f"      <td style=\"padding:12px 18px;color:#fff;font-weight:700;text-align:right;border-top:1px solid #1f1f23\">{req['coins']}</td></tr>"
                f"  <tr><td style=\"padding:12px 18px;color:#9ca3af;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;border-top:1px solid #1f1f23\">IBAN</td>"
                f"      <td style=\"padding:12px 18px;color:#fff;font-family:monospace;text-align:right;border-top:1px solid #1f1f23\">•••• {iban_tail}</td></tr>"
                f"  <tr><td style=\"padding:12px 18px;color:#9ca3af;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;border-top:1px solid #1f1f23\">Référence</td>"
                f"      <td style=\"padding:12px 18px;color:#fff;font-family:monospace;text-align:right;border-top:1px solid #1f1f23\">{request_id[:12]}</td></tr>"
                f"</table>"
                f"<p>Les fonds arriveront sur ton compte sous <strong>1 à 3 jours ouvrés</strong> selon ta banque.</p>"
                f"<p style=\"color:#9ca3af;font-size:12px\">Si tu as la moindre question, réponds à cet email ou contacte <a href=\"mailto:contact@meandyou.fans\" style=\"color:#E879F9\">contact@meandyou.fans</a>.</p>"
            )
            html = _layout(
                title="Ton retrait est en route 💸",
                preheader=f"{req['eur_value']:.2f} € versés sur ton compte SEPA",
                body_html=body,
                cta_text="Voir mon dashboard",
                cta_url="https://meandyou.fans/dashboard",
            )
            await _send(creator_user["email"], "Ton retrait me&you est confirmé 💸", html)
    except Exception as e:
        logging.warning("payout email failed: %s", e)
    return {"ok": True}


@api_router.post("/admin/payouts/{request_id}/reject")
async def admin_reject_payout(request_id: str, admin: dict = Depends(require_admin)):
    req = await db.payout_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Demande introuvable")
    if req["status"] != "pending":
        raise HTTPException(status_code=400, detail="Déjà traité")
    # Refund coins to creator wallet
    await _credit_wallet(req["creator_id"], int(req["coins"]),
                         reason="payout_refund", related_id=request_id)
    await db.payout_requests.update_one(
        {"request_id": request_id},
        {"$set": {"status": "rejected",
                  "rejected_at": now_utc().isoformat(),
                  "approved_by": admin["user_id"]}},
    )
    await _create_notification(
        req["creator_id"], "payout_rejected",
        "Retrait refusé",
        f"{req['coins']} coins remboursés sur ton solde.",
        {"request_id": request_id},
    )
    # Email rejection notice to the creator (best-effort)
    try:
        from emails import _send, _layout
        creator_user = await db.users.find_one({"user_id": req["creator_id"]}, {"_id": 0})
        if creator_user and creator_user.get("email"):
            body = (
                f"<p>Salut <strong>{creator_user.get('name') or 'créatrice'}</strong>,</p>"
                f"<p>Ta demande de retrait n'a pas pu être traitée pour le moment. "
                f"Pas d'inquiétude : <strong>{req['coins']} coins ({req['eur_value']:.2f} €) ont été re-crédités</strong> sur ton solde.</p>"
                f"<p style=\"color:#9ca3af;font-size:13px\">Cause possible : IBAN invalide, identité non vérifiée, ou dépassement du plafond mensuel. "
                f"Vérifie tes informations dans <a href=\"https://meandyou.fans/bank\" style=\"color:#E879F9\">/bank</a> et soumets une nouvelle demande.</p>"
                f"<p>Une question ? Réponds à cet email ou écris à <a href=\"mailto:contact@meandyou.fans\" style=\"color:#E879F9\">contact@meandyou.fans</a>.</p>"
            )
            html = _layout(
                title="Demande de retrait refusée",
                preheader=f"{req['coins']} coins re-crédités sur ton solde",
                body_html=body,
                cta_text="Vérifier mes infos bancaires",
                cta_url="https://meandyou.fans/bank",
            )
            await _send(creator_user["email"], "Ta demande de retrait a été refusée", html)
    except Exception as e:
        logging.warning("payout reject email failed: %s", e)
    return {"ok": True}

# -------- Admin: Dashboard Stats --------
@api_router.get("/admin/stats")
async def admin_stats(_admin: dict = Depends(require_admin)):
    users_count = await db.users.count_documents({})
    creators_count = await db.creators.count_documents({})
    fans_count = await db.users.count_documents({"role": "fan"})
    banned_count = await db.users.count_documents({"banned": True})
    active_subs = await db.subscriptions.count_documents({"status": "active"})
    content_count = await db.content.count_documents({})
    flagged_count = await db.content.count_documents({"flagged": True})
    pending_kyc = await db.verifications.count_documents({"status": {"$in": ["processing", "pending"]}})
    pending_payouts = await db.payout_requests.count_documents({"status": "pending"})

    # Revenue totals (coin packs sold, paid)
    gmv_coins = 0
    gmv_eur = 0.0
    async for tx in db.payment_transactions.find({"type": "coin_pack", "payment_status": "paid"}, {"_id": 0}):
        gmv_coins += int(tx.get("coins", 0))
        gmv_eur += float(tx.get("amount", 0))

    last_7_days = (now_utc() - timedelta(days=7)).isoformat()
    new_users_7d = await db.users.count_documents({"created_at": {"$gte": last_7_days}})

    return {
        "users_count": users_count,
        "creators_count": creators_count,
        "fans_count": fans_count,
        "banned_count": banned_count,
        "active_subscriptions": active_subs,
        "content_count": content_count,
        "flagged_count": flagged_count,
        "pending_kyc": pending_kyc,
        "pending_payouts": pending_payouts,
        "gmv_coins": gmv_coins,
        "gmv_eur": round(gmv_eur, 2),
        "new_users_7d": new_users_7d,
    }

@api_router.post("/admin/payments/reapply")
async def admin_reapply_stuck_payments(_admin: dict = Depends(require_admin)):
    """Backfill: scan paid coin_pack transactions that were marked `applied=true`
    BUT whose coin credit ledger entry never landed (caused by the old early-return
    bug in _apply_payment_success). Idempotent — uses ledger lookups to avoid
    double-crediting users who DID get their coins.
    """
    fixed = []
    skipped = 0
    cursor = db.payment_transactions.find(
        {"type": "coin_pack", "payment_status": "paid", "applied": True},
        {"_id": 0},
    )
    async for tx in cursor:
        coins = int(tx.get("coins") or 0)
        if coins <= 0:
            skipped += 1
            continue
        sid = tx.get("session_id")
        # Has a credit ledger entry already? Skip.
        ledger = await db.coin_transactions.find_one({
            "user_id": tx["user_id"],
            "reason": "coin_pack",
            "related_id": sid,
        })
        if ledger:
            skipped += 1
            continue
        # Credit coins now
        await _credit_wallet(tx["user_id"], coins, reason="coin_pack", related_id=sid)
        # Notify
        try:
            await _create_notification(
                tx["user_id"], "payment",
                f"+{coins} coins ajoutés 💰",
                f"Recharge de {tx.get('amount', 0):.2f}€ rétablie.",
                {"type": "coin_pack", "coins": coins, "backfill": True},
            )
        except Exception:
            pass
        fixed.append({"session_id": sid, "user_id": tx["user_id"], "coins": coins,
                      "amount": float(tx.get("amount") or 0)})
    return {"ok": True, "fixed_count": len(fixed), "skipped_count": skipped, "fixed": fixed}


# -------- Admin: User management --------
@api_router.get("/admin/users")
async def admin_list_users(q: Optional[str] = None, role: Optional[str] = None,
                           segment: Optional[str] = None,
                           limit: int = 50, _admin: dict = Depends(require_admin)):
    """Admin user listing. New `segment` param supports the broadcast tool:
    - `inactive_30d`: never logged in for 30 days
    - `active_subscribers`: at least one active subscription as fan
    - `top_creators`: creators by subscribers_count desc
    """
    query = {}
    if role:
        query["role"] = role
    if q:
        query["$or"] = [
            {"email": {"$regex": q, "$options": "i"}},
            {"name": {"$regex": q, "$options": "i"}},
            {"username": {"$regex": q, "$options": "i"}},
        ]
    if segment == "inactive_30d":
        cutoff = (now_utc() - timedelta(days=30)).isoformat()
        query["$or"] = (query.get("$or") or []) + [
            {"last_login_at": {"$lt": cutoff}},
            {"last_login_at": {"$exists": False}},
        ]
    elif segment == "active_subscribers":
        active_subs = await db.subscriptions.find(
            {"status": "active"}, {"_id": 0, "user_id": 1},
        ).to_list(length=10000)
        sub_ids = list({s["user_id"] for s in active_subs})
        query["user_id"] = {"$in": sub_ids}
    elif segment == "top_creators":
        creator_rows = await db.creators.find(
            {}, {"_id": 0, "creator_id": 1},
        ).sort("subscribers_count", -1).limit(limit).to_list(length=limit)
        ids = [c["creator_id"] for c in creator_rows]
        query["user_id"] = {"$in": ids}
    users = await db.users.find(query, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(length=limit)
    # Annotate each user with has_creator_profile for admin visibility
    if users:
        uids = [u["user_id"] for u in users]
        creators_set = {c["creator_id"] async for c in db.creators.find(
            {"creator_id": {"$in": uids}}, {"_id": 0, "creator_id": 1})}
        for u in users:
            u["has_creator_profile"] = u["user_id"] in creators_set
    return users


class AdminBroadcastIn(BaseModel):
    """Mass-email payload for the admin broadcast tool. The recipient set
    is computed server-side from `segment` (and optional explicit
    `recipient_ids`) so the admin never has to manually paste emails."""
    subject: str = Field(min_length=2, max_length=200)
    body_html: str = Field(min_length=2, max_length=20000)
    segment: str = Field(default="all")  # all | fans | creators | active_subscribers | inactive_30d
    only_email_opted_in: bool = True
    recipient_ids: Optional[List[str]] = None
    cta_text: Optional[str] = None
    cta_url: Optional[str] = None
    test_email: Optional[str] = None  # if set, send to this address only (preview)


@api_router.get("/admin/broadcast/preview")
async def admin_broadcast_preview(segment: str = "all",
                                    only_email_opted_in: bool = True,
                                    _admin: dict = Depends(require_admin)):
    """Returns the recipient count for a segment so the admin sees what
    they're about to send before pulling the trigger."""
    targets = await _resolve_broadcast_targets(segment, only_email_opted_in, None)
    return {"segment": segment, "count": len(targets)}


async def _resolve_broadcast_targets(segment: str, only_opted_in: bool,
                                       recipient_ids: Optional[List[str]]) -> List[dict]:
    if recipient_ids:
        users = await db.users.find(
            {"user_id": {"$in": recipient_ids}, "banned": {"$ne": True}},
            {"_id": 0, "user_id": 1, "email": 1, "name": 1, "email_notifications_enabled": 1},
        ).to_list(length=10000)
    else:
        q: dict = {"banned": {"$ne": True}}
        if segment == "fans":
            q["role"] = "fan"
        elif segment == "creators":
            q["role"] = {"$in": ["creator", "admin"]}
        elif segment == "active_subscribers":
            subs = await db.subscriptions.find(
                {"status": "active"}, {"_id": 0, "user_id": 1},
            ).to_list(length=10000)
            q["user_id"] = {"$in": list({s["user_id"] for s in subs})}
        elif segment == "inactive_30d":
            cutoff = (now_utc() - timedelta(days=30)).isoformat()
            q["$or"] = [
                {"last_login_at": {"$lt": cutoff}},
                {"last_login_at": {"$exists": False}},
            ]
        users = await db.users.find(
            q, {"_id": 0, "user_id": 1, "email": 1, "name": 1, "email_notifications_enabled": 1},
        ).to_list(length=10000)
    if only_opted_in:
        users = [u for u in users if u.get("email_notifications_enabled", True)]
    return [u for u in users if u.get("email")]


@api_router.post("/admin/broadcast/send")
async def admin_broadcast_send(payload: AdminBroadcastIn,
                                  background: BackgroundTasks,
                                  admin: dict = Depends(require_admin)):
    if payload.test_email:
        await send_admin_broadcast(
            to=payload.test_email, subject=payload.subject,
            body_html=payload.body_html, frontend_url=FRONTEND_URL,
            recipient_name="Cher membre", cta_text=payload.cta_text,
            cta_url=payload.cta_url,
        )
        return {"ok": True, "sent": 1, "mode": "test"}
    targets = await _resolve_broadcast_targets(
        payload.segment, payload.only_email_opted_in, payload.recipient_ids,
    )
    bcast_id = "bc_" + uuid.uuid4().hex[:12]
    await db.broadcasts.insert_one({
        "broadcast_id": bcast_id,
        "subject": payload.subject,
        "body_html": payload.body_html,
        "segment": payload.segment,
        "recipients_count": len(targets),
        "sent_by": admin["user_id"],
        "status": "queued",
        "created_at": now_utc().isoformat(),
    })

    async def _runner(targets_local, bid):
        sent = 0
        for u in targets_local:
            ok = await send_admin_broadcast(
                to=u["email"], subject=payload.subject,
                body_html=payload.body_html, frontend_url=FRONTEND_URL,
                recipient_name=u.get("name") or "Cher membre",
                cta_text=payload.cta_text, cta_url=payload.cta_url,
            )
            if ok:
                sent += 1
        await db.broadcasts.update_one(
            {"broadcast_id": bid},
            {"$set": {"sent_count": sent, "status": "done",
                      "completed_at": now_utc().isoformat()}},
        )
    background.add_task(_runner, targets, bcast_id)
    return {"ok": True, "broadcast_id": bcast_id, "queued": len(targets), "mode": "broadcast"}


@api_router.get("/admin/broadcasts")
async def admin_broadcasts_list(_admin: dict = Depends(require_admin)):
    rows = await db.broadcasts.find({}, {"_id": 0}).sort("created_at", -1).limit(50).to_list(length=50)
    return rows


@api_router.patch("/admin/users/{user_id}")
async def admin_update_user(user_id: str, payload: UserUpdateIn,
                            _admin: dict = Depends(require_admin)):
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="Aucune modification")
    if "role" in update and update["role"] not in ("fan", "creator", "admin"):
        raise HTTPException(status_code=400, detail="Rôle invalide")
    res = await db.users.update_one({"user_id": user_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    # Ensure creator profile exists when role changes to creator
    if update.get("role") == "creator":
        user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
        if user and not await db.creators.find_one({"creator_id": user_id}):
            await db.creators.insert_one({
                "creator_id": user_id, "user_id": user_id,
                "display_name": user.get("name", "Créatrice"),
                "handle": user["email"].split("@")[0],
                "bio": "", "subscription_price": 9.99,
                "avatar_url": user.get("avatar_url"),
                "cover_url": None, "tags": [],
                "total_earned_coins": 0, "subscribers_count": 0,
                "created_at": now_utc().isoformat(),
            })
    # Clean up creator profile when role is demoted from creator to fan/admin
    if update.get("role") in ("fan", "admin"):
        await db.creators.delete_one({"creator_id": user_id})
    return {"ok": True}

@api_router.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, admin: dict = Depends(require_admin)):
    if user_id == admin["user_id"]:
        raise HTTPException(status_code=400, detail="Tu ne peux pas te supprimer toi-même")
    res = await db.users.delete_one({"user_id": user_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    # Cascade: creator profile + content + subscriptions
    await db.creators.delete_one({"creator_id": user_id})
    await db.content.delete_many({"creator_id": user_id})
    await db.subscriptions.delete_many({"$or": [{"user_id": user_id}, {"creator_id": user_id}]})
    await db.wallets.delete_one({"user_id": user_id})
    await db.saved_cards.delete_many({"user_id": user_id})
    return {"ok": True}

@api_router.post("/admin/users/sync-roles")
async def admin_sync_user_roles(_admin: dict = Depends(require_admin)):
    """Audit & fix role/creator_profile inconsistencies:
    1. Users with role='fan' or 'admin' but a creator profile → delete the orphan creator profile
    2. Users with role='creator' but no creator profile → create a minimal profile
    Returns counts of both kinds of fixes."""
    removed_orphans = 0
    created_missing = 0
    # 1. Orphan creator profiles (user is fan/admin but still in creators collection)
    async for c in db.creators.find({}, {"_id": 0, "creator_id": 1}):
        u = await db.users.find_one({"user_id": c["creator_id"]}, {"_id": 0, "role": 1})
        if not u or u.get("role") != "creator":
            await db.creators.delete_one({"creator_id": c["creator_id"]})
            removed_orphans += 1
    # 2. Missing creator profiles (user marked as creator but no profile)
    async for u in db.users.find({"role": "creator"}, {"_id": 0, "user_id": 1, "name": 1, "email": 1, "avatar_url": 1}):
        if not await db.creators.find_one({"creator_id": u["user_id"]}):
            await db.creators.insert_one({
                "creator_id": u["user_id"], "user_id": u["user_id"],
                "display_name": u.get("name", "Créatrice"),
                "handle": u["email"].split("@")[0],
                "bio": "", "subscription_price": 9.99,
                "avatar_url": u.get("avatar_url"),
                "cover_url": None, "tags": [],
                "total_earned_coins": 0, "subscribers_count": 0,
                "created_at": now_utc().isoformat(),
            })
            created_missing += 1
    return {"ok": True, "removed_orphan_creator_profiles": removed_orphans, "created_missing_creator_profiles": created_missing}

# -------- Admin: ban / unban / grant coins --------
class AdminCoinGrantIn(BaseModel):
    amount: int = Field(ge=1, le=100000)
    reason: Optional[str] = "admin_grant"

@api_router.post("/admin/users/{user_id}/ban")
async def admin_ban_user(user_id: str, admin: dict = Depends(require_admin)):
    if user_id == admin["user_id"]:
        raise HTTPException(status_code=400, detail="Tu ne peux pas te bannir toi-même")
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0, "email": 1})
    if not target:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    await db.users.update_one({"user_id": user_id}, {"$set": {
        "banned": True,
        "banned_at": now_utc().isoformat(),
        "banned_by": admin["user_id"],
    }})
    await db.auth_sessions.delete_many({"user_id": user_id})
    return {"ok": True, "email": target["email"]}

@api_router.post("/admin/users/{user_id}/unban")
async def admin_unban_user(user_id: str, _admin: dict = Depends(require_admin)):
    res = await db.users.update_one({"user_id": user_id}, {"$set": {"banned": False},
                                                            "$unset": {"banned_at": "", "banned_by": ""}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    return {"ok": True}

@api_router.post("/admin/users/{user_id}/grant-coins")
async def admin_grant_coins(user_id: str, payload: AdminCoinGrantIn,
                             admin: dict = Depends(require_admin)):
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0, "email": 1, "name": 1})
    if not target:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    await _credit_wallet(user_id, int(payload.amount), reason=payload.reason or "admin_grant",
                          related_id=admin["user_id"])
    await _create_notification(user_id, "admin_grant",
                                f"+{payload.amount} coins reçus 🎁",
                                f"L'équipe me&you t'a crédité {payload.amount} coins ({payload.reason}).",
                                {"amount": payload.amount})
    w = await db.wallets.find_one({"user_id": user_id}, {"_id": 0, "coin_balance": 1})
    return {"ok": True, "granted": int(payload.amount), "new_balance": (w or {}).get("coin_balance", 0)}

@api_router.post("/admin/users/{user_id}/deduct-coins")
async def admin_deduct_coins(user_id: str, payload: AdminCoinGrantIn,
                              admin: dict = Depends(require_admin)):
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0, "email": 1})
    if not target:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    w = await db.wallets.find_one({"user_id": user_id}, {"_id": 0, "coin_balance": 1})
    current = int((w or {}).get("coin_balance", 0))
    to_deduct = min(int(payload.amount), current)
    if to_deduct > 0:
        await _debit_wallet(user_id, to_deduct, reason=payload.reason or "admin_deduct",
                             related_id=admin["user_id"])
    w2 = await db.wallets.find_one({"user_id": user_id}, {"_id": 0, "coin_balance": 1})
    return {"ok": True, "deducted": to_deduct, "new_balance": (w2 or {}).get("coin_balance", 0)}


# -------- Admin: creator payouts & bank info --------
@api_router.get("/admin/creators/payouts")
async def admin_list_creators_payouts(_admin: dict = Depends(require_admin)):
    """List every creator with their current earnings, bank info and pending payouts — so admin
    can issue manual SEPA transfers and mark payouts as paid."""
    creators = await db.creators.find({}, {"_id": 0}).sort("display_name", 1).to_list(length=1000)
    out = []
    for c in creators:
        cid = c["creator_id"]
        user = await db.users.find_one({"user_id": cid}, {"_id": 0, "password_hash": 0})
        wallet = await db.wallets.find_one({"user_id": cid}, {"_id": 0, "coin_balance": 1})
        coins = int((wallet or {}).get("coin_balance") or 0)
        bank = await db.creator_bank_accounts.find_one({"creator_id": cid}, {"_id": 0})
        pending = await db.payout_requests.find(
            {"creator_id": cid, "status": "pending"}, {"_id": 0},
        ).sort("created_at", -1).to_list(length=20)
        completed = await db.payout_requests.count_documents({"creator_id": cid, "status": "paid"})
        out.append({
            "creator_id": cid,
            "display_name": c.get("display_name"),
            "handle": c.get("handle"),
            "avatar_url": c.get("avatar_url"),
            "email": (user or {}).get("email"),
            "name": (user or {}).get("name"),
            "balance_coins": coins,
            "balance_eur": round(coins_to_eur(coins) * CREATOR_PAYOUT_RATIO, 2),
            "bank": bank,  # may be None if creator didn't fill IBAN yet
            "stripe_account_id": c.get("stripe_account_id"),
            "stripe_account_payouts_enabled": bool(c.get("stripe_account_payouts_enabled")),
            "pending_payouts": pending,
            "completed_payouts_count": completed,
        })
    return out


@api_router.get("/admin/creators/{creator_id}/bank")
async def admin_get_creator_bank(creator_id: str, _admin: dict = Depends(require_admin)):
    """Return IBAN/BIC/holder for a single creator. Includes user email for SEPA transfer reference."""
    user = await db.users.find_one({"user_id": creator_id}, {"_id": 0, "password_hash": 0})
    if not user or user.get("role") != "creator":
        raise HTTPException(status_code=404, detail="Créatrice introuvable")
    creator = await db.creators.find_one({"creator_id": creator_id}, {"_id": 0}) or {}
    bank = await db.creator_bank_accounts.find_one({"creator_id": creator_id}, {"_id": 0})
    pending = await db.payout_requests.find(
        {"creator_id": creator_id, "status": "pending"}, {"_id": 0},
    ).sort("created_at", -1).to_list(length=20)
    history = await db.payout_requests.find(
        {"creator_id": creator_id}, {"_id": 0},
    ).sort("created_at", -1).to_list(length=50)
    return {
        "creator_id": creator_id,
        "display_name": creator.get("display_name"),
        "handle": creator.get("handle"),
        "email": user.get("email"),
        "name": user.get("name"),
        "stripe_account_id": creator.get("stripe_account_id"),
        "stripe_account_payouts_enabled": bool(creator.get("stripe_account_payouts_enabled")),
        "bank": bank,  # {iban, bic, holder_name, created_at}
        "pending_payouts": pending,
        "payout_history": history,
    }


@api_router.post("/admin/payouts/{request_id}/mark-paid")
async def admin_mark_payout_paid(request_id: str, payload: Dict[str, str] = None, _admin: dict = Depends(require_admin)):
    """Admin marks a pending payout as paid (after issuing the manual SEPA transfer).
    Optionally stores a reference note (bank transaction ID)."""
    req = await db.payout_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Demande introuvable")
    if req.get("status") == "paid":
        return {"ok": True, "already_paid": True}
    note = (payload or {}).get("note") or ""
    await db.payout_requests.update_one(
        {"request_id": request_id},
        {"$set": {
            "status": "paid",
            "paid_at": now_utc().isoformat(),
            "paid_by": _admin["user_id"],
            "transfer_note": note,
        }},
    )
    await _create_notification(req["creator_id"], "payout_paid",
                               f"Virement envoyé · {req.get('eur_value', 0)} €",
                               f"Ton retrait de {req.get('coins', 0)} coins a été viré sur ton IBAN.",
                               {"request_id": request_id})
    return {"ok": True}


@api_router.post("/admin/reconcile-auto-reloads")
async def admin_reconcile_auto_reloads(_admin: dict = Depends(require_admin)):
    """Manually trigger the auto-reload reconciliation job.
    Use this when a user reports 'my card was charged but I didn't get the coins'.
    Finds all auto_reload transactions with `applied=false` and a valid PaymentIntent id,
    re-checks them against Stripe, and grants the coins if the payment actually succeeded.
    Returns a count of reconciled transactions."""
    before = await db.payment_transactions.count_documents({
        "type": "auto_reload", "applied": False,
        "stripe_payment_intent_id": {"$exists": True, "$ne": None},
    })
    await _run_auto_reloads()  # runs the reconciliation step + normal cycle
    after = await db.payment_transactions.count_documents({
        "type": "auto_reload", "applied": False,
        "stripe_payment_intent_id": {"$exists": True, "$ne": None},
    })
    reconciled = max(0, before - after)
    return {"ok": True, "reconciled_count": reconciled, "remaining_failed": after}


# -------- Admin: KYC review --------
@api_router.get("/admin/kyc")
async def admin_list_kyc(status: Optional[str] = None, _admin: dict = Depends(require_admin)):
    query = {}
    if status:
        query["status"] = status
    items = await db.verifications.find(query, {"_id": 0}).sort("created_at", -1).to_list(length=100)
    user_ids = list({i["user_id"] for i in items})
    users = {u["user_id"]: u for u in
             await db.users.find({"user_id": {"$in": user_ids}},
                                 {"_id": 0, "password_hash": 0}).to_list(length=200)}
    for i in items:
        i["user"] = users.get(i["user_id"])
    return items

@api_router.post("/admin/kyc/{user_id}/approve")
async def admin_approve_kyc(user_id: str, _admin: dict = Depends(require_admin)):
    await db.verifications.update_one(
        {"user_id": user_id},
        {"$set": {"status": "verified", "verified_at": now_utc().isoformat()}},
        upsert=True,
    )
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"age_verified": True, "age_verified_at": now_utc().isoformat()}},
    )
    await _create_notification(user_id, "kyc_approved",
                               "Vérification d'âge validée ✓",
                               "Tu peux maintenant accéder à tout le contenu premium.",
                               {})
    return {"ok": True}

@api_router.post("/admin/kyc/{user_id}/reject")
async def admin_reject_kyc(user_id: str, _admin: dict = Depends(require_admin)):
    await db.verifications.update_one(
        {"user_id": user_id},
        {"$set": {"status": "rejected", "rejected_at": now_utc().isoformat()}},
    )
    await _create_notification(user_id, "kyc_rejected",
                               "Vérification d'âge refusée",
                               "Relance une nouvelle vérification depuis ton compte.",
                               {})
    return {"ok": True}

# -------- Content flagging + moderation --------
@api_router.post("/content/{content_id}/flag")
async def flag_content(content_id: str, payload: FlagIn, user: dict = Depends(get_current_user)):
    existing = await db.content.find_one({"content_id": content_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Contenu introuvable")
    await db.content_flags.insert_one({
        "flag_id": f"fl_{uuid.uuid4().hex[:10]}",
        "content_id": content_id,
        "reporter_id": user["user_id"],
        "reason": payload.reason or "",
        "created_at": now_utc().isoformat(),
    })
    await db.content.update_one({"content_id": content_id},
                                {"$set": {"flagged": True}})
    return {"ok": True}

@api_router.get("/admin/content")
async def admin_list_content(flagged: bool = True, limit: int = 50,
                             _admin: dict = Depends(require_admin)):
    query = {"flagged": True} if flagged else {}
    items = await db.content.find(query, {"_id": 0}).sort("created_at", -1).to_list(length=limit)
    cids = list({i["creator_id"] for i in items})
    creators = {c["creator_id"]: c for c in
                await db.creators.find({"creator_id": {"$in": cids}}, {"_id": 0}).to_list(length=200)}
    for i in items:
        i["creator"] = creators.get(i["creator_id"])
        flags = await db.content_flags.find({"content_id": i["content_id"]},
                                            {"_id": 0}).sort("created_at", -1).to_list(length=20)
        i["flags"] = flags
        i["flag_count"] = len(flags)
    return items

@api_router.post("/admin/content/{content_id}/approve")
async def admin_unflag_content(content_id: str, _admin: dict = Depends(require_admin)):
    res = await db.content.update_one({"content_id": content_id},
                                      {"$set": {"flagged": False}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Contenu introuvable")
    await db.content_flags.delete_many({"content_id": content_id})
    return {"ok": True}

@api_router.delete("/admin/content/{content_id}")
async def admin_delete_content(content_id: str, _admin: dict = Depends(require_admin)):
    res = await db.content.delete_one({"content_id": content_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Contenu introuvable")
    await db.content_flags.delete_many({"content_id": content_id})
    await db.unlocks.delete_many({"content_id": content_id})
    return {"ok": True}

# -------- Creator bank account (IBAN) --------
def _mask_iban(iban: str) -> str:
    s = (iban or "").replace(" ", "")
    if len(s) <= 8:
        return s
    return f"{s[:4]} •••• •••• {s[-4:]}"

def _validate_iban(iban: str) -> bool:
    s = (iban or "").replace(" ", "").upper()
    if len(s) < 15 or len(s) > 34 or not s[:2].isalpha():
        return False
    # Mod-97 check
    rearranged = s[4:] + s[:4]
    numeric = ""
    for ch in rearranged:
        if ch.isdigit():
            numeric += ch
        elif ch.isalpha():
            numeric += str(ord(ch) - 55)
        else:
            return False
    try:
        return int(numeric) % 97 == 1
    except Exception:
        return False

@api_router.get("/payouts/bank")
async def get_bank(user: dict = Depends(get_current_user)):
    bank = await db.creator_bank_accounts.find_one({"creator_id": user["user_id"]}, {"_id": 0})
    if not bank:
        return None
    bank["iban_masked"] = _mask_iban(bank["iban"])
    bank.pop("iban", None)
    return bank

@api_router.post("/payouts/bank")
async def save_bank(payload: BankAccountIn, user: dict = Depends(get_current_user)):
    iban = payload.iban.replace(" ", "").upper()
    if not _validate_iban(iban):
        raise HTTPException(status_code=400, detail="IBAN invalide (vérifie la clé de contrôle)")
    await db.creator_bank_accounts.update_one(
        {"creator_id": user["user_id"]},
        {"$set": {
            "creator_id": user["user_id"],
            "iban": iban,
            "bic": (payload.bic or "").upper().replace(" ", ""),
            "holder_name": payload.holder_name,
            "country": (payload.country or "FR").upper(),
            "updated_at": now_utc().isoformat(),
        }},
        upsert=True,
    )
    return {"ok": True, "iban_masked": _mask_iban(iban)}

@api_router.delete("/payouts/bank")
async def delete_bank(user: dict = Depends(get_current_user)):
    await db.creator_bank_accounts.delete_one({"creator_id": user["user_id"]})
    return {"ok": True}

# Override payout request to require bank info
@api_router.get("/admin/payouts/{request_id}/sepa.xml")
async def admin_sepa_xml(request_id: str, _admin: dict = Depends(require_admin)):
    from fastapi.responses import Response as FastResponse
    req = await db.payout_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Demande introuvable")
    bank = await db.creator_bank_accounts.find_one({"creator_id": req["creator_id"]}, {"_id": 0})
    if not bank:
        raise HTTPException(status_code=400, detail="Le créateur n'a pas renseigné de compte bancaire")
    creator = await db.creators.find_one({"creator_id": req["creator_id"]}, {"_id": 0})

    msg_id = f"MEANDYOU-{request_id}"
    now_iso = now_utc().strftime("%Y-%m-%dT%H:%M:%S")
    amount = f"{req['eur_value']:.2f}"
    end_to_end = request_id
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
 <CstmrCdtTrfInitn>
  <GrpHdr>
   <MsgId>{msg_id}</MsgId>
   <CreDtTm>{now_iso}</CreDtTm>
   <NbOfTxs>1</NbOfTxs>
   <CtrlSum>{amount}</CtrlSum>
   <InitgPty><Nm>me&amp;you SAS</Nm></InitgPty>
  </GrpHdr>
  <PmtInf>
   <PmtInfId>{msg_id}-PMT</PmtInfId>
   <PmtMtd>TRF</PmtMtd>
   <NbOfTxs>1</NbOfTxs>
   <CtrlSum>{amount}</CtrlSum>
   <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>
   <ReqdExctnDt>{now_utc().strftime('%Y-%m-%d')}</ReqdExctnDt>
   <Dbtr><Nm>me&amp;you SAS</Nm></Dbtr>
   <DbtrAcct><Id><IBAN>FR7630006000011234567890189</IBAN></Id></DbtrAcct>
   <DbtrAgt><FinInstnId><BIC>AGRIFRPP</BIC></FinInstnId></DbtrAgt>
   <CdtTrfTxInf>
    <PmtId><EndToEndId>{end_to_end}</EndToEndId></PmtId>
    <Amt><InstdAmt Ccy="EUR">{amount}</InstdAmt></Amt>
    {('<CdtrAgt><FinInstnId><BIC>' + bank['bic'] + '</BIC></FinInstnId></CdtrAgt>') if bank.get('bic') else ''}
    <Cdtr><Nm>{bank['holder_name']}</Nm></Cdtr>
    <CdtrAcct><Id><IBAN>{bank['iban']}</IBAN></Id></CdtrAcct>
    <RmtInf><Ustrd>me&amp;you payout {creator.get('display_name','') if creator else ''} {request_id}</Ustrd></RmtInf>
   </CdtTrfTxInf>
  </PmtInf>
 </CstmrCdtTrfInitn>
</Document>"""
    return FastResponse(
        content=xml,
        media_type="application/xml",
        headers={"Content-Disposition": f'attachment; filename="sepa_{request_id}.xml"'},
    )

# -------- Subscription cancel (deprecated — see /subscriptions/{id} at L453) --------
async def _disable_auto_renew_only(creator_id: str, user: dict):
    """Soft-cancel helper kept for callers that don't want immediate access
    revocation. The exposed DELETE endpoint hard-cancels (see L453)."""
    sub = await db.subscriptions.find_one(
        {"user_id": user["user_id"], "creator_id": creator_id},
        {"_id": 0},
    )
    if not sub:
        return None
    await db.subscriptions.update_one(
        {"user_id": user["user_id"], "creator_id": creator_id},
        {"$set": {"auto_renew": False,
                  "cancelled_at": now_utc().isoformat(),
                  "expire_at_end": True}},
    )
    return True


async def _notify_creator_sale(creator_id: str, buyer_id: Optional[str], kind: str,
                               coins_earned: int, item_label: Optional[str] = None):
    """Fire-and-forget email to a creator after a sale. Also adds an in-app notification.
    kind: 'unlock' | 'subscription' | 'tip' | 'live_ppv' | 'priority_msg' | 'custom_request'."""
    creator_user = await db.users.find_one({"user_id": creator_id}, {"_id": 0, "email": 1, "name": 1})
    if not creator_user:
        return
    creator_profile = await db.creators.find_one({"creator_id": creator_id}, {"_id": 0, "display_name": 1}) or {}
    buyer = await db.users.find_one({"user_id": buyer_id}, {"_id": 0, "name": 1}) if buyer_id else None
    eur_earned = round(coins_to_eur(int(coins_earned)), 2)
    # In-app notification
    try:
        labels = {
            "unlock": "Nouvelle vente de contenu",
            "subscription": "Nouvel·le abonné·e",
            "tip": "Nouveau pourboire",
            "live_ppv": "Ticket live vendu",
            "priority_msg": "Message prioritaire",
            "custom_request": "Demande personnalisée payée",
        }
        title = f"💰 +{coins_earned} coins · {labels.get(kind, 'Nouvelle vente')}"
        body_txt = f"{(buyer or {}).get('name') or 'Un fan'} — {eur_earned:.2f} € (part créatrice)"
        await db.notifications.insert_one({
            "notification_id": f"ntf_{uuid.uuid4().hex[:10]}",
            "user_id": creator_id,
            "kind": "creator_sale",
            "title": title,
            "body": body_txt,
            "data": {"coins": int(coins_earned), "kind": kind, "item": item_label or ""},
            "read": False,
            "created_at": now_utc().isoformat(),
        })
    except Exception as e:
        logger.debug("creator sale in-app notif skipped: %s", e)
    # Email
    if not creator_user.get("email"):
        return
    try:
        await send_creator_sale(
            to=creator_user["email"],
            creator_name=creator_profile.get("display_name") or creator_user.get("name") or "créatrice",
            buyer_name=(buyer or {}).get("name") or "Un fan",
            kind=kind,
            coins_earned=int(coins_earned),
            eur_earned=eur_earned,
            item_label=item_label,
            frontend_url=FRONTEND_URL,
        )
    except Exception as e:
        logger.warning("creator sale email failed (creator=%s kind=%s): %s", creator_id, kind, e)

# -------- Notifications helpers --------
async def _create_notification(user_id: str, kind: str, title: str, body: str, data: dict):
    await db.notifications.insert_one({
        "notification_id": f"ntf_{uuid.uuid4().hex[:10]}",
        "user_id": user_id,
        "kind": kind,
        "title": title,
        "body": body,
        "data": data,
        "read": False,
        "created_at": now_utc().isoformat(),
    })
    # Fire-and-forget web push (no-op if VAPID not configured)
    try:
        url = (data or {}).get("url") or "/notifications"
        await _send_web_push(user_id, title, body, url)
    except Exception as e:
        logger.debug("web push dispatch skipped: %s", e)

async def _notify_new_message(sender: dict, recipient_id: str, creator: dict,
                              fan_id: str, body: str):
    recipient = await db.users.find_one({"user_id": recipient_id}, {"_id": 0, "password_hash": 0})
    if not recipient:
        return
    await _create_notification(recipient_id, "message",
                               f"💌 Nouveau message de {sender['name']}",
                               body[:140],
                               {"creator_id": creator["creator_id"], "fan_id": fan_id,
                                "sender_id": sender["user_id"]})
    try:
        await send_new_message(recipient["email"], recipient["name"], sender["name"], body, FRONTEND_URL)
    except Exception as e:
        logging.warning("new-message email failed: %s", e)

# -------- Uploads (direct, no Cloudinary) --------
try:
    import pillow_heif
    pillow_heif.register_heif_opener()
    _HEIF_OK = True
except Exception:
    _HEIF_OK = False

@api_router.post("/upload")
async def upload_file(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    """Streams the upload directly into MongoDB GridFS (persistent storage, survives redeploys).
    Supports files up to MAX_UPLOAD_BYTES (2 GB for videos). HEIC/HEIF is auto-converted to JPEG."""
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTS:
        raise HTTPException(status_code=400, detail=f"Format non supporté ({ext})")

    # For HEIC we need the whole blob in memory to convert — small images, OK
    if ext in (".heic", ".heif") and _HEIF_OK:
        contents = await file.read()
        if len(contents) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="Fichier trop volumineux")
        try:
            from PIL import Image
            import io
            img = Image.open(io.BytesIO(contents))
            if img.mode != "RGB":
                img = img.convert("RGB")
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=90, optimize=True)
            contents = buf.getvalue()
            ext = ".jpg"
        except Exception as e:
            logging.warning("HEIC conversion failed: %s", e)
        name = f"{uuid.uuid4().hex}{ext}"
        file_id = await media_bucket.upload_from_stream(
            name, contents,
            metadata={"owner_id": user["user_id"], "content_type": file.content_type,
                      "ext": ext, "uploaded_at": now_utc().isoformat()},
        )
        return {"url": f"/api/media-file/{file_id}", "filename": name,
                "size": len(contents), "content_type": file.content_type}

    # Streaming path for large files (videos up to 2 GB)
    name = f"{uuid.uuid4().hex}{ext}"
    content_type = file.content_type or ("video/mp4" if ext in (".mp4", ".mov", ".webm") else "application/octet-stream")
    grid_in = media_bucket.open_upload_stream(
        name,
        metadata={"owner_id": user["user_id"], "content_type": content_type,
                  "ext": ext, "uploaded_at": now_utc().isoformat()},
    )
    try:
        total = 0
        while True:
            chunk = await file.read(1024 * 1024)  # 1 MB chunks
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_UPLOAD_BYTES:
                await grid_in.abort()
                raise HTTPException(status_code=413, detail="Fichier trop volumineux (max 2 GB)")
            await grid_in.write(chunk)
        await grid_in.close()
    except HTTPException:
        raise
    except Exception as e:
        try:
            await grid_in.abort()
        except Exception:
            pass
        logger.exception("Upload failed: %s", e)
        raise HTTPException(status_code=500, detail="Upload échoué")
    file_id = grid_in._id
    return {"url": f"/api/media-file/{file_id}", "filename": name,
            "size": total, "content_type": content_type}


@api_router.api_route("/media-file/{file_id}", methods=["GET", "HEAD"])
async def get_media(file_id: str, request: Request):
    """Serve files stored in GridFS with HTTP range support (required for video streaming).
    Uses a distinct prefix (/media-file/) to avoid collisions with /media/wm and /media/wm-url."""
    from bson import ObjectId
    from bson.errors import InvalidId
    try:
        oid = ObjectId(file_id)
    except InvalidId:
        raise HTTPException(status_code=404, detail="Fichier introuvable")
    try:
        doc = await db["media.files"].find_one({"_id": oid})
    except Exception:
        doc = None
    if not doc:
        raise HTTPException(status_code=404, detail="Fichier introuvable")
    content_type = (doc.get("metadata") or {}).get("content_type") or "application/octet-stream"
    total = int(doc.get("length", 0))
    range_header = request.headers.get("range") or request.headers.get("Range")

    async def _iter_full():
        stream = await media_bucket.open_download_stream(oid)
        try:
            while True:
                chunk = await stream.readchunk()
                if not chunk:
                    break
                yield chunk
        finally:
            stream.close()

    if not range_header:
        return StreamingResponse(_iter_full(), media_type=content_type, headers={
            "Accept-Ranges": "bytes",
            "Content-Length": str(total),
            "Cache-Control": "public, max-age=3600",
        })

    # Parse "bytes=start-end"
    try:
        units, rng = range_header.split("=", 1)
        start_s, end_s = rng.split("-", 1)
        start = int(start_s) if start_s else 0
        end = int(end_s) if end_s else total - 1
    except Exception:
        raise HTTPException(status_code=416, detail="Range invalide")
    end = min(end, total - 1)
    length = end - start + 1

    async def _iter_range():
        stream = await media_bucket.open_download_stream(oid)
        try:
            # Skip to start using readchunk + buffer
            await stream.seek(start)
            remaining = length
            while remaining > 0:
                chunk = await stream.readchunk()
                if not chunk:
                    break
                if len(chunk) > remaining:
                    yield chunk[:remaining]
                    remaining = 0
                else:
                    yield chunk
                    remaining -= len(chunk)
        finally:
            stream.close()

    return StreamingResponse(_iter_range(), status_code=206, media_type=content_type, headers={
        "Content-Range": f"bytes {start}-{end}/{total}",
        "Accept-Ranges": "bytes",
        "Content-Length": str(length),
        "Cache-Control": "public, max-age=3600",
    })


# -------- Watermarking (anti-leak for paid images) --------
from watermark import make_watermark_token, verify_watermark_token, apply_watermark
from fastapi.responses import StreamingResponse

def _handle_for_user(user: dict) -> str:
    """Returns a short identifier (creator handle / fan email prefix / user_id tail)."""
    return (user.get("handle")
            or (user.get("email") or "").split("@")[0]
            or user["user_id"][-8:])

@api_router.post("/media/wm-url")
async def sign_watermark_url(payload: dict,
                             user: dict = Depends(get_current_user)):
    """Return a signed path that renders a watermarked version of `src`.
    Frontend prepends REACT_APP_BACKEND_URL.
    """
    src = (payload or {}).get("src")
    if not src or not isinstance(src, str):
        raise HTTPException(status_code=400, detail="src manquant")
    handle = _handle_for_user(user)
    token = make_watermark_token(handle, user["user_id"], ttl_seconds=1800)
    from urllib.parse import quote
    return {"path": f"/api/media/wm?src={quote(src, safe='')}&t={quote(token, safe='')}",
            "expires_in": 1800}

@api_router.get("/media/wm")
async def serve_watermarked(src: str, t: str):
    try:
        payload = verify_watermark_token(t)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Lien watermark expiré")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token watermark invalide")

    # Only serve images — bail out early for videos
    lower_src = src.lower().split("?")[0]
    if lower_src.endswith((".mp4", ".webm", ".mov", ".m4v", ".avi")):
        raise HTTPException(status_code=415, detail="Watermark images uniquement")

    # Fetch bytes: local uploads, GridFS, or remote
    image_bytes: Optional[bytes] = None
    # GridFS-backed upload (new path /api/media-file/, legacy /api/media/{id})
    _gridfs_match = None
    if "/api/media-file/" in src:
        _gridfs_match = src.split("/api/media-file/", 1)[1].split("?")[0].split("/")[0]
    elif "/api/media/" in src and "/api/media/wm" not in src:
        _gridfs_match = src.split("/api/media/", 1)[1].split("?")[0].split("/")[0]
    if _gridfs_match:
        from bson import ObjectId
        from bson.errors import InvalidId
        try:
            oid = ObjectId(_gridfs_match)
            stream = await media_bucket.open_download_stream(oid)
            image_bytes = await stream.read()
            stream.close()
        except InvalidId:
            raise HTTPException(status_code=404, detail="Media introuvable")
        except Exception as e:
            logger.warning("GridFS read failed for watermark: %s", e)
            raise HTTPException(status_code=404, detail="Media introuvable")
    elif "/api/uploads/" in src:
        # Map to local file (legacy)
        name = src.split("/api/uploads/", 1)[1].split("?")[0]
        local = UPLOAD_DIR / name
        if not local.exists():
            raise HTTPException(status_code=404, detail="Media introuvable")
        image_bytes = local.read_bytes()
    else:
        if not src.startswith(("http://", "https://")):
            raise HTTPException(status_code=400, detail="URL invalide")
        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                r = await client.get(src)
                if r.status_code != 200:
                    raise HTTPException(status_code=404, detail="Media introuvable")
                image_bytes = r.content
        except httpx.HTTPError:
            raise HTTPException(status_code=502, detail="Téléchargement échoué")

    if len(image_bytes) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image trop volumineuse")

    try:
        out = apply_watermark(image_bytes, payload["handle"])
    except Exception as e:
        logger.exception("watermark failed: %s", e)
        raise HTTPException(status_code=500, detail="Watermark échoué")

    return StreamingResponse(io.BytesIO(out), media_type="image/jpeg",
                             headers={"Cache-Control": "private, max-age=300"})

# -------- Stories (24h ephemeral) --------
class StoryCreate(BaseModel):
    media_url: str
    caption: Optional[str] = ""

@api_router.post("/stories")
async def create_story(payload: StoryCreate, user: dict = Depends(get_current_user)):
    creator = await db.creators.find_one({"creator_id": user["user_id"]}, {"_id": 0})
    if not creator:
        raise HTTPException(status_code=403, detail="Compte créatrice requis")
    expires_at = now_utc() + timedelta(hours=24)
    doc = {
        "story_id": f"st_{uuid.uuid4().hex[:10]}",
        "creator_id": user["user_id"],
        "media_url": payload.media_url,
        "caption": payload.caption or "",
        "created_at": now_utc().isoformat(),
        "expires_at": expires_at,  # native datetime for TTL index
    }
    await db.stories.insert_one(doc)
    doc["expires_at"] = expires_at.isoformat()
    doc.pop("_id", None)
    return doc

@api_router.get("/stories")
async def list_stories():
    """Group active stories by creator (most recent first)."""
    cursor = db.stories.find(
        {"expires_at": {"$gt": now_utc()}},
        {"_id": 0},
    ).sort("created_at", -1)
    stories = await cursor.to_list(length=300)
    by_creator: dict[str, list] = {}
    for s in stories:
        if isinstance(s.get("expires_at"), datetime):
            s["expires_at"] = s["expires_at"].isoformat()
        by_creator.setdefault(s["creator_id"], []).append(s)
    out = []
    for cid, items in by_creator.items():
        c = await db.creators.find_one({"creator_id": cid}, {"_id": 0})
        if not c:
            continue
        out.append({
            "creator_id": cid,
            "display_name": c["display_name"],
            "handle": c["handle"],
            "avatar_url": c.get("avatar_url"),
            "stories": items,
            "latest_at": items[0]["created_at"],
        })
    out.sort(key=lambda x: x["latest_at"], reverse=True)
    return out

# -------- AI support chat --------
class ChatAskIn(BaseModel):
    session_id: str = Field(min_length=6, max_length=100)
    message: str = Field(min_length=1, max_length=2000)


CHAT_SYSTEM_PROMPT = """Tu es Lou, l'assistante virtuelle de me&you, une plateforme française de créatrices de contenu premium.

Règles :
- Réponds toujours en français, ton chaleureux et pro.
- Réponses courtes (3-6 phrases max), structurées si nécessaire.
- Plateforme : abonnements mensuels, pourboires, unlocks à l'unité, lives payants (PPV), stories 24h.
- Économie en coins : 1 coin = 0,10 €. Packs : Starter 50c/5€, Popular 220c/20€, Premium 575c/50€, VIP 1450c/100€.
- Créatrices reçoivent 80% de chaque achat (la plateforme garde 20%). Retrait min : 500 coins (40 € net).
- Paiements Stripe (cartes Visa/Mastercard/Amex en Live mode). Stripe Connect Express disponible pour paiements directs aux créatrices.
- Âge : +18 obligatoire, vérification Stripe Identity.
- Contact humain : contact@meandyou.fans pour litiges, suppression de compte, demandes RGPD, remboursements complexes.
- NE PROMETS JAMAIS de remboursement automatique. Redirige vers le support humain pour ces cas.
- NE DONNE JAMAIS de conseil médical/juridique/financier — renvoie vers un professionnel.
- Ne parle que de me&you. Si la question est hors-sujet (politique, actu, autre site), redirige poliment vers le support humain ou reste factuelle.
- Si tu ne sais pas, dis-le honnêtement et propose de contacter contact@meandyou.fans.

Pages principales du site :
- /feed : flux global des nouveaux posts
- /createurs : liste des créatrices
- /wallet : wallet / packs coins / cartes / auto-recharge
- /subscriptions : mes abonnements
- /live : lives en direct
- /dashboard : espace créatrice (si l'utilisateur est créatrice)
- /dashboard/analytics : statistiques créatrice
- /bank : IBAN / compte bancaire (créatrice)

Si l'utilisateur demande comment faire X, donne le chemin cliquable (ex : "Va dans **Wallet**"). Garde-toi léger, pas de markdown lourd."""


@api_router.post("/chat/ask")
async def chat_ask(payload: ChatAskIn, user: Optional[dict] = Depends(optional_current_user)):
    """Public AI support chatbot powered by Claude Sonnet 4.5 via Emergent LLM key.
    Rate-limited by session_id + IP (10 msgs / minute)."""
    api_key = os.environ.get("EMERGENT_LLM_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="Assistant IA non configuré")
    session_id = payload.session_id.strip()
    user_id = user["user_id"] if user else None
    # Simple rate limit: last 60s
    since = (now_utc() - timedelta(seconds=60)).isoformat()
    recent = await db.chat_messages.count_documents({
        "session_id": session_id, "role": "user", "created_at": {"$gte": since}
    })
    if recent >= 10:
        raise HTTPException(status_code=429, detail="Ralentis un peu — réessaie dans une minute.")
    # Persist user message
    await db.chat_messages.insert_one({
        "session_id": session_id,
        "user_id": user_id,
        "role": "user",
        "content": payload.message,
        "created_at": now_utc().isoformat(),
    })
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage  # type: ignore
        chat = LlmChat(
            api_key=api_key,
            session_id=session_id,
            system_message=CHAT_SYSTEM_PROMPT,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        reply = await chat.send_message(UserMessage(text=payload.message))
    except Exception as e:
        logger.exception("chat AI failed: %s", e)
        raise HTTPException(status_code=502, detail="L'assistant est momentanément indisponible. Réessaie dans quelques instants ou écris à contact@meandyou.fans.")
    await db.chat_messages.insert_one({
        "session_id": session_id,
        "user_id": user_id,
        "role": "assistant",
        "content": reply,
        "created_at": now_utc().isoformat(),
    })
    return {"reply": reply, "session_id": session_id}


@api_router.get("/chat/history")
async def chat_history(session_id: str, limit: int = 50):
    """Return chat history for a session_id. Public (session_id is a UUID the client generates)."""
    if not session_id or len(session_id) < 6:
        raise HTTPException(status_code=400, detail="session_id invalide")
    items = await db.chat_messages.find(
        {"session_id": session_id},
        {"_id": 0, "session_id": 1, "role": 1, "content": 1, "created_at": 1},
    ).sort("created_at", 1).limit(max(1, min(int(limit), 200))).to_list(length=200)
    return items


# -------- Global feed --------
@api_router.get("/feed")
async def feed(limit: int = 30, user: Optional[dict] = Depends(optional_current_user)):
    now_dt = now_utc()
    # Only show content that is published (scheduled_at <= now or unset) and not expired
    items = await db.content.find({
        "$and": [
            {"$or": [{"scheduled_at": {"$lte": now_dt}}, {"scheduled_at": {"$exists": False}}, {"scheduled_at": None}]},
            {"$or": [{"expires_at": {"$gt": now_dt}}, {"expires_at": {"$exists": False}}, {"expires_at": None}]},
        ]
    }, {"_id": 0}).sort("created_at", -1).to_list(length=limit)
    creator_ids = list({c["creator_id"] for c in items})
    creators = {c["creator_id"]: c for c in
                await db.creators.find({"creator_id": {"$in": creator_ids}}, {"_id": 0}).to_list(length=200)}
    subs = set()
    unlocks = set()
    liked_ids = set()
    bookmarked_ids = set()
    if user:
        async for s in db.subscriptions.find({"user_id": user["user_id"], "status": "active"},
                                             {"_id": 0, "creator_id": 1}):
            subs.add(s["creator_id"])
        async for u in db.unlocks.find({"user_id": user["user_id"]},
                                       {"_id": 0, "content_id": 1}):
            unlocks.add(u["content_id"])
        async for l in db.content_likes.find({"user_id": user["user_id"]},
                                             {"_id": 0, "content_id": 1}):
            liked_ids.add(l["content_id"])
        async for b in db.content_bookmarks.find({"user_id": user["user_id"]},
                                                 {"_id": 0, "content_id": 1}):
            bookmarked_ids.add(b["content_id"])
    out = []
    for it in items:
        c = creators.get(it["creator_id"])
        if not c:
            continue
        # ISO-format datetime fields for JSON
        for f in ("scheduled_at", "expires_at"):
            if isinstance(it.get(f), datetime):
                it[f] = it[f].isoformat()
        out.append({
            **it,
            "creator": {
                "creator_id": c["creator_id"],
                "display_name": c["display_name"],
                "handle": c["handle"],
                "avatar_url": c.get("avatar_url"),
            },
            "is_unlocked": (not it.get("is_premium"))
                           or (c["creator_id"] in subs and it.get("included_in_subscription", True))
                           or (it["content_id"] in unlocks),
            "is_liked": it["content_id"] in liked_ids,
            "is_bookmarked": it["content_id"] in bookmarked_ids,
            "likes_count": int(it.get("likes_count") or 0),
        })
    return out

# -------- Notifications --------
@api_router.get("/notifications")
async def list_notifications(limit: int = 30, user: dict = Depends(get_current_user)):
    items = await db.notifications.find({"user_id": user["user_id"]},
                                        {"_id": 0}).sort("created_at", -1).to_list(length=limit)
    unread = await db.notifications.count_documents({"user_id": user["user_id"], "read": False})
    return {"items": items, "unread": unread}

@api_router.get("/notifications/unread-count")
async def unread_count(user: dict = Depends(get_current_user)):
    n = await db.notifications.count_documents({"user_id": user["user_id"], "read": False})
    return {"unread": n}

@api_router.post("/notifications/mark-read")
async def mark_read(user: dict = Depends(get_current_user)):
    await db.notifications.update_many({"user_id": user["user_id"], "read": False},
                                       {"$set": {"read": True}})
    return {"ok": True}

# -------- Health --------
@api_router.get("/")
async def root():
    return {"service": "me&you", "status": "ok"}

# -------- Include + CORS + Startup --------
app.include_router(api_router)

# Mount uploads as static files at /api/uploads (so it goes through the /api ingress rule)
app.mount("/api/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

cors_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",") if o.strip()]
# Always-allowed production domains (independent of env config)
_always_allowed = [
    "https://meandyou.fans",
    "https://www.meandyou.fans",
]
for _o in _always_allowed:
    if _o not in cors_origins:
        cors_origins.append(_o)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=r"^https://(.*\.)?meandyou\.fans$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("meandyou")

# -------- Seeds --------
SEED_CREATORS = []  # No demo creators — real onboarding only

SEED_CONTENT = []

@app.on_event("startup")
async def startup():
    # Indexes
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("user_id", unique=True)
        await db.creators.create_index("creator_id", unique=True)
        await db.creators.create_index("handle")
        await db.content.create_index("content_id", unique=True)
        await db.content.create_index("creator_id")
        await db.messages.create_index([("creator_id", 1), ("fan_id", 1), ("created_at", 1)])
        await db.payment_transactions.create_index("session_id", unique=True)
        await db.subscriptions.create_index([("user_id", 1), ("creator_id", 1)], unique=True)
        await db.unlocks.create_index([("user_id", 1), ("content_id", 1)], unique=True)
        await db.password_reset_tokens.create_index("token_hash", unique=True)
        await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
        await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
        await db.stories.create_index("expires_at", expireAfterSeconds=0)
        await db.stories.create_index("creator_id")
        await db.wallets.create_index("user_id", unique=True)
        await db.coin_transactions.create_index([("user_id", 1), ("created_at", -1)])
        await db.payout_requests.create_index([("creator_id", 1), ("created_at", -1)])
        await db.saved_cards.create_index([("user_id", 1), ("created_at", -1)])
        await db.auto_reload_settings.create_index("user_id", unique=True)
        await db.cam_favorites.create_index([("user_id", 1), ("username", 1)], unique=True)
        await db.cam_favorites.create_index("user_id")
        await db.content_likes.create_index([("user_id", 1), ("content_id", 1)], unique=True)
        await db.content_likes.create_index("content_id")
        await db.content.create_index([("scheduled_at", 1)])
        await db.content.create_index("expires_at", expireAfterSeconds=0)
        await db.push_subscriptions.create_index([("user_id", 1), ("endpoint", 1)], unique=True)
        await db.push_subscriptions.create_index("user_id")
        await db.chat_messages.create_index([("session_id", 1), ("created_at", 1)])
        await db.chat_messages.create_index("created_at", expireAfterSeconds=60 * 60 * 24 * 30)  # auto-clean 30j
        await db.live_viewers.create_index([("session_id", 1), ("user_id", 1)], unique=True)
        await db.live_viewers.create_index("last_seen", expireAfterSeconds=300)  # auto-clean stale viewers
        await db.live_favorites.create_index([("session_id", 1), ("user_id", 1)], unique=True)
        await db.live_favorites.create_index("session_id")
    except Exception as e:
        logger.warning("Index creation issue: %s", e)

    # Generate VAPID keys if missing (web push notifications)
    try:
        if not os.environ.get("VAPID_PUBLIC_KEY") or not os.environ.get("VAPID_PRIVATE_KEY"):
            from py_vapid import Vapid
            vapid = Vapid()
            vapid.generate_keys()
            # Export as base64url-encoded strings (web push standard)
            import base64
            from cryptography.hazmat.primitives.serialization import PrivateFormat, Encoding, NoEncryption, PublicFormat
            priv_pem = vapid.private_key.private_bytes(
                Encoding.PEM, PrivateFormat.PKCS8, NoEncryption()
            ).decode()
            # Public key for the browser: 65-byte uncompressed EC point → base64url
            from cryptography.hazmat.primitives.asymmetric import ec
            pub_nums = vapid.public_key.public_numbers()
            pub_bytes = b"\x04" + pub_nums.x.to_bytes(32, "big") + pub_nums.y.to_bytes(32, "big")
            pub_b64 = base64.urlsafe_b64encode(pub_bytes).rstrip(b"=").decode()
            os.environ["VAPID_PUBLIC_KEY"] = pub_b64
            os.environ["VAPID_PRIVATE_KEY"] = priv_pem
            # Persist to MongoDB so we don't regenerate on every restart
            await db.site_config.update_one(
                {"key": "vapid"},
                {"$set": {
                    "key": "vapid",
                    "public_key": pub_b64,
                    "private_key": priv_pem,
                    "created_at": now_utc().isoformat(),
                }},
                upsert=True,
            )
            logger.info("Generated new VAPID keypair for web push")
        # Load from DB if env missing but DB has keys
        if not os.environ.get("VAPID_PUBLIC_KEY"):
            cached = await db.site_config.find_one({"key": "vapid"}, {"_id": 0})
            if cached:
                os.environ["VAPID_PUBLIC_KEY"] = cached.get("public_key", "")
                os.environ["VAPID_PRIVATE_KEY"] = cached.get("private_key", "")
    except Exception as e:
        logger.warning("VAPID bootstrap skipped: %s", e)

    # Admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@meandyou.fans")
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin2026!")
    existing_admin = await db.users.find_one({"email": admin_email})
    if not existing_admin:
        await db.users.insert_one({
            "user_id": f"user_{uuid.uuid4().hex[:12]}",
            "email": admin_email,
            "name": "Admin",
            "password_hash": hash_password(admin_password),
            "role": "admin",
            "age_verified": True,
            "avatar_url": None,
            "provider": "local",
            "created_at": now_utc().isoformat(),
        })
    else:
        if not existing_admin.get("password_hash") or not verify_password(admin_password, existing_admin["password_hash"]):
            await db.users.update_one(
                {"email": admin_email},
                {"$set": {"password_hash": hash_password(admin_password)}},
            )

    # Demo test user (fan)
    test_email = "fan@meandyou.fans"
    test_password = "TestFan2026!"
    if not await db.users.find_one({"email": test_email}):
        await db.users.insert_one({
            "user_id": f"user_{uuid.uuid4().hex[:12]}",
            "email": test_email,
            "name": "Alex Fan",
            "password_hash": hash_password(test_password),
            "role": "fan",
            "age_verified": True,
            "avatar_url": None,
            "provider": "local",
            "created_at": now_utc().isoformat(),
        })

    # Purge legacy seeded demo creators AND testing-agent residue
    LEGACY_SEED_HANDLES = ["lysepress", "emmarose", "sophieluxe", "claranuit", "julieether", "leavelvet"]
    LEGACY_SEED_EMAILS = [f"{h}@meandyou.fans" for h in LEGACY_SEED_HANDLES]
    legacy_users = await db.users.find(
        {"$or": [
            {"email": {"$in": LEGACY_SEED_EMAILS}},
            # Testing-agent-generated throwaway accounts (email + handle patterns)
            {"email": {"$regex": "^(test_creator_|testcreator_|testhandle_|testfan_|test_fan_|creator_test_|fan_test_)", "$options": "i"}},
            {"email": {"$regex": "@test\\.(com|local)$", "$options": "i"}},
        ]},
        {"_id": 0, "user_id": 1, "email": 1, "handle": 1}
    ).to_list(length=500)
    # Also match creators whose handle starts with test_ or testhandle_ even if email looks clean
    test_handle_creators = await db.creators.find(
        {"handle": {"$regex": "^(test_|testhandle_|testcreator_)", "$options": "i"}},
        {"_id": 0, "creator_id": 1},
    ).to_list(length=500)
    legacy_ids = list({u["user_id"] for u in legacy_users} | {c["creator_id"] for c in test_handle_creators})
    if legacy_ids:
        # Cascade delete everything tied to these creators / user accounts
        await db.creators.delete_many({"creator_id": {"$in": legacy_ids}})
        await db.content.delete_many({"creator_id": {"$in": legacy_ids}})
        await db.stories.delete_many({"creator_id": {"$in": legacy_ids}})
        await db.subscriptions.delete_many({"$or": [{"creator_id": {"$in": legacy_ids}},
                                                     {"user_id": {"$in": legacy_ids}}]})
        await db.messages.delete_many({"$or": [{"creator_id": {"$in": legacy_ids}},
                                                {"fan_id": {"$in": legacy_ids}},
                                                {"sender_id": {"$in": legacy_ids}}]})
        await db.notifications.delete_many({"user_id": {"$in": legacy_ids}})
        await db.promotions.delete_many({"creator_id": {"$in": legacy_ids}})
        await db.custom_requests.delete_many({"$or": [{"creator_id": {"$in": legacy_ids}},
                                                       {"fan_id": {"$in": legacy_ids}}]})
        await db.payouts.delete_many({"creator_id": {"$in": legacy_ids}})
        await db.bank_accounts.delete_many({"creator_id": {"$in": legacy_ids}})
        await db.live_sessions.delete_many({"creator_id": {"$in": legacy_ids}})
        await db.live_unlocks.delete_many({"user_id": {"$in": legacy_ids}})
        await db.wallets.delete_many({"user_id": {"$in": legacy_ids}})
        await db.coin_transactions.delete_many({"user_id": {"$in": legacy_ids}})
        await db.unlocks.delete_many({"user_id": {"$in": legacy_ids}})
        await db.saved_cards.delete_many({"user_id": {"$in": legacy_ids}})
        await db.cam_favorites.delete_many({"user_id": {"$in": legacy_ids}})
        await db.users.delete_many({"user_id": {"$in": legacy_ids}})
        logger.info("Purged %d legacy / test seeded accounts", len(legacy_ids))

    # Grant demo test fan 1000 coins so features are usable out of the box
    fan = await db.users.find_one({"email": "fan@meandyou.fans"}, {"_id": 0})
    if fan:
        w = await db.wallets.find_one({"user_id": fan["user_id"]})
        if not w or w.get("coin_balance", 0) < 100:
            await _credit_wallet(fan["user_id"], 1000,
                                 reason="demo_seed", related_id=None)

    # Start background scheduler
    asyncio.create_task(_subscription_renewal_loop())
    asyncio.create_task(_live_reaper_loop())


# -------- Subscription auto-renewal scheduler --------
async def _subscription_renewal_loop():
    """Runs every 15 minutes. Renews subscriptions nearing expiration when auto_renew=True,
    and processes wallet auto-reload for low-balance users with a saved default card."""
    await asyncio.sleep(10)  # let the app settle
    while True:
        try:
            await _run_renewals()
            await _run_auto_reloads()
        except Exception as e:
            logger.exception("renewal loop error: %s", e)
        await asyncio.sleep(60 * 15)


async def _live_reaper_loop():
    """Runs every 30 seconds. Auto-ends live sessions where the host hasn't sent a
    heartbeat in the last 120 seconds (lost connection, closed tab without sendBeacon
    firing, network drop, etc.). This guarantees the /live/sessions list never shows
    a phantom live the creator already left."""
    await asyncio.sleep(20)
    while True:
        try:
            stale_cutoff = (now_utc() - timedelta(seconds=120)).isoformat()
            stale = db.live_sessions.find(
                {
                    "status": "live",
                    "$or": [
                        {"host_last_ping": {"$lt": stale_cutoff}},
                        {"host_last_ping": {"$exists": False},
                         "started_at": {"$lt": stale_cutoff}},
                    ],
                },
                {"_id": 0, "session_id": 1, "room": 1, "creator_id": 1},
            )
            async for s in stale:
                await db.live_sessions.update_one(
                    {"session_id": s["session_id"]},
                    {"$set": {"status": "ended", "ended_at": now_utc().isoformat(),
                              "ended_reason": "host_timeout"}},
                )
                logger.info("live reaper: ended stale session %s (creator=%s)",
                            s["session_id"], s.get("creator_id"))
                if LIVEKIT_ENABLED and s.get("room"):
                    try:
                        from livekit import api as lk_api
                        lkapi = lk_api.LiveKitAPI(LIVEKIT_URL.replace("wss://", "https://"), LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
                        await lkapi.room.delete_room(lk_api.DeleteRoomRequest(room=s["room"]))
                        await lkapi.aclose()
                    except Exception as e:
                        logger.warning("reaper LiveKit delete failed for %s: %s", s["session_id"], e)
        except Exception as e:
            logger.exception("live reaper error: %s", e)
        await asyncio.sleep(30)

async def _run_auto_reloads():
    """For users with auto-reload enabled, top-up the wallet when balance < threshold.
    Charges the default saved card via real Stripe off_session PaymentIntent when possible,
    else falls back to simulated charge (dev/sandbox environments).

    Also reconciles failed auto-reload transactions: if Stripe's PaymentIntent actually
    SUCCEEDED (e.g. due to a prior StripeObject.get() bug) but coins were never granted,
    we detect and grant them on the next cycle."""
    # --- Step 1: reconcile previously-failed but actually-paid auto-reloads -----------
    async for tx in db.payment_transactions.find({
        "type": "auto_reload",
        "applied": False,
        "stripe_payment_intent_id": {"$exists": True, "$ne": None},
    }, {"_id": 0}).limit(50):
        pi_id = tx.get("stripe_payment_intent_id")
        if not pi_id:
            continue
        try:
            with _with_direct_stripe_api():
                pi_obj = stripe_sdk.PaymentIntent.retrieve(pi_id, api_key=STRIPE_ELEMENTS_SECRET_KEY)
            pi = pi_obj.to_dict() if hasattr(pi_obj, "to_dict") else dict(pi_obj)
        except Exception as e:
            logger.warning("auto-reload reconcile skipped (pi=%s): %s", pi_id, e)
            continue
        if pi.get("status") != "succeeded":
            continue  # genuine failure, nothing to reconcile
        # Card was charged but coins were not granted → grant them now
        user_id = tx["user_id"]
        pack = COIN_PACKS.get(tx.get("pack_id") or "popular")
        if not pack:
            continue
        total_coins = pack["coins"] + pack["bonus"]
        await db.payment_transactions.update_one(
            {"session_id": tx["session_id"]},
            {"$set": {
                "applied": True,
                "coins": total_coins,
                "payment_status": "paid",
                "status": "complete",
                "reconciled_at": now_utc().isoformat(),
            }, "$unset": {"error": ""}},
        )
        await _credit_wallet(user_id, total_coins,
                             reason="auto_reload_reconcile", related_id=pi_id)
        await _create_notification(
            user_id, "payment",
            f"Recharge rattrapée · +{total_coins} coins",
            f"Ton débit de {pack['eur']}€ a bien été pris en compte.",
            {"coins": total_coins, "pi_id": pi_id},
        )
        logger.info("auto-reload reconciled: user=%s pi=%s +%s coins", user_id, pi_id, total_coins)
    # --- Step 2: normal auto-reload cycle ---------------------------------------------
    async for s in db.auto_reload_settings.find({"enabled": True}, {"_id": 0}):
        try:
            user_id = s["user_id"]
            wallet = await _get_wallet(user_id)
            if wallet["coin_balance"] >= int(s.get("threshold", 50)):
                continue
            card = await db.saved_cards.find_one({"user_id": user_id, "is_default": True})
            if not card:
                continue
            pack = COIN_PACKS.get(s.get("pack_id") or "popular")
            if not pack:
                continue
            total_coins = pack["coins"] + pack["bonus"]
            is_real = not card.get("is_simulated") and _stripe_elements_enabled()
            session_id = f"{'pi' if is_real else 'sim'}_{uuid.uuid4().hex[:14]}"
            pi_id = None
            charge_failed = False
            failure_reason = None
            if is_real:
                pi_status = None
                try:
                    with _with_direct_stripe_api():
                        pi_obj = stripe_sdk.PaymentIntent.create(
                            amount=int(round(float(pack["eur"]) * 100)),
                            currency="eur",
                            customer=card.get("stripe_customer_id"),
                            payment_method=card["card_id"],
                            off_session=True,
                            confirm=True,
                            description=f"me&you auto-reload · {pack['name']}",
                            metadata={
                                "user_id": user_id,
                                "type": "auto_reload",
                                "pack_id": pack["pack_id"],
                            },
                            api_key=STRIPE_ELEMENTS_SECRET_KEY,
                        )
                    # Convert StripeObject → dict so .get()/[] work reliably
                    pi = pi_obj.to_dict() if hasattr(pi_obj, "to_dict") else dict(pi_obj)
                    pi_id = pi.get("id")
                    pi_status = pi.get("status")
                    if pi_status != "succeeded":
                        charge_failed = True
                        failure_reason = f"status={pi_status}"
                except stripe_sdk.error.CardError as e:  # type: ignore[attr-defined]
                    charge_failed = True
                    failure_reason = str(getattr(e, "user_message", None) or e)
                    logger.warning("auto-reload card declined user=%s: %s", user_id, failure_reason)
                    # Stripe.CardError means the card was REJECTED, nothing was charged
                except Exception as e:
                    # Unknown error AFTER Stripe may or may not have charged the card.
                    # If we got a PaymentIntent id, we can reconcile later; otherwise assume no charge.
                    charge_failed = True
                    failure_reason = f"{type(e).__name__}: {e}"
                    logger.exception("auto-reload charge failed (user=%s): %s", user_id, e)
                if charge_failed:
                    await db.payment_transactions.insert_one({
                        "session_id": session_id,
                        "type": "auto_reload",
                        "user_id": user_id,
                        "pack_id": pack["pack_id"],
                        "coins": 0,
                        "amount": float(pack["eur"]),
                        "currency": "eur",
                        "payment_status": "failed",
                        "status": "failed",
                        "applied": False,
                        "error": failure_reason,
                        "stripe_payment_intent_id": pi_id,
                        "created_at": now_utc().isoformat(),
                    })
                    await _create_notification(
                        user_id, "payment",
                        "Recharge automatique échouée",
                        f"Le débit de {pack['eur']}€ sur ta carte •••• {card['last4']} a échoué. "
                        f"Mets à jour ta carte dans le wallet.",
                        {"error": failure_reason, "card_last4": card["last4"]},
                    )
                    continue
            await db.payment_transactions.insert_one({
                "session_id": session_id,
                "type": "auto_reload",
                "user_id": user_id,
                "pack_id": pack["pack_id"],
                "coins": total_coins,
                "amount": float(pack["eur"]),
                "currency": "eur",
                "payment_status": "paid",
                "status": "complete",
                "applied": True,
                "simulated": not is_real,
                "stripe_payment_intent_id": pi_id,
                "paid_at": now_utc().isoformat(),
                "created_at": now_utc().isoformat(),
            })
            await _credit_wallet(user_id, total_coins,
                                 reason="auto_reload", related_id=card["card_id"])
            user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
            await _create_notification(
                user_id, "payment",
                f"Recharge automatique · +{total_coins} coins",
                f"Pack {pack['name']} facturé sur ta carte •••• {card['last4']}.",
                {"coins": total_coins, "card_last4": card["last4"]},
            )
            if user:
                try:
                    await send_payment_confirmation(
                        user["email"], user["name"], float(pack["eur"]),
                        "auto_reload", None, FRONTEND_URL,
                    )
                except Exception as e:
                    logger.warning("auto-reload email failed: %s", e)
        except Exception as e:
            logger.exception("auto-reload user %s failed: %s", s.get("user_id"), e)

async def _run_renewals():
    horizon = (now_utc() + timedelta(hours=1)).isoformat()
    cursor = db.subscriptions.find(
        {"status": "active", "auto_renew": True, "expires_at": {"$lt": horizon}},
        {"_id": 0},
    )
    async for sub in cursor:
        try:
            await _try_renew_subscription(sub)
        except Exception as e:
            logger.warning("renewal failed for %s/%s: %s",
                           sub.get("user_id"), sub.get("creator_id"), e)

async def _try_renew_subscription(sub: dict):
    user_id = sub["user_id"]
    creator_id = sub["creator_id"]
    price_coins = int(sub.get("price_coins")
                      or eur_to_coins(sub.get("price", 9.99)))
    wallet = await _get_wallet(user_id)
    if wallet["coin_balance"] < price_coins:
        # Expire + notify
        await db.subscriptions.update_one(
            {"user_id": user_id, "creator_id": creator_id},
            {"$set": {"status": "expired",
                      "expired_at": now_utc().isoformat(),
                      "expire_reason": "insufficient_coins"}},
        )
        await db.creators.update_one(
            {"creator_id": creator_id},
            {"$inc": {"subscribers_count": -1}},
        )
        user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
        creator = await db.creators.find_one({"creator_id": creator_id}, {"_id": 0})
        await _create_notification(
            user_id, "subscription_expired",
            f"Abonnement expiré · {creator['display_name'] if creator else ''}",
            f"Recharge tes coins pour continuer (besoin de {price_coins}).",
            {"creator_id": creator_id, "needed": price_coins},
        )
        if user:
            try:
                await send_payment_confirmation(
                    user["email"], user["name"], float(coins_to_eur(price_coins)),
                    "subscription_expired",
                    creator["display_name"] if creator else None, FRONTEND_URL,
                )
            except Exception as e:
                logger.warning("expire email failed: %s", e)
        return

    ok = await _debit_wallet(user_id, price_coins,
                             reason="subscription_renewal", related_id=creator_id)
    if not ok:
        return
    share = int(round(price_coins * CREATOR_PAYOUT_RATIO))
    await _credit_wallet(creator_id, share,
                         reason="subscription_earn", related_id=user_id)
    await db.subscriptions.update_one(
        {"user_id": user_id, "creator_id": creator_id},
        {"$set": {
            "status": "active",
            "last_renewed_at": now_utc().isoformat(),
            "expires_at": (now_utc() + timedelta(days=30)).isoformat(),
            "price_coins": price_coins,
        }},
    )
    await db.creators.update_one(
        {"creator_id": creator_id},
        {"$inc": {"total_earned_coins": share}},
    )
    await _create_notification(
        user_id, "subscription_renewed",
        "Abonnement renouvelé ✓",
        f"{price_coins} coins débités — prolongé de 30 jours.",
        {"creator_id": creator_id, "coins": price_coins},
    )
    await _create_notification(
        creator_id, "subscription",
        "Abonnement renouvelé 💜",
        f"+{share} coins de renouvellement.",
        {"user_id": user_id, "coins": share},
    )

@app.on_event("shutdown")
async def shutdown():
    client.close()
