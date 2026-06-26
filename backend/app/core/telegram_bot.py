"""Telegram bot utilities — webhook setup, message sending, verification."""

import hmac
import hashlib
import structlog
import httpx
from app.core.config import settings

logger = structlog.get_logger()

BOT_TOKEN = settings.TELEGRAM_BOT_TOKEN
WEBHOOK_SECRET = getattr(settings, "TELEGRAM_WEBHOOK_SECRET", None) or "twingrid-tg-webhook"
API_BASE = f"https://api.telegram.org/bot{BOT_TOKEN}" if BOT_TOKEN else None


async def setup_webhook(backend_url: str):
    """Register the webhook URL with Telegram on app startup."""
    if not BOT_TOKEN:
        logger.warning("telegram_no_token", msg="TELEGRAM_BOT_TOKEN not set — skipping webhook setup")
        return

    webhook_url = f"{backend_url}/api/v1/webhook/telegram"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{API_BASE}/setWebhook",
                json={
                    "url": webhook_url,
                    "secret_token": WEBHOOK_SECRET,
                    "allowed_updates": ["message"],
                    "drop_pending_updates": True,
                },
            )
            data = resp.json()
            if data.get("ok"):
                logger.info("telegram_webhook_set", url=webhook_url)
            else:
                logger.error("telegram_webhook_failed", response=data)
    except Exception as e:
        logger.error("telegram_webhook_error", error=str(e))


def verify_webhook_request(secret_token_header: str | None) -> bool:
    """Verify the X-Telegram-Bot-Api-Secret-Token header."""
    if not secret_token_header:
        return False
    return hmac.compare_digest(secret_token_header, WEBHOOK_SECRET)


async def send_message(chat_id: int | str, text: str, parse_mode: str = "HTML") -> bool:
    """Send a message to a specific chat. Returns True on success."""
    if not BOT_TOKEN:
        return False

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{API_BASE}/sendMessage",
                json={
                    "chat_id": chat_id,
                    "text": text,
                    "parse_mode": parse_mode,
                    "disable_web_page_preview": True,
                },
            )
            if resp.status_code == 200 and resp.json().get("ok"):
                return True
            logger.error("telegram_send_failed", status=resp.status_code, body=resp.text[:200])
            return False
    except Exception as e:
        logger.error("telegram_send_error", chat_id=chat_id, error=str(e))
        return False
