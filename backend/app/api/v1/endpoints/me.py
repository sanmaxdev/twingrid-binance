"""Self-management endpoints (/me) per §9.2."""

import secrets
from datetime import datetime, timedelta, timezone
import pyotp
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.api.deps import get_db, get_current_user
from app.core.security import (
    encrypt_totp_secret, decrypt_totp_secret,
    verify_password, get_password_hash,
    validate_password_strength,
)
from app.core.email import send_verification_email
from app.core.rate_limit import get_client_ip
from app.models.user import User
from app.models.session import Session
from app.models.audit_log import AuditLog
from app.services.audit_service import record_audit
from app.core.enums import AuditAction
from app.schemas.user import UserResponse, UserUpdate
from app.schemas.auth import (
    TOTPSetupResponse, TOTPVerifyRequest,
    ChangePasswordRequest, ChangeEmailRequest,
)
from app.core.config import settings

router = APIRouter()


# ── Profile ──────────────────────────────────────────────

@router.get("/profile", response_model=UserResponse)
async def get_profile(current_user: User = Depends(get_current_user)):
    """Return the current user's profile."""
    return UserResponse(
        id=current_user.id, email=current_user.email,
        display_name=current_user.display_name, role=current_user.role,
        is_active=current_user.is_active,
        is_email_verified=current_user.is_email_verified,
        totp_enabled=current_user.totp_secret_encrypted is not None,
        invite_code=current_user.invite_code,
        created_at=current_user.created_at, updated_at=current_user.updated_at,
        last_login_at=current_user.last_login_at,
    )


@router.put("/profile", response_model=UserResponse)
async def update_profile(
    payload: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update display name."""
    if payload.display_name is not None:
        current_user.display_name = payload.display_name

    await db.commit()
    await db.refresh(current_user)

    return UserResponse(
        id=current_user.id, email=current_user.email,
        display_name=current_user.display_name, role=current_user.role,
        is_active=current_user.is_active,
        is_email_verified=current_user.is_email_verified,
        totp_enabled=current_user.totp_secret_encrypted is not None,
        invite_code=current_user.invite_code,
        created_at=current_user.created_at, updated_at=current_user.updated_at,
        last_login_at=current_user.last_login_at,
    )


# ── Password ─────────────────────────────────────────────

@router.post("/password")
async def change_password(
    request: Request,
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Change the current user's password."""
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    validate_password_strength(payload.new_password)

    if verify_password(payload.new_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="New password must be different")

    current_user.password_hash = get_password_hash(payload.new_password)

    await record_audit(
        db, action=AuditAction.PASSWORD_CHANGED,
        actor_user_id=current_user.id, target_user_id=current_user.id,
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()

    return {"detail": "Password changed successfully"}


# ── Email Change ─────────────────────────────────────────

@router.post("/email")
async def change_email(
    request: Request,
    payload: ChangeEmailRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Request email change. Requires password confirmation and sends verification to new email."""
    if not verify_password(payload.password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Password is incorrect")

    # Check if new email is already taken
    result = await db.execute(select(User).where(User.email == payload.new_email))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Email already in use")

    old_email = current_user.email
    current_user.email = payload.new_email
    current_user.is_email_verified = False

    # Generate new verification token
    token = secrets.token_urlsafe(32)
    current_user.email_verification_token_hash = get_password_hash(token)
    current_user.email_verification_expires_at = datetime.now(timezone.utc) + timedelta(hours=24)

    await record_audit(
        db, action=AuditAction.EMAIL_CHANGED,
        actor_user_id=current_user.id, target_user_id=current_user.id,
        payload={"old_email": old_email, "new_email": payload.new_email},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()

    try:
        await send_verification_email(payload.new_email, token)
    except Exception:
        pass

    return {"detail": "Email updated. Please verify your new email address."}


# ── Sessions ─────────────────────────────────────────────

@router.get("/sessions")
async def list_sessions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all active sessions for the current user."""
    result = await db.execute(
        select(Session).where(
            Session.user_id == current_user.id,
            Session.revoked_at == None,
            Session.expires_at > datetime.now(timezone.utc),
        ).order_by(Session.created_at.desc())
    )
    sessions = result.scalars().all()

    return [
        {
            "id": str(s.id),
            "ip_address": s.ip_address,
            "user_agent": s.user_agent,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "expires_at": s.expires_at.isoformat() if s.expires_at else None,
        }
        for s in sessions
    ]


@router.delete("/sessions/{session_id}")
async def revoke_session(
    session_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke a specific session."""
    import uuid
    try:
        sid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session ID")

    result = await db.execute(
        select(Session).where(
            Session.id == sid,
            Session.user_id == current_user.id,
            Session.revoked_at == None,
        )
    )
    session = result.scalars().first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session.revoked_at = datetime.now(timezone.utc)
    session.revoked_reason = "Revoked by user"
    await db.commit()

    return {"detail": "Session revoked"}


# ── Audit Log ────────────────────────────────────────────

@router.get("/audit-log")
async def my_audit_log(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
):
    """View own audit log entries."""
    offset = (page - 1) * per_page

    # Count total
    count_result = await db.execute(
        select(func.count()).select_from(AuditLog).where(
            AuditLog.actor_user_id == current_user.id
        )
    )
    total = count_result.scalar()

    result = await db.execute(
        select(AuditLog).where(
            AuditLog.actor_user_id == current_user.id
        ).order_by(AuditLog.occurred_at.desc()).offset(offset).limit(per_page)
    )
    entries = result.scalars().all()

    return {
        "items": [
            {
                "id": e.id,
                "action": e.action,
                "ip_address": e.ip_address,
                "occurred_at": e.occurred_at.isoformat() if e.occurred_at else None,
                "payload": e.payload,
            }
            for e in entries
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


# ── TOTP ─────────────────────────────────────────────────

@router.post("/totp/setup", response_model=TOTPSetupResponse)
async def setup_totp(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate TOTP secret and provisioning URI (does NOT save until verified)."""
    if current_user.totp_secret_encrypted:
        raise HTTPException(status_code=400, detail="TOTP is already enabled")

    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret)
    uri = totp.provisioning_uri(name=current_user.email, issuer_name=settings.APP_NAME)

    # Don't save to DB yet — only save after verification
    return {"secret": secret, "uri": uri}


@router.post("/totp/verify")
async def verify_totp(
    request: Request,
    payload: TOTPVerifyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Verify TOTP code and save secret to DB on success."""
    if not payload.secret:
        raise HTTPException(status_code=400, detail="Secret is required for verification")

    totp = pyotp.TOTP(payload.secret)
    if not totp.verify(payload.code):
        raise HTTPException(status_code=400, detail="Invalid TOTP code")

    # Only now persist the secret
    current_user.totp_secret_encrypted = encrypt_totp_secret(payload.secret)

    await record_audit(
        db, action=AuditAction.TOTP_ENROLLED,
        actor_user_id=current_user.id, target_user_id=current_user.id,
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()

    return {"detail": "TOTP verified successfully"}


@router.post("/totp/disable")
async def disable_totp(
    request: Request,
    payload: TOTPVerifyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Disable TOTP (requires current TOTP code)."""
    if not current_user.totp_secret_encrypted:
        raise HTTPException(status_code=400, detail="TOTP is not enabled")

    secret = decrypt_totp_secret(current_user.totp_secret_encrypted)
    totp = pyotp.TOTP(secret)

    if not totp.verify(payload.code):
        raise HTTPException(status_code=400, detail="Invalid TOTP code")

    current_user.totp_secret_encrypted = None

    await record_audit(
        db, action=AuditAction.TOTP_DISABLED,
        actor_user_id=current_user.id, target_user_id=current_user.id,
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()

    return {"detail": "TOTP disabled successfully"}
