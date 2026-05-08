"""Anti-leak watermarking: overlay fan handle on paid/unlocked images.

Exposes:
- `make_watermark_token(handle, user_id, ttl=600)` → short-lived signed token
- `verify_watermark_token(token)` → {handle, user_id} or raises
- `apply_watermark(image_bytes, handle)` → JPEG bytes with tiled diagonal handle overlay
"""
from __future__ import annotations
import io
import os
from datetime import datetime, timezone, timedelta
import jwt
from PIL import Image, ImageDraw, ImageFont

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"

_FONT_CANDIDATES = [
    "/opt/plugins-venv/lib/python3.11/site-packages/reportlab/fonts/VeraBd.ttf",
    "/opt/plugins-venv/lib/python3.11/site-packages/reportlab/fonts/Vera.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]


def _load_font(size: int):
    for path in _FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def make_watermark_token(handle: str, user_id: str, ttl_seconds: int = 600) -> str:
    payload = {
        "h": handle,
        "u": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds),
        "type": "wm",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_watermark_token(token: str) -> dict:
    payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    if payload.get("type") != "wm":
        raise jwt.InvalidTokenError("wrong token type")
    return {"handle": payload["h"], "user_id": payload["u"]}


def apply_watermark(image_bytes: bytes, handle: str) -> bytes:
    """Return JPEG bytes with tiled diagonal handle overlay."""
    src = Image.open(io.BytesIO(image_bytes))
    # Flatten animated/RGBA/CMYK to RGBA
    src = src.convert("RGBA")

    w, h = src.size
    # Create transparent overlay sized diagonal of image so rotation never exposes empty corners
    diag = int((w ** 2 + h ** 2) ** 0.5)
    overlay = Image.new("RGBA", (diag, diag), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    handle_text = f"@{handle.lstrip('@')} · meandyou.fans"
    font_size = max(18, min(w, h) // 22)
    font = _load_font(font_size)

    # Measure text
    try:
        bbox = draw.textbbox((0, 0), handle_text, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    except AttributeError:
        tw, th = draw.textsize(handle_text, font=font)  # type: ignore

    step_x = max(tw + 80, 220)
    step_y = max(th + 110, 140)

    for y in range(0, diag, step_y):
        offset = (y // step_y) % 2 * (step_x // 2)
        for x in range(-step_x, diag, step_x):
            # white glow
            draw.text((x + offset + 1, y + 1), handle_text, fill=(0, 0, 0, 110), font=font)
            draw.text((x + offset, y), handle_text, fill=(255, 255, 255, 130), font=font)

    # Rotate and center-crop to original size
    overlay = overlay.rotate(-22, resample=Image.BILINEAR, expand=False)
    left = (diag - w) // 2
    top = (diag - h) // 2
    overlay = overlay.crop((left, top, left + w, top + h))

    composite = Image.alpha_composite(src, overlay).convert("RGB")
    out = io.BytesIO()
    # Preserve reasonable quality but keep payload small
    composite.save(out, format="JPEG", quality=85, optimize=True)
    return out.getvalue()
