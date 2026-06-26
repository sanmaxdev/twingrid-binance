"""Authentication endpoints per §7 and §9."""

from datetime import datetime, timedelta, timezone
import uuid
import secrets
from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.api.deps import get_db
from app.core.config import settings
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    validate_password_strength,
)
from app.core.email import send_verification_email, send_password_reset_email, generate_otp
from app.core.rate_limit import (
    login_limiter_ip, login_limiter_email,
    register_limiter_ip, forgot_password_limiter,
    resend_verification_limiter, get_client_ip,
)
from app.models.user import User
from app.models.session import Session
from app.services.audit_service import record_audit
from app.core.enums import AuditAction
from app.schemas.auth import (
    RegisterRequest,
    LoginRequest,
    Token,
    RefreshTokenRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    VerifyEmailRequest,
    ResendVerificationRequest,
)
from app.schemas.user import UserResponse

router = APIRouter()


def _clear_auth_cookies(response: Response):
    """Clear all auth cookies with matching attributes.
    
    delete_cookie must match the same path/samesite/secure/httponly attrs
    that were used when the cookie was set, otherwise the browser won't
    actually remove them — leaving stale tokens that cause infinite redirect loops.
    """
    secure_cookie = not settings.APP_DEBUG
    for name in ("access_token", "refresh_token", "remember_me"):
        response.delete_cookie(
            key=name,
            path="/",
            httponly=True,
            secure=secure_cookie,
            samesite="strict",
        )


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(request: Request, payload: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Register a new user with invite code."""
    client_ip = get_client_ip(request)
    await register_limiter_ip.check_or_raise(client_ip)

    # Check invite code
    result = await db.execute(select(User).where(User.invite_code == payload.invite_code))
    inviting_user = result.scalars().first()
    if not inviting_user:
        raise HTTPException(status_code=400, detail="Invalid invite code")

    # Check existing user
    result = await db.execute(select(User).where(User.email == payload.email))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Email already registered")

    # Password strength check
    validate_password_strength(payload.password)

    # Create user
    new_invite_code = secrets.token_hex(4).upper()
    user = User(
        email=payload.email,
        password_hash=get_password_hash(payload.password),
        display_name=payload.display_name,
        is_active=True,
        is_email_verified=False,
        invite_code=new_invite_code,
        invited_by_id=inviting_user.id
    )

    # Generate 6-digit OTP
    otp = generate_otp()
    user.email_verification_token_hash = get_password_hash(otp)
    user.email_verification_expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)

    db.add(user)
    await db.flush()

    # Auto-provision personal workspace
    from app.models.workspace import Workspace
    from app.models.workspace_member import WorkspaceMember
    from app.core.enums import WorkspaceRole

    default_workspace = Workspace(name="Personal Workspace", owner_id=user.id)
    db.add(default_workspace)
    await db.flush()

    member = WorkspaceMember(
        workspace_id=default_workspace.id,
        user_id=user.id,
        role=WorkspaceRole.OWNER
    )
    db.add(member)

    await db.commit()
    await db.refresh(user)

    await record_audit(
        db, action=AuditAction.USER_REGISTERED,
        actor_user_id=user.id, target_user_id=user.id,
        ip_address=client_ip, user_agent=request.headers.get("user-agent"),
    )
    await db.commit()

    # Send OTP email (non-blocking)
    try:
        await send_verification_email(user.email, otp, user.display_name or "")
    except Exception:
        pass

    return UserResponse(
        id=user.id, email=user.email, display_name=user.display_name,
        role=user.role, is_active=user.is_active,
        is_email_verified=user.is_email_verified,
        totp_enabled=user.totp_secret_encrypted is not None,
        invite_code=user.invite_code,
        created_at=user.created_at, updated_at=user.updated_at,
        last_login_at=user.last_login_at,
    )


@router.post("/verify-email")
async def verify_email(request: Request, response: Response, payload: VerifyEmailRequest, db: AsyncSession = Depends(get_db)):
    """Verify email using 6-digit OTP code. Auto-logs user in on success."""
    result = await db.execute(
        select(User).where(User.email == payload.email, User.deleted_at == None)
    )
    user = result.scalars().first()

    if not user:
        raise HTTPException(status_code=400, detail="Invalid verification request")

    if user.is_email_verified:
        return {"detail": "Email already verified"}

    if not user.email_verification_token_hash:
        raise HTTPException(status_code=400, detail="No pending verification")

    if user.email_verification_expires_at and user.email_verification_expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Verification code has expired. Please request a new one.")

    if not verify_password(payload.otp, user.email_verification_token_hash):
        raise HTTPException(status_code=400, detail="Invalid verification code")

    user.is_email_verified = True
    user.email_verification_token_hash = None
    user.email_verification_expires_at = None

    await record_audit(
        db, action=AuditAction.USER_VERIFIED,
        actor_user_id=user.id, target_user_id=user.id,
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    # Auto-login: create session and set cookies
    client_ip = get_client_ip(request)
    user.last_login_at = datetime.now(timezone.utc)
    user.last_login_ip = client_ip

    access_token = create_access_token(subject=user.id)
    refresh_token = create_refresh_token(subject=user.id)
    refresh_hash = get_password_hash(refresh_token)

    session = Session(
        user_id=user.id,
        refresh_token_hash=refresh_hash,
        ip_address=client_ip,
        user_agent=request.headers.get("user-agent"),
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.JWT_REFRESH_TTL_DAYS)
    )
    db.add(session)
    await db.commit()

    secure_cookie = not settings.APP_DEBUG
    access_max_age = settings.JWT_ACCESS_TTL_MINUTES * 60
    refresh_max_age = settings.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60

    response.set_cookie(
        key="access_token", value=access_token, httponly=True, secure=secure_cookie,
        samesite="strict", max_age=access_max_age, path="/"
    )
    response.set_cookie(
        key="refresh_token", value=refresh_token, httponly=True, secure=secure_cookie,
        samesite="strict", max_age=refresh_max_age, path="/"
    )
    response.set_cookie(
        key="remember_me", value="1", httponly=True, secure=secure_cookie,
        samesite="strict", max_age=refresh_max_age, path="/"
    )

    return {"detail": "Email verified successfully"}


@router.post("/resend-verification")
async def resend_verification(
    request: Request, payload: ResendVerificationRequest, db: AsyncSession = Depends(get_db)
):
    """Resend email verification link."""
    await resend_verification_limiter.check_or_raise(payload.email)

    result = await db.execute(
        select(User).where(User.email == payload.email, User.deleted_at == None)
    )
    user = result.scalars().first()

    # Always return success to prevent email enumeration
    if not user or user.is_email_verified:
        return {"detail": "If an unverified account exists, a verification code has been sent"}

    otp = generate_otp()
    user.email_verification_token_hash = get_password_hash(otp)
    user.email_verification_expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
    await db.commit()

    try:
        await send_verification_email(user.email, otp)
    except Exception:
        pass

    return {"detail": "If an unverified account exists, a verification code has been sent"}


@router.post("/login", response_model=Token)
async def login(request: Request, response: Response, payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate user and return JWT tokens."""
    client_ip = get_client_ip(request)
    await login_limiter_ip.check_or_raise(client_ip)
    await login_limiter_email.check_or_raise(payload.email)

    result = await db.execute(select(User).where(User.email == payload.email, User.deleted_at == None))
    user = result.scalars().first()

    if user and user.locked_until and user.locked_until > datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is temporarily locked due to multiple failed login attempts. Please try again later."
        )

    if not user or not verify_password(payload.password, user.password_hash):
        if user:
            user.failed_login_count += 1
            if user.failed_login_count >= 5:
                user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=15)
                
            await record_audit(
                db, action=AuditAction.LOGIN_FAILED,
                actor_user_id=user.id, target_user_id=user.id,
                ip_address=client_ip,
                user_agent=request.headers.get("user-agent"),
                payload={"reason": "bad_credentials", "failed_attempts": user.failed_login_count},
            )
            await db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User account is inactive")

    if user.suspended_at:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User account is suspended")

    # TOTP check
    if user.totp_secret_encrypted:
        if not payload.totp_code:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="TOTP code required")
        import pyotp
        from app.core.security import decrypt_totp_secret
        secret = decrypt_totp_secret(user.totp_secret_encrypted)
        totp = pyotp.TOTP(secret)
        if not totp.verify(payload.totp_code):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid TOTP code")

    # Reset failed login count
    user.failed_login_count = 0
    user.locked_until = None
    user.last_login_at = datetime.now(timezone.utc)
    user.last_login_ip = client_ip

    # Generate tokens
    access_token = create_access_token(subject=user.id)
    refresh_token = create_refresh_token(subject=user.id)
    refresh_hash = get_password_hash(refresh_token)

    # Enforce max 10 sessions — revoke oldest if exceeded
    result = await db.execute(
        select(Session).where(
            Session.user_id == user.id, Session.revoked_at == None
        ).order_by(Session.created_at.asc())
    )
    active_sessions = result.scalars().all()
    if len(active_sessions) >= 10:
        oldest = active_sessions[0]
        oldest.revoked_at = datetime.now(timezone.utc)
        oldest.revoked_reason = "Max sessions exceeded"

    # Check if this is a new IP BEFORE creating the session
    # Cast INET to text and strip CIDR suffix (/32) for proper comparison
    from sqlalchemy import cast, String as SAString
    ip_result = await db.execute(
        select(cast(Session.ip_address, SAString)).where(
            Session.user_id == user.id,
            Session.ip_address != None
        ).distinct()
    )
    known_ips = {row[0].split("/")[0] for row in ip_result.all()}
    is_new_ip = client_ip not in known_ips

    session = Session(
        user_id=user.id,
        refresh_token_hash=refresh_hash,
        ip_address=client_ip,
        user_agent=request.headers.get("user-agent"),
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.JWT_REFRESH_TTL_DAYS)
    )
    db.add(session)

    await record_audit(
        db, action=AuditAction.LOGIN_SUCCESS,
        actor_user_id=user.id, target_user_id=user.id,
        ip_address=client_ip, user_agent=request.headers.get("user-agent"),
        emit_event=False,  # Don't spam event feed with every login
    )
    await db.commit()

    # Send login alert email only for NEW IP addresses (non-blocking)
    if is_new_ip:
        try:
            from app.services.notification_service import notification_service
            await notification_service.notify_login(
                user.email, client_ip,
                request.headers.get("user-agent", "Unknown"),
                datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
            )
        except Exception:
            pass

    # Set HttpOnly Cookies
    secure_cookie = not settings.APP_DEBUG
    access_max_age = settings.JWT_ACCESS_TTL_MINUTES * 60
    refresh_max_age = settings.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60

    if payload.remember_me:
        # Persistent cookies — survive browser close
        response.set_cookie(
            key="access_token", value=access_token, httponly=True, secure=secure_cookie,
            samesite="strict", max_age=access_max_age, path="/"
        )
        response.set_cookie(
            key="refresh_token", value=refresh_token, httponly=True, secure=secure_cookie,
            samesite="strict", max_age=refresh_max_age, path="/"
        )
    else:
        # Session cookies — deleted when browser closes (no max_age)
        response.set_cookie(
            key="access_token", value=access_token, httponly=True, secure=secure_cookie,
            samesite="strict", path="/"
        )
        response.set_cookie(
            key="refresh_token", value=refresh_token, httponly=True, secure=secure_cookie,
            samesite="strict", path="/"
        )
    # Store remember_me preference — always persistent so refresh endpoint can read it
    response.set_cookie(
        key="remember_me", value="1" if payload.remember_me else "0",
        httponly=True, secure=secure_cookie, samesite="strict",
        max_age=refresh_max_age, path="/"
    )

    return {"access_token": access_token, "refresh_token": refresh_token, "token_type": "bearer"}


@router.post("/refresh", response_model=Token)
async def refresh_token(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    """Rotate refresh token and issue new access token."""
    from app.core.security import verify_token
    
    # Get token from cookie (primary) or request body (legacy)
    token_to_refresh = request.cookies.get("refresh_token")
    if not token_to_refresh:
        try:
            body = await request.json()
            token_to_refresh = body.get("refresh_token")
        except Exception:
            pass
    if not token_to_refresh:
        _clear_auth_cookies(response)
        raise HTTPException(status_code=401, detail="Refresh token missing")
        
    token_payload = verify_token(token_to_refresh, "refresh")

    if not token_payload:
        _clear_auth_cookies(response)
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user_id = token_payload.get("sub")

    result = await db.execute(
        select(Session).where(
            Session.user_id == uuid.UUID(user_id),
            Session.revoked_at == None,
            Session.expires_at > datetime.now(timezone.utc)
        )
    )
    sessions = result.scalars().all()

    valid_session = None
    for s in sessions:
        if verify_password(token_to_refresh, s.refresh_token_hash):
            valid_session = s
            break

    if not valid_session:
        _clear_auth_cookies(response)
        raise HTTPException(status_code=401, detail="Invalid or revoked refresh token")

    access_token = create_access_token(subject=user_id)
    new_refresh_token = create_refresh_token(subject=user_id)

    valid_session.refresh_token_hash = get_password_hash(new_refresh_token)
    valid_session.expires_at = datetime.now(timezone.utc) + timedelta(days=settings.JWT_REFRESH_TTL_DAYS)
    valid_session.ip_address = get_client_ip(request)

    await db.commit()

    # Respect remember_me preference from login
    remember_me = request.cookies.get("remember_me") == "1"
    secure_cookie = not settings.APP_DEBUG
    access_max_age = settings.JWT_ACCESS_TTL_MINUTES * 60
    refresh_max_age = settings.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60

    if remember_me:
        response.set_cookie(
            key="access_token", value=access_token, httponly=True, secure=secure_cookie,
            samesite="strict", max_age=access_max_age, path="/"
        )
        response.set_cookie(
            key="refresh_token", value=new_refresh_token, httponly=True, secure=secure_cookie,
            samesite="strict", max_age=refresh_max_age, path="/"
        )
    else:
        response.set_cookie(
            key="access_token", value=access_token, httponly=True, secure=secure_cookie,
            samesite="strict", path="/"
        )
        response.set_cookie(
            key="refresh_token", value=new_refresh_token, httponly=True, secure=secure_cookie,
            samesite="strict", path="/"
        )

    return {"access_token": access_token, "refresh_token": new_refresh_token, "token_type": "bearer"}


@router.post("/logout")
async def logout(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    """Revoke the current session and clear cookies."""
    from app.core.security import verify_token
    
    # Get token from cookie (primary) or request body (legacy)
    token_to_revoke = request.cookies.get("refresh_token")
    if not token_to_revoke:
        try:
            body = await request.json()
            token_to_revoke = body.get("refresh_token")
        except Exception:
            pass
    if not token_to_revoke:
        _clear_auth_cookies(response)
        return {"detail": "Logged out"}
        
    token_payload = verify_token(token_to_revoke, "refresh")
    if not token_payload:
        _clear_auth_cookies(response)
        return {"detail": "Logged out"}

    user_id = token_payload.get("sub")
    result = await db.execute(
        select(Session).where(Session.user_id == uuid.UUID(user_id), Session.revoked_at == None)
    )
    sessions = result.scalars().all()
    for s in sessions:
        if verify_password(token_to_revoke, s.refresh_token_hash):
            s.revoked_at = datetime.now(timezone.utc)
            s.revoked_reason = "User logged out"
            await record_audit(
                db, action=AuditAction.LOGOUT,
                actor_user_id=uuid.UUID(user_id), target_user_id=uuid.UUID(user_id),
                ip_address=get_client_ip(request),
                emit_event=False,
            )
            break

    await db.commit()
    
    _clear_auth_cookies(response)
    return {"detail": "Logged out"}


@router.post("/forgot-password")
async def forgot_password(request: Request, payload: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Request password reset email."""
    await forgot_password_limiter.check_or_raise(payload.email)

    result = await db.execute(select(User).where(User.email == payload.email, User.deleted_at == None))
    user = result.scalars().first()

    # Always return success to prevent email enumeration
    if user:
        otp = generate_otp()
        user.password_reset_token_hash = get_password_hash(otp)
        user.password_reset_expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)

        await record_audit(
            db, action=AuditAction.PASSWORD_RESET_REQUESTED,
            actor_user_id=user.id, target_user_id=user.id,
            ip_address=get_client_ip(request),
        )
        await db.commit()

        try:
            await send_password_reset_email(user.email, otp)
        except Exception:
            pass

    return {"detail": "If an account with that email exists, a reset code has been sent"}


@router.post("/reset-password")
async def reset_password(request: Request, payload: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Complete password reset with token."""
    # Find user by email
    result = await db.execute(
        select(User).where(User.email == payload.email, User.deleted_at == None)
    )
    user = result.scalars().first()

    if not user or not user.password_reset_token_hash:
        raise HTTPException(status_code=400, detail="Invalid reset request")

    if user.password_reset_expires_at and user.password_reset_expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Reset token has expired")

    if not verify_password(payload.otp, user.password_reset_token_hash):
        raise HTTPException(status_code=400, detail="Invalid reset code")

    validate_password_strength(payload.new_password)

    # Reject same password
    if verify_password(payload.new_password, user.password_hash):
        raise HTTPException(status_code=400, detail="New password must be different from current password")

    user.password_hash = get_password_hash(payload.new_password)
    user.password_reset_token_hash = None
    user.password_reset_expires_at = None

    # Revoke all sessions on password reset
    result = await db.execute(
        select(Session).where(Session.user_id == user.id, Session.revoked_at == None)
    )
    for s in result.scalars().all():
        s.revoked_at = datetime.now(timezone.utc)
        s.revoked_reason = "Password reset"

    await record_audit(
        db, action=AuditAction.PASSWORD_RESET_COMPLETED,
        actor_user_id=user.id, target_user_id=user.id,
        ip_address=get_client_ip(request),
    )
    await db.commit()

    return {"detail": "Password reset successfully"}
