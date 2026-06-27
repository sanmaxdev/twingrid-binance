"""Email sending — Resend API (production) with SMTP fallback (dev)."""

import logging
import random
from collections import deque
from datetime import UTC, datetime
from email.message import EmailMessage

import aiosmtplib
import httpx

from app.core.config import settings
from app.core.email_templates import (
    password_reset_email,
    welcome_email,
)
from app.core.logging import scrub

logger = logging.getLogger(__name__)


def _mask_email(email: object) -> str:
    """Redact an email address for logging so PII is not stored in plain text."""
    try:
        local, domain = str(email).split("@", 1)
        return f"{local[:1]}***@{domain}"
    except ValueError:
        return "***"


# Resend API endpoint
RESEND_API_URL = "https://api.resend.com/emails"

# In-memory email log ring buffer (last 200 emails)
email_log: deque = deque(maxlen=200)


def generate_otp() -> str:
    """Generate a 6-digit numeric OTP."""
    return f"{random.randint(100000, 999999)}"


async def send_email(to_email: str, subject: str, html_content: str) -> bool:
    """Send email via Resend API (if key set) or SMTP fallback. Returns True on success."""
    success = False
    error_msg = None
    if settings.RESEND_API_KEY:
        success = await _send_via_resend(to_email, subject, html_content)
    elif settings.SMTP_HOST:
        success = await _send_via_smtp(to_email, subject, html_content)
    else:
        error_msg = "No email provider configured"
        logger.warning(
            f"No email provider configured. Would have sent to {_mask_email(to_email)}: {scrub(subject)}"
        )

    # Keep in-memory cache
    email_log.append(
        {
            "to": to_email,
            "subject": subject,
            "status": "sent" if success else "failed",
            "timestamp": datetime.now(UTC).isoformat(),
        }
    )

    # Persist to database
    try:
        await _persist_email_log(to_email, subject, "sent" if success else "failed", error_msg)
    except Exception as e:
        logger.error(f"Failed to persist email log: {e}")

    return success


async def _persist_email_log(to_email: str, subject: str, status: str, error: str = None):
    """Write email log entry to the database."""
    try:
        from app.core.database import AsyncSessionLocal
        from app.models.email_log import EmailLog

        async with AsyncSessionLocal() as session:
            log_entry = EmailLog(
                to_email=to_email,
                subject=subject,
                status=status,
                error=error,
            )
            session.add(log_entry)
            await session.commit()
    except Exception as e:
        logger.error(f"Failed to write email log to DB: {e}")


async def _send_via_resend(to_email: str, subject: str, html_content: str) -> bool:
    """Send email using Resend API."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                RESEND_API_URL,
                headers={
                    "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": settings.EMAIL_FROM,
                    "to": [to_email],
                    "subject": subject,
                    "html": html_content,
                },
            )
            if response.status_code in (200, 201):
                logger.info(f"✉️ Email sent via Resend to {_mask_email(to_email)}: {scrub(subject)}")
                return True
            else:
                logger.error(f"Resend API error {response.status_code}: {scrub(response.text)}")
                return False
    except Exception as e:
        logger.error(f"Failed to send email via Resend to {_mask_email(to_email)}: {scrub(e)}")
        return False


async def _send_via_smtp(to_email: str, subject: str, html_content: str) -> bool:
    """Fallback: send email via SMTP (Mailpit in dev)."""
    message = EmailMessage()
    message["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(html_content, subtype="html")

    try:
        await aiosmtplib.send(
            message,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
            use_tls=settings.SMTP_USE_TLS,
            start_tls=False if settings.SMTP_PORT == 1025 else True,
        )
        logger.info(f"✉️ Email sent via SMTP to {_mask_email(to_email)}: {scrub(subject)}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email via SMTP to {_mask_email(to_email)}: {scrub(e)}")
        return False


# ── Convenience Functions ──


async def send_verification_email(to_email: str, otp: str, display_name: str = ""):
    subject, html = welcome_email(display_name or to_email.split("@")[0], otp)
    await send_email(to_email, subject, html)


async def send_password_reset_email(to_email: str, otp: str):
    subject, html = password_reset_email(otp)
    await send_email(to_email, subject, html)
