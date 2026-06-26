from datetime import datetime, timezone
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.api.deps import get_db, require_admin
from app.core.rate_limit import get_client_ip
from app.core.security import get_password_hash, create_access_token
from app.core.email import send_password_reset_email
from app.core.enums import AuditAction, Role
from app.models.user import User
from app.models.session import Session
from app.models.account import Account
from app.models.basket import Basket
from app.models.audit_log import AuditLog
from app.models.user_subscription import UserSubscription
from app.services.audit_service import record_audit

import secrets

router = APIRouter()


@router.get("/users")
async def list_users(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    search: str = Query(None),
    role: str = Query(None),
    status: str = Query(None),  # active, suspended, inactive
):
    """List all users with search, filtering, and pagination."""
    stmt = select(User).where(User.deleted_at == None)

    if search:
        stmt = stmt.where(
            or_(
                User.email.ilike(f"%{search}%"),
                User.display_name.ilike(f"%{search}%"),
            )
        )
    if role:
        stmt = stmt.where(User.role == role)
    if status == "suspended":
        stmt = stmt.where(User.suspended_at != None)
    elif status == "active":
        stmt = stmt.where(User.is_active == True, User.suspended_at == None)
    elif status == "inactive":
        stmt = stmt.where(User.is_active == False)

    # Count
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar()

    # Paginate
    stmt = stmt.order_by(User.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    users = result.scalars().all()

    # Fetch subscriptions for listed users in one query
    user_ids = [u.id for u in users]
    sub_map = {}
    if user_ids:
        sub_result = await db.execute(
            select(UserSubscription).where(UserSubscription.user_id.in_(user_ids))
        )
        for sub in sub_result.scalars().all():
            sub_map[sub.user_id] = sub

    return {
        "items": [
            {
                "id": str(u.id),
                "email": u.email,
                "display_name": u.display_name,
                "role": u.role,
                "is_active": u.is_active,
                "is_email_verified": u.is_email_verified,
                "twin_grid_balance": float(u.twin_grid_balance),
                "suspended_at": u.suspended_at.isoformat() if u.suspended_at else None,
                "suspended_reason": u.suspended_reason,
                "created_at": u.created_at.isoformat() if u.created_at else None,
                "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
                "subscription": {
                    "plan_id": sub_map[u.id].plan_id if u.id in sub_map else "free",
                    "status": sub_map[u.id].status if u.id in sub_map else "active",
                } if True else None,
            }
            for u in users
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.get("/users/{user_id}")
async def get_user_detail(
    user_id: UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get detailed user info including account count and session count."""
    result = await db.execute(select(User).where(User.id == user_id, User.deleted_at == None))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Counts
    account_count = (await db.execute(
        select(func.count()).select_from(Account).where(Account.user_id == user_id, Account.deleted_at == None)
    )).scalar()

    active_session_count = (await db.execute(
        select(func.count()).select_from(Session).where(
            Session.user_id == user_id, Session.revoked_at == None,
            Session.expires_at > datetime.now(timezone.utc)
        )
    )).scalar()

    basket_count = (await db.execute(
        select(func.count()).select_from(Basket).where(Basket.user_id == user_id)
    )).scalar()

    return {
        "id": str(user.id),
        "email": user.email,
        "display_name": user.display_name,
        "role": user.role,
        "is_active": user.is_active,
        "is_email_verified": user.is_email_verified,
        "totp_enabled": user.totp_secret_encrypted is not None,
        "suspended_at": user.suspended_at.isoformat() if user.suspended_at else None,
        "suspended_reason": user.suspended_reason,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "updated_at": user.updated_at.isoformat() if user.updated_at else None,
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
        "last_login_ip": user.last_login_ip,
        "invite_code": user.invite_code,
        "account_count": account_count,
        "active_session_count": active_session_count,
        "basket_count": basket_count,
    }


@router.post("/users/{user_id}/suspend")
async def suspend_user(
    user_id: UUID,
    request: Request,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    reason: str = Query(None),
):
    """Suspend a user. Halts all their running accounts."""
    result = await db.execute(select(User).where(User.id == user_id, User.deleted_at == None))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot suspend yourself")

    if user.role == Role.SUPER_ADMIN.value:
        raise HTTPException(status_code=403, detail="Cannot suspend a super admin")

    user.suspended_at = datetime.now(timezone.utc)
    user.suspended_reason = reason or "Suspended by admin"
    user.suspended_by = admin.id

    # Revoke all sessions
    sessions_result = await db.execute(
        select(Session).where(Session.user_id == user_id, Session.revoked_at == None)
    )
    for s in sessions_result.scalars().all():
        s.revoked_at = datetime.now(timezone.utc)
        s.revoked_reason = "User suspended"

    # Halt all running accounts
    accounts_result = await db.execute(
        select(Account).where(
            Account.user_id == user_id,
            Account.status.in_(["RUNNING", "PAUSED"]),
            Account.deleted_at == None,
        )
    )
    for acc in accounts_result.scalars().all():
        acc.status = "HALTED"
        acc.auto_trade_enabled = False

    await record_audit(
        db, action=AuditAction.USER_SUSPENDED,
        actor_user_id=admin.id, target_user_id=user_id,
        payload={"reason": reason},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()

    return {"detail": f"User {user.email} suspended"}


@router.post("/users/{user_id}/unsuspend")
async def unsuspend_user(
    user_id: UUID,
    request: Request,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Remove suspension from a user. Accounts remain HALTED; user must re-enable."""
    result = await db.execute(select(User).where(User.id == user_id, User.deleted_at == None))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not user.suspended_at:
        raise HTTPException(status_code=400, detail="User is not suspended")

    user.suspended_at = None
    user.suspended_reason = None
    user.suspended_by = None

    await record_audit(
        db, action=AuditAction.USER_UNSUSPENDED,
        actor_user_id=admin.id, target_user_id=user_id,
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()

    return {"detail": f"User {user.email} unsuspended. Accounts remain halted."}


@router.post("/users/{user_id}/force-logout")
async def force_logout(
    user_id: UUID,
    request: Request,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Revoke all sessions for a user."""
    result = await db.execute(select(User).where(User.id == user_id, User.deleted_at == None))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    sessions_result = await db.execute(
        select(Session).where(Session.user_id == user_id, Session.revoked_at == None)
    )
    count = 0
    for s in sessions_result.scalars().all():
        s.revoked_at = datetime.now(timezone.utc)
        s.revoked_reason = "Forced logout by admin"
        count += 1

    await record_audit(
        db, action=AuditAction.USER_FORCE_LOGOUT,
        actor_user_id=admin.id, target_user_id=user_id,
        payload={"sessions_revoked": count},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()

    return {"detail": f"Revoked {count} sessions for {user.email}"}


@router.post("/users/{user_id}/force-password-reset")
async def force_password_reset(
    user_id: UUID,
    request: Request,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Force password reset — sends reset email to user."""
    result = await db.execute(select(User).where(User.id == user_id, User.deleted_at == None))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    token = secrets.token_urlsafe(32)
    user.password_reset_token_hash = get_password_hash(token)
    from datetime import timedelta
    user.password_reset_expires_at = datetime.now(timezone.utc) + timedelta(hours=1)

    await record_audit(
        db, action=AuditAction.USER_FORCE_PASSWORD_RESET,
        actor_user_id=admin.id, target_user_id=user_id,
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()

    try:
        await send_password_reset_email(user.email, token)
    except Exception:
        pass

    return {"detail": f"Password reset email sent to {user.email}"}


@router.get("/users/{user_id}/accounts")
async def get_user_accounts(
    user_id: UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List all accounts for a specific user (admin read-only)."""
    result = await db.execute(
        select(Account).where(Account.user_id == user_id, Account.deleted_at == None)
        .order_by(Account.created_at.desc())
    )
    accounts = result.scalars().all()
    return [
        {
            "id": str(a.id),
            "name": a.name,
            "exchange": a.exchange,
            "status": a.status,
            "auto_trade_enabled": a.auto_trade_enabled,
            "is_testnet": a.is_testnet,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in accounts
    ]


@router.get("/users/{user_id}/baskets")
async def get_user_baskets(
    user_id: UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
):
    """List baskets for a specific user (admin read-only)."""
    offset = (page - 1) * per_page
    count_result = await db.execute(
        select(func.count()).select_from(Basket).where(Basket.user_id == user_id)
    )
    total = count_result.scalar()

    result = await db.execute(
        select(Basket).where(Basket.user_id == user_id)
        .order_by(Basket.opened_at.desc()).offset(offset).limit(per_page)
    )
    baskets = result.scalars().all()

    return {
        "items": [
            {
                "id": str(b.id),
                "account_id": str(b.account_id),
                "symbol": b.symbol,
                "side": b.side,
                "status": b.status,
                "bo_price": float(b.bo_price) if b.bo_price else None,
                "sos_filled": b.sos_filled,
                "realized_pnl": float(b.realized_pnl) if b.realized_pnl else None,
                "opened_at": b.opened_at.isoformat() if b.opened_at else None,
                "closed_at": b.closed_at.isoformat() if b.closed_at else None,
            }
            for b in baskets
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.get("/users/{user_id}/audit-log")
async def get_user_audit_log(
    user_id: UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
):
    """View audit log for a specific user (admin read-only)."""
    offset = (page - 1) * per_page

    count_result = await db.execute(
        select(func.count()).select_from(AuditLog).where(
            or_(AuditLog.actor_user_id == user_id, AuditLog.target_user_id == user_id)
        )
    )
    total = count_result.scalar()

    result = await db.execute(
        select(AuditLog).where(
            or_(AuditLog.actor_user_id == user_id, AuditLog.target_user_id == user_id)
        ).order_by(AuditLog.occurred_at.desc()).offset(offset).limit(per_page)
    )
    entries = result.scalars().all()

    return {
        "items": [
            {
                "id": e.id,
                "action": e.action,
                "actor_user_id": str(e.actor_user_id) if e.actor_user_id else None,
                "target_user_id": str(e.target_user_id) if e.target_user_id else None,
                "ip_address": e.ip_address,
                "occurred_at": e.occurred_at.isoformat() if e.occurred_at else None,
                "payload": e.payload,
                "impersonating": e.impersonating,
            }
            for e in entries
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.post("/users/{user_id}/impersonate")
async def impersonate_user(
    user_id: UUID,
    request: Request,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Start impersonation — returns a scoped, read-only JWT."""
    result = await db.execute(select(User).where(User.id == user_id, User.deleted_at == None))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.role == Role.SUPER_ADMIN.value and admin.role != Role.SUPER_ADMIN.value:
        raise HTTPException(status_code=403, detail="Cannot impersonate a super admin")

    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot impersonate yourself")

    # Create a scoped access token with impersonation metadata
    from datetime import timedelta
    from jose import jwt
    from app.core.config import settings as app_settings
    import time

    expire = datetime.now(timezone.utc) + timedelta(minutes=30)
    token_data = {
        "sub": str(user_id),
        "exp": expire,
        "type": "access",
        "impersonator_id": str(admin.id),
        "read_only": True,
    }
    impersonation_token = jwt.encode(token_data, app_settings.JWT_SECRET, algorithm="HS256")

    await record_audit(
        db, action=AuditAction.IMPERSONATION_STARTED,
        actor_user_id=admin.id, target_user_id=user_id,
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()

    return {
        "access_token": impersonation_token,
        "token_type": "bearer",
        "impersonating_user": {
            "id": str(user.id),
            "email": user.email,
            "display_name": user.display_name,
        },
        "expires_in": 1800,  # 30 minutes
    }
