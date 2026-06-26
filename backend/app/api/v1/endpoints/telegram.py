"""Telegram webhook + user connection API endpoints."""

import secrets
from datetime import datetime, timedelta, timezone
import structlog
from fastapi import APIRouter, Depends, HTTPException, Header, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.core.config import settings
from app.core.telegram_bot import verify_webhook_request, send_message

logger = structlog.get_logger()

router = APIRouter()

LINK_TOKEN_TTL_MINUTES = 10
BOT_USERNAME = "twingrid_bot"

DEFAULT_TG_PREFS = {
    "basket_opened": True,
    "basket_closed": True,
    "safety_order": True,
    "risk_stop": True,
    "external_close": True,
    "fee_deducted": False,
    "deposit_credited": True,
    "low_balance": True,
}


# ── Webhook (no auth — called by Telegram) ──────────────────


@router.post("/webhook/telegram")
async def telegram_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_telegram_bot_api_secret_token: str | None = Header(None),
):
    """Receive updates from Telegram Bot API."""
    # Verify webhook secret
    if not verify_webhook_request(x_telegram_bot_api_secret_token):
        raise HTTPException(status_code=403, detail="Invalid secret")

    body = await request.json()
    message = body.get("message", {})
    text = message.get("text", "")
    chat = message.get("chat", {})
    chat_id = chat.get("id")
    from_user = message.get("from", {})
    tg_username = from_user.get("username")
    tg_first_name = from_user.get("first_name", "")

    if not chat_id:
        return {"ok": True}

    # Handle /start <token> command
    if text.startswith("/start"):
        parts = text.strip().split()
        if len(parts) < 2:
            await send_message(
                chat_id,
                "👋 <b>Welcome to TwinGrid Alerts!</b>\n\n"
                "To connect your account, use the link from your Dashboard:\n"
                "→ Profile → Telegram Notifications → Connect\n\n"
                "This will generate a unique connection link for you.",
            )
            return {"ok": True}

        token = parts[1]

        # Look up user by link token
        result = await db.execute(
            select(User).where(
                User.telegram_link_token == token,
                User.telegram_link_expires_at > datetime.now(timezone.utc),
            )
        )
        user = result.scalars().first()

        if not user:
            await send_message(
                chat_id,
                "❌ <b>Invalid or expired link.</b>\n\n"
                "Please generate a new connection link from your Dashboard.",
            )
            return {"ok": True}

        # Check if this Telegram account is already linked to ANOTHER user
        existing_result = await db.execute(
            select(User).where(
                User.telegram_chat_id == chat_id,
                User.id != user.id,
            )
        )
        existing_user = existing_result.scalars().first()
        if existing_user:
            await send_message(
                chat_id,
                "⚠️ <b>This Telegram account is already connected to another TwinGrid user.</b>\n\n"
                "Each Telegram account can only be linked to one user.\n"
                "Disconnect from the other account first.",
            )
            return {"ok": True}

        # Link Telegram to user
        user.telegram_chat_id = chat_id
        user.telegram_username = tg_username
        user.telegram_connected_at = datetime.now(timezone.utc)
        user.telegram_link_token = None  # Clear used token
        user.telegram_link_expires_at = None
        if not user.telegram_notifications:
            user.telegram_notifications = DEFAULT_TG_PREFS
        await db.commit()

        display = user.display_name or user.email.split("@")[0]
        await send_message(
            chat_id,
            f"🎉 <b>Connected Successfully!</b>\n\n"
            f"Welcome, <b>{display}</b>!\n\n"
            f"You'll now receive instant notifications\n"
            f"for all your trading activity.\n\n"
            f"━━━━━━━━━━━━━━━━━━━━━━\n"
            f"⚙️ <i>Manage preferences in your Dashboard</i>\n"
            f"   → Profile → Telegram Settings",
        )
        logger.info("telegram_connected", user_id=str(user.id), chat_id=chat_id, username=tg_username)
        return {"ok": True}

    # Handle /disconnect command
    if text.strip() == "/disconnect":
        result = await db.execute(
            select(User).where(User.telegram_chat_id == chat_id)
        )
        user = result.scalars().first()
        if user:
            user.telegram_chat_id = None
            user.telegram_username = None
            user.telegram_connected_at = None
            await db.commit()
            await send_message(chat_id, "✅ <b>Disconnected.</b>\nYou will no longer receive TwinGrid alerts.")
        else:
            await send_message(chat_id, "ℹ️ No account is linked to this Telegram.")
        return {"ok": True}

    # Default response for unknown messages
    await send_message(
        chat_id,
        "🤖 <b>TwinGrid Alerts Bot</b>\n\n"
        "I only send trading notifications.\n"
        "Connect via your Dashboard → Profile → Telegram.",
    )
    return {"ok": True}


# ── User-facing endpoints (JWT auth) ───────────────────────


class TelegramPreferencesUpdate(BaseModel):
    preferences: dict[str, bool]


@router.get("/me/telegram")
async def get_telegram_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get Telegram connection status + generate deep-link if not connected."""
    connected = current_user.telegram_chat_id is not None

    result = {
        "connected": connected,
        "username": current_user.telegram_username if connected else None,
        "connected_at": current_user.telegram_connected_at.isoformat() if connected and current_user.telegram_connected_at else None,
        "preferences": current_user.telegram_notifications or DEFAULT_TG_PREFS,
    }

    if not connected:
        # Generate a new deep-link token
        token = secrets.token_urlsafe(32)
        current_user.telegram_link_token = token
        current_user.telegram_link_expires_at = datetime.now(timezone.utc) + timedelta(minutes=LINK_TOKEN_TTL_MINUTES)
        await db.commit()
        result["connect_url"] = f"https://t.me/{BOT_USERNAME}?start={token}"
        result["expires_in_seconds"] = LINK_TOKEN_TTL_MINUTES * 60

    return result


@router.delete("/me/telegram")
async def disconnect_telegram(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Disconnect Telegram from the current user."""
    if not current_user.telegram_chat_id:
        raise HTTPException(status_code=400, detail="Telegram is not connected")

    # Send goodbye message
    try:
        await send_message(
            current_user.telegram_chat_id,
            "👋 <b>Disconnected from TwinGrid.</b>\n\n"
            "You will no longer receive trading alerts.\n"
            "Reconnect anytime from your Dashboard.",
        )
    except Exception:
        pass

    current_user.telegram_chat_id = None
    current_user.telegram_username = None
    current_user.telegram_connected_at = None
    current_user.telegram_link_token = None
    current_user.telegram_link_expires_at = None
    await db.commit()

    return {"detail": "Telegram disconnected"}


@router.put("/me/telegram/preferences")
async def update_telegram_preferences(
    payload: TelegramPreferencesUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update per-user Telegram notification preferences."""
    if not current_user.telegram_chat_id:
        raise HTTPException(status_code=400, detail="Connect Telegram first")

    # Only allow known preference keys
    allowed_keys = set(DEFAULT_TG_PREFS.keys())
    current_prefs = current_user.telegram_notifications or dict(DEFAULT_TG_PREFS)

    for key, value in payload.preferences.items():
        if key in allowed_keys and isinstance(value, bool):
            current_prefs[key] = value

    current_user.telegram_notifications = current_prefs
    await db.commit()

    return {"preferences": current_user.telegram_notifications}
