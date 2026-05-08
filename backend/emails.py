"""Email helpers with branded HTML templates.
Supports Gmail SMTP (preferred) and Resend (fallback) — whichever is configured."""
from __future__ import annotations

import os
import asyncio
import base64
import logging
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.image import MIMEImage
from email.mime.base import MIMEBase
from email import encoders as email_encoders
from email.utils import formataddr
from typing import Optional, List, Tuple

import resend

logger = logging.getLogger("meandyou.emails")

# --- SMTP (Gmail or any SMTP provider) — preferred when configured ---
SMTP_HOST = os.environ.get("SMTP_HOST", "").strip()
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587") or "587")
SMTP_USER = os.environ.get("SMTP_USER", "").strip()
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "").strip()
SMTP_FROM_NAME = os.environ.get("SMTP_FROM_NAME", "me&you").strip()
SMTP_ENABLED = bool(SMTP_HOST and SMTP_USER and SMTP_PASSWORD)

# --- Resend (legacy fallback) ---
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "noreply@meandyou.fans")
SENDER_FALLBACK = os.environ.get("SENDER_FALLBACK", "onboarding@resend.dev")

if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY


def _smtp_send_sync(to: str, subject: str, html: str) -> bool:
    """Synchronous SMTP send (wrapped in asyncio.to_thread for the async API)."""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = formataddr((SMTP_FROM_NAME, SMTP_USER))
    msg["To"] = to
    # Plain text fallback (strip HTML tags roughly)
    import re as _re
    text_body = _re.sub(r"<[^>]+>", "", html)
    msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))

    context = ssl.create_default_context()
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as srv:
        srv.ehlo()
        srv.starttls(context=context)
        srv.login(SMTP_USER, SMTP_PASSWORD)
        srv.sendmail(SMTP_USER, [to], msg.as_string())
    return True


def _layout(title: str, preheader: str, body_html: str, cta_text: Optional[str] = None,
            cta_url: Optional[str] = None) -> str:
    cta_block = ""
    if cta_text and cta_url:
        cta_block = f"""
        <tr><td align="center" style="padding:24px 0 8px 0;">
          <a href="{cta_url}" style="display:inline-block;padding:14px 28px;border-radius:999px;
             background:#D946EF;color:#ffffff;text-decoration:none;font-weight:700;font-family:'Helvetica Neue',Arial,sans-serif;
             box-shadow:0 0 24px rgba(217,70,239,0.45);">{cta_text}</a>
        </td></tr>
        """
    return f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>{title}</title></head>
<body style="margin:0;padding:0;background:#050308;color:#ffffff;font-family:'Helvetica Neue',Arial,sans-serif;">
<span style="display:none!important;opacity:0;color:transparent;">{preheader}</span>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#050308;">
  <tr><td align="center" style="padding:32px 16px;">
    <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#120B15;
           border:1px solid rgba(255,255,255,0.06);border-radius:24px;overflow:hidden;">
      <tr><td style="padding:32px 32px 16px 32px;text-align:left;">
        <img src="https://meandyou.fans/logo.png" alt="me&amp;you" width="72" height="72"
             style="display:block;width:72px;height:72px;border-radius:12px;box-shadow:0 0 24px rgba(217,70,239,0.45);" />
        <div style="font-size:11px;letter-spacing:0.25em;color:#E879F9;font-weight:700;margin-top:10px;text-transform:uppercase;">.fans · plateforme exclusive</div>
      </td></tr>
      <tr><td style="padding:8px 32px 32px 32px;">
        <h1 style="font-family:'Helvetica Neue',Arial,sans-serif;font-weight:800;letter-spacing:-0.02em;
                   font-size:28px;line-height:1.15;margin:0 0 18px 0;color:#ffffff;">{title}</h1>
        <div style="font-size:15px;line-height:1.6;color:#cfc7d4;">
          {body_html}
        </div>
        {cta_block}
        <div style="margin-top:32px;padding-top:24px;border-top:1px solid rgba(255,255,255,0.06);
                    font-size:12px;color:#7a7280;line-height:1.6;">
          Tu reçois cet email parce que tu as un compte sur me&amp;you.<br>
          Pour ne plus recevoir ces notifications, modifie tes préférences depuis ton profil.
        </div>
      </td></tr>
    </table>
    <div style="margin-top:16px;font-size:11px;color:#5d5566;font-family:'Helvetica Neue',Arial,sans-serif;">
      © me&amp;you · Plateforme exclusive · +18
    </div>
  </td></tr>
</table>
</body></html>"""


def _smtp_send_with_attachments_sync(
    to: str, subject: str, html: str,
    attachments: List[Tuple[str, bytes, str]],  # (filename, bytes, mime e.g. "image/png")
) -> bool:
    """Synchronous SMTP send with binary attachments."""
    msg = MIMEMultipart("mixed")
    msg["Subject"] = subject
    msg["From"] = formataddr((SMTP_FROM_NAME, SMTP_USER))
    msg["To"] = to

    body = MIMEMultipart("alternative")
    import re as _re
    text_body = _re.sub(r"<[^>]+>", "", html)
    body.attach(MIMEText(text_body, "plain", "utf-8"))
    body.attach(MIMEText(html, "html", "utf-8"))
    msg.attach(body)

    for filename, data, mime in attachments:
        maintype, _, subtype = mime.partition("/")
        if maintype == "image":
            part = MIMEImage(data, _subtype=subtype or "png", name=filename)
        else:
            part = MIMEBase(maintype or "application", subtype or "octet-stream")
            part.set_payload(data)
            email_encoders.encode_base64(part)
        part.add_header("Content-Disposition", "attachment", filename=filename)
        msg.attach(part)

    context = ssl.create_default_context()
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as srv:
        srv.ehlo()
        srv.starttls(context=context)
        srv.login(SMTP_USER, SMTP_PASSWORD)
        srv.sendmail(SMTP_USER, [to], msg.as_string())
    return True


async def send_with_attachments(
    to: str, subject: str, html: str,
    attachments: List[Tuple[str, bytes, str]],
) -> bool:
    """Send a branded HTML email with binary attachments.
    Tries SMTP first, then Resend (Resend supports base64 attachments)."""
    if SMTP_ENABLED:
        try:
            await asyncio.to_thread(_smtp_send_with_attachments_sync, to, subject, html, attachments)
            logger.info("email+attachments sent to %s via SMTP", to)
            return True
        except Exception as e:
            logger.warning("SMTP attachment send failed for %s: %s", to, e)
    if RESEND_API_KEY:
        try:
            params = {
                "from": SENDER_EMAIL, "to": [to], "subject": subject, "html": html,
                "attachments": [
                    {"filename": fn, "content": base64.b64encode(data).decode("ascii")}
                    for fn, data, _mime in attachments
                ],
            }
            res = await asyncio.to_thread(resend.Emails.send, params)
            logger.info("email+attachments sent to %s via Resend id=%s", to,
                        res.get("id") if isinstance(res, dict) else res)
            return True
        except Exception as e:
            logger.warning("Resend attachment send failed: %s", e)
    return False


async def _send(to: str, subject: str, html: str) -> bool:
    # Preferred: Gmail SMTP (or any configured SMTP server)
    if SMTP_ENABLED:
        try:
            await asyncio.to_thread(_smtp_send_sync, to, subject, html)
            logger.info("email sent to %s via SMTP (%s)", to, SMTP_USER)
            return True
        except Exception as e:
            logger.warning("SMTP send failed for %s: %s", to, e)
            # Don't fall through to Resend unless RESEND_API_KEY is set
    if RESEND_API_KEY:
        for attempt_sender in (SENDER_EMAIL, SENDER_FALLBACK):
            try:
                params = {"from": attempt_sender, "to": [to], "subject": subject, "html": html}
                res = await asyncio.to_thread(resend.Emails.send, params)
                logger.info("email sent to %s via Resend (%s) id=%s", to, attempt_sender,
                            res.get("id") if isinstance(res, dict) else res)
                return True
            except Exception as e:
                logger.warning("Resend failed via %s: %s", attempt_sender, e)
                continue
    if not SMTP_ENABLED and not RESEND_API_KEY:
        logger.warning("No email provider configured — skipping email to %s", to)
    return False


async def send_admin_broadcast(to: str, subject: str, body_html: str,
                                 frontend_url: str, recipient_name: str = "Cher membre",
                                 cta_text: Optional[str] = None,
                                 cta_url: Optional[str] = None) -> bool:
    """Mass-email helper used by the admin broadcast tool. Body is wrapped
    in the standard branded template + an unsubscribe footer."""
    pre = (body_html or "")[:160].replace("<", "").replace(">", "")
    rendered_body = (
        f"<p style=\"margin:0 0 16px 0\">Bonjour {recipient_name},</p>"
        f"{body_html}"
        "<p style=\"margin:24px 0 0 0; font-size:11px; color:#888\">"
        "Tu reçois cet email parce que tu as un compte sur me&you. "
        f"<a href=\"{frontend_url}/account?notif=email\" style=\"color:#888\">Gérer mes notifications</a>."
        "</p>"
    )
    html = _layout(title=subject, preheader=pre, body_html=rendered_body,
                   cta_text=cta_text, cta_url=cta_url)
    return await _send(to, subject, html)



# ---- Templates ----
async def send_welcome(to: str, name: str, frontend_url: str):
    body = f"""
    <p>Salut <strong>{name}</strong>, bienvenue sur me&amp;you ✨</p>
    <p>Ton compte est prêt. Tu peux maintenant explorer les profils des créatrices, t'abonner à celles qui te plaisent et accéder à leur contenu exclusif et leur messagerie privée.</p>
    <p style="color:#9d94a8;font-size:13px;">Avant tout achat, tu devras confirmer que tu as bien 18 ans via Stripe Identity. Ça prend 30 secondes.</p>
    """
    html = _layout("Bienvenue sur me&you 🌙", "Découvre les créatrices qui t'attendent.",
                   body, "Découvrir les créatrices", f"{frontend_url}/createurs")
    return await _send(to, "Bienvenue sur me&you ✨", html)


async def send_payment_confirmation(to: str, name: str, amount: float, kind: str,
                                    creator_name: Optional[str], frontend_url: str):
    label = {"subscription": "Abonnement", "tip": "Pourboire", "unlock": "Déverrouillage"}.get(kind, "Paiement")
    line = ""
    if creator_name and kind == "subscription":
        line = f"Tu es maintenant abonné(e) à <strong>{creator_name}</strong> pour 30 jours."
    elif creator_name and kind == "tip":
        line = f"Ton pourboire de {amount:.2f}€ a été envoyé à <strong>{creator_name}</strong>. Merci pour ton soutien !"
    elif creator_name and kind == "unlock":
        line = f"Le contenu de <strong>{creator_name}</strong> a été déverrouillé sur ton compte."
    body = f"""
    <p>Salut <strong>{name}</strong>,</p>
    <p>Ton paiement de <strong style="color:#E879F9;">{amount:.2f}€</strong> a été confirmé ({label}).</p>
    <p>{line}</p>
    """
    html = _layout("Paiement confirmé ✓", "Merci pour ton soutien.",
                   body, "Voir mon compte", f"{frontend_url}/createurs")
    return await _send(to, f"Paiement confirmé · {amount:.2f}€", html)


async def send_new_message(to: str, recipient_name: str, sender_name: str, preview: str, frontend_url: str):
    safe = (preview or "")[:140].replace("<", "&lt;").replace(">", "&gt;")
    body = f"""
    <p>Salut <strong>{recipient_name}</strong>,</p>
    <p><strong>{sender_name}</strong> vient de t'envoyer un nouveau message :</p>
    <blockquote style="margin:16px 0;padding:14px 18px;border-left:3px solid #D946EF;background:rgba(217,70,239,0.08);
                       border-radius:8px;color:#e7dff0;font-style:italic;">{safe}</blockquote>
    """
    html = _layout("Nouveau message 💌", f"{sender_name} t'a écrit",
                   body, "Lire le message", f"{frontend_url}/messages")
    return await _send(to, f"💌 Nouveau message de {sender_name}", html)


async def send_password_reset(to: str, name: str, reset_url: str):
    body = f"""
    <p>Salut <strong>{name}</strong>,</p>
    <p>Tu as demandé à réinitialiser ton mot de passe sur me&amp;you.</p>
    <p>Clique sur le bouton ci-dessous pour choisir un nouveau mot de passe. Ce lien est valide <strong>1 heure</strong>.</p>
    <p style="color:#9d94a8;font-size:13px;margin-top:18px;">Si tu n'es pas à l'origine de cette demande, ignore simplement ce message — ton compte reste protégé.</p>
    """
    html = _layout(
        "Réinitialise ton mot de passe 🔑",
        "Une demande de réinitialisation vient d'être envoyée",
        body, "Choisir un nouveau mot de passe", reset_url,
    )
    return await _send(to, "🔑 Réinitialise ton mot de passe · me&you", html)


async def send_creator_sale(to: str, creator_name: str, buyer_name: str,
                            kind: str, coins_earned: int, eur_earned: float,
                            item_label: Optional[str], frontend_url: str):
    """Notify a creator they just earned coins from a sale (unlock / subscription / tip / live PPV)."""
    k = {
        "unlock": ("📸 Nouvelle vente de contenu !", "Un fan vient de débloquer un de tes contenus."),
        "subscription": ("✨ Nouvel·le abonné·e !", "Un fan vient de s'abonner à ton profil."),
        "tip": ("💸 Nouveau pourboire !", "Un fan t'a envoyé un pourboire."),
        "live_ppv": ("🎥 Ticket live acheté !", "Un fan vient d'acheter l'accès à ton live payant."),
        "priority_msg": ("⚡ Message prioritaire acheté !", "Un fan t'a envoyé un message prioritaire."),
        "custom_request": ("🎁 Demande personnalisée payée !", "Un fan vient de payer une demande sur-mesure."),
    }.get(kind, ("💰 Nouvelle vente !", "Tu viens de recevoir un paiement."))
    subject, subtitle = k
    detail = ""
    if item_label:
        detail = f"<p style=\"color:#b7b0c3;font-size:13px;\">{item_label}</p>"
    body = f"""
    <p>Salut <strong>{creator_name}</strong> ✨</p>
    <p><strong>{buyer_name or 'Un fan'}</strong> vient de t'acheter quelque chose. Tu as gagné :</p>
    <div style="margin:18px 0;padding:16px;border:1px solid rgba(217,70,239,0.28);
                background:rgba(217,70,239,0.08);border-radius:12px;text-align:center;">
        <div style="font-size:28px;font-weight:800;color:#E879F9;">+{coins_earned} coins</div>
        <div style="color:#b7b0c3;font-size:14px;margin-top:4px;">≈ {eur_earned:.2f} € (part créatrice 80 %)</div>
    </div>
    {detail}
    <p style="color:#9d94a8;font-size:13px;">Retrouve toutes tes ventes et stats sur ton dashboard.</p>
    """
    html = _layout(subject, subtitle, body, "Voir mon dashboard", f"{frontend_url}/dashboard")
    return await _send(to, subject, html)
