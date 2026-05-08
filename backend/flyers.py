"""
AI Flyer generation for creators.
Uses Gemini (Nano Banana) via EMERGENT_LLM_KEY to generate a portrait poster
(1080x1350-ish IG ratio) from a French prompt + optional creator photo.
"""
import os
import base64
import logging
from io import BytesIO
from pathlib import Path
from uuid import uuid4
from typing import Optional

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

log = logging.getLogger("meandyou.flyers")

UPLOAD_DIR = Path(__file__).parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

DEFAULT_MODEL = "gemini-3.1-flash-image-preview"

POSTER_SYSTEM = (
    "You are a senior art director for a premium creator-economy platform. "
    "You design high-end portrait social media posters in either: "
    "(a) Apple-inspired minimal style (true black background, oversized white sans-serif typography, single magenta accent), "
    "(b) glamour magenta gradient style (deep magenta to black, elegant serif overlay), or "
    "(c) clean white minimal style (pure white bg, dark high-contrast typography). "
    "Output is a single 1080x1350 px portrait poster suitable for Instagram. "
    "Compose tight, generous breathing room, no QR code, no website URL — that text will be added later. "
    "Ensure the image has zero copyrighted logos or brand marks. "
    "If a reference photo is provided, integrate the person tastefully (no distortion of the face)."
)


def _build_prompt(creator_handle: str, creator_name: str, style: str, user_phrase: str) -> str:
    style_brief = {
        "apple":   "Apple-style: true black background, big bold white sans-serif headline at the top, generous negative space, single subtle magenta accent (a tiny dot or thin underline). Premium, austere, modern.",
        "glamour": "Glamour magenta: deep magenta to black radial gradient, elegant serif headline in white, soft grain texture. Sensual yet classy, high-end editorial feel.",
        "white":   "Clean white minimal: pure white background, large black sans-serif headline, single magenta accent line. Crisp, fashion-magazine layout.",
    }.get(style, style_brief.get("apple") if False else "Apple-style: true black, white headline.")

    return (
        f"Design a 1080x1350 portrait Instagram poster for the creator @{creator_handle} ({creator_name}).\n\n"
        f"Style: {style_brief}\n\n"
        f"Headline phrase to feature prominently (in French, exactly as written): «{user_phrase}»\n\n"
        f"Sub-text small at bottom: \"meandyou.fans/c/{creator_handle}\". "
        f"No URL banner, no QR code, no logo — just the typography and (if reference image provided) the creator's photo "
        f"composed elegantly. Make it shareable and visually striking."
    )


async def generate_flyer(
    *,
    creator_handle: str,
    creator_name: str,
    user_phrase: str,
    style: str = "apple",
    reference_bytes: Optional[bytes] = None,
) -> dict:
    """Generate a flyer image. Returns {url: '/api/uploads/...png', filename: '...'}."""
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise RuntimeError("EMERGENT_LLM_KEY missing in environment")

    chat = LlmChat(api_key=api_key, session_id=f"flyer-{uuid4()}", system_message=POSTER_SYSTEM)
    chat.with_model("gemini", DEFAULT_MODEL).with_params(modalities=["image", "text"])

    prompt = _build_prompt(creator_handle, creator_name, style, user_phrase)

    if reference_bytes:
        b64 = base64.b64encode(reference_bytes).decode("utf-8")
        msg = UserMessage(text=prompt, file_contents=[ImageContent(b64)])
    else:
        msg = UserMessage(text=prompt)

    text, images = await chat.send_message_multimodal_response(msg)

    if not images:
        raise RuntimeError(f"No image generated. Model returned: {(text or '')[:200]}")

    # Use the first generated image
    img_data = base64.b64decode(images[0]["data"])
    filename = f"flyer-{creator_handle}-{uuid4().hex[:10]}.png"
    out_path = UPLOAD_DIR / filename
    with open(out_path, "wb") as f:
        f.write(img_data)
    log.info("Generated flyer for @%s -> %s (%d bytes)", creator_handle, filename, len(img_data))
    return {"url": f"/api/uploads/{filename}", "filename": filename, "style": style}
