"""Super-admin user management — promote, demote, hard-delete per §9."""

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import delete, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_admin, require_super_admin
from app.core.enums import AuditAction, Role
from app.core.rate_limit import get_client_ip
from app.models.account import Account
from app.models.affiliate_commission import AffiliateCommission
from app.models.audit_log import AuditLog
from app.models.basket import Basket
from app.models.fee_transaction import FeeTransaction
from app.models.order import Order
from app.models.session import Session
from app.models.user import User
from app.models.user_subscription import UserSubscription
from app.services.audit_service import record_audit

router = APIRouter()


@router.get("/users/{user_id}/detail")
async def get_user_detail(
    user_id: UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get comprehensive user detail for admin view modal."""
    result = await db.execute(select(User).where(User.id == user_id, User.deleted_at == None))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # --- Account stats ---
    acc_result = await db.execute(select(Account).where(Account.user_id == user_id))
    accounts = acc_result.scalars().all()

    # --- Basket/PnL stats ---
    basket_stats = await db.execute(
        select(
            func.count(Basket.id).label("total"),
            func.count(Basket.id).filter(Basket.status == "ACTIVE").label("active"),
            func.count(Basket.id).filter(Basket.status == "CLOSED").label("closed"),
            func.coalesce(func.sum(Basket.realized_pnl).filter(Basket.status == "CLOSED"), 0).label(
                "total_realized_pnl"
            ),
            func.coalesce(func.sum(Basket.fees_paid).filter(Basket.status == "CLOSED"), 0).label(
                "total_fees_binance"
            ),
            func.count(Basket.id)
            .filter(Basket.status == "CLOSED", Basket.realized_pnl != None, Basket.realized_pnl > 0)
            .label("winning"),
            func.count(Basket.id)
            .filter(
                Basket.status == "CLOSED", Basket.realized_pnl != None, Basket.realized_pnl <= 0
            )
            .label("losing"),
        ).where(Basket.user_id == user_id)
    )
    bs = basket_stats.one()

    closed_count = float(bs.closed or 0)
    win_rate = round((float(bs.winning or 0) / closed_count) * 100, 1) if closed_count > 0 else 0

    # --- Session count ---
    session_result = await db.execute(
        select(func.count(Session.id)).where(Session.user_id == user_id, Session.revoked_at == None)
    )
    active_sessions = session_result.scalar() or 0

    # --- Fee transactions (last 20) ---
    fee_result = await db.execute(
        select(FeeTransaction)
        .where(FeeTransaction.user_id == user_id)
        .order_by(desc(FeeTransaction.created_at))
        .limit(20)
    )
    fee_txns = fee_result.scalars().all()

    # --- Total TG fees paid ---
    tg_fees_result = await db.execute(
        select(func.coalesce(func.sum(FeeTransaction.amount), 0)).where(
            FeeTransaction.user_id == user_id, FeeTransaction.type == "FEE_DEDUCTION"
        )
    )
    total_tg_fees = abs(float(tg_fees_result.scalar() or 0))

    # --- Total deposits ---
    deposits_result = await db.execute(
        select(func.coalesce(func.sum(FeeTransaction.amount), 0)).where(
            FeeTransaction.user_id == user_id, FeeTransaction.type == "DEPOSIT"
        )
    )
    total_deposits = float(deposits_result.scalar() or 0)

    # --- Affiliate stats ---
    referral_count_result = await db.execute(
        select(func.count()).where(User.invited_by_id == user_id, User.deleted_at == None)
    )
    referral_count = referral_count_result.scalar() or 0

    affiliate_earned_result = await db.execute(
        select(func.coalesce(func.sum(AffiliateCommission.commission_amount), 0)).where(
            AffiliateCommission.referrer_id == user_id
        )
    )
    total_affiliate_earned = float(affiliate_earned_result.scalar() or 0)

    # Who invited this user?
    invited_by_info = None
    if user.invited_by_id:
        inviter_result = await db.execute(
            select(User.email, User.display_name).where(User.id == user.invited_by_id)
        )
        inviter = inviter_result.first()
        if inviter:
            invited_by_info = {
                "id": str(user.invited_by_id),
                "email": inviter.email,
                "display_name": inviter.display_name,
            }

    # --- Referral list (users invited by this user) ---
    referrals_result = await db.execute(
        select(User)
        .where(User.invited_by_id == user_id, User.deleted_at == None)
        .order_by(User.created_at.desc())
    )
    referrals = referrals_result.scalars().all()

    referral_items = []
    for r in referrals:
        # Commission earned from this referral
        r_earned_q = await db.execute(
            select(func.coalesce(func.sum(AffiliateCommission.commission_amount), 0)).where(
                AffiliateCommission.referrer_id == user_id,
                AffiliateCommission.referral_id == r.id,
            )
        )
        r_earned = float(r_earned_q.scalar() or 0)
        referral_items.append(
            {
                "id": str(r.id),
                "email": r.email,
                "display_name": r.display_name,
                "is_active": r.is_active,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "commission_earned": round(r_earned, 4),
            }
        )

    # --- Recent commission transactions (last 30) ---
    commission_result = await db.execute(
        select(AffiliateCommission)
        .where(AffiliateCommission.referrer_id == user_id)
        .order_by(desc(AffiliateCommission.created_at))
        .limit(30)
    )
    commissions = commission_result.scalars().all()

    # Map referral IDs to emails for commission history
    comm_referral_ids = list({c.referral_id for c in commissions})
    comm_user_map = {}
    if comm_referral_ids:
        comm_users_r = await db.execute(select(User).where(User.id.in_(comm_referral_ids)))
        comm_user_map = {
            u.id: {"email": u.email, "name": u.display_name} for u in comm_users_r.scalars().all()
        }

    # --- Total withdrawn ---
    from app.models.affiliate_withdrawal import AffiliateWithdrawal

    withdrawn_result = await db.execute(
        select(func.coalesce(func.sum(AffiliateWithdrawal.amount), 0)).where(
            AffiliateWithdrawal.user_id == user_id,
            AffiliateWithdrawal.status == "APPROVED",
        )
    )
    total_withdrawn = float(withdrawn_result.scalar() or 0)

    # --- Pending withdrawal ---
    pending_wd_result = await db.execute(
        select(func.coalesce(func.sum(AffiliateWithdrawal.amount), 0)).where(
            AffiliateWithdrawal.user_id == user_id,
            AffiliateWithdrawal.status == "PENDING",
        )
    )
    pending_withdrawal = float(pending_wd_result.scalar() or 0)

    # --- Subscription ---
    sub_result = await db.execute(
        select(UserSubscription).where(UserSubscription.user_id == user_id)
    )
    user_sub = sub_result.scalar_one_or_none()
    subscription_data = None
    if user_sub:
        subscription_data = {
            "plan_id": user_sub.plan_id,
            "plan_name": user_sub.plan.name if user_sub.plan else user_sub.plan_id.title(),
            "plan_price": float(user_sub.plan.price_usd) if user_sub.plan else 0,
            "status": user_sub.status,
            "started_at": user_sub.started_at.isoformat() if user_sub.started_at else None,
            "current_period_end": user_sub.current_period_end.isoformat()
            if user_sub.current_period_end
            else None,
            "grace_period_end": user_sub.grace_period_end.isoformat()
            if user_sub.grace_period_end
            else None,
            "cancel_at_period_end": user_sub.cancel_at_period_end,
            "cancelled_at": user_sub.cancelled_at.isoformat() if user_sub.cancelled_at else None,
        }
    else:
        subscription_data = {
            "plan_id": "free",
            "plan_name": "Free",
            "plan_price": 0,
            "status": "active",
            "started_at": None,
            "current_period_end": None,
            "grace_period_end": None,
            "cancel_at_period_end": False,
            "cancelled_at": None,
        }

    return {
        "user": {
            "id": str(user.id),
            "email": user.email,
            "display_name": user.display_name,
            "role": user.role,
            "is_active": user.is_active,
            "is_email_verified": user.is_email_verified,
            "totp_enabled": bool(user.totp_secret_encrypted),
            "twin_grid_balance": float(user.twin_grid_balance or 0),
            "fee_percentage_override": float(user.fee_percentage_override)
            if user.fee_percentage_override
            else None,
            "invite_code": user.invite_code,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
            "last_login_ip": str(user.last_login_ip) if user.last_login_ip else None,
            "suspended_at": user.suspended_at.isoformat() if user.suspended_at else None,
            "suspended_reason": user.suspended_reason,
            "affiliate_balance": round(float(user.affiliate_balance or 0), 4),
            "affiliate_commission_override": float(user.affiliate_commission_override)
            if user.affiliate_commission_override is not None
            else None,
            "invited_by": invited_by_info,
            # Telegram
            "telegram_chat_id": user.telegram_chat_id,
            "telegram_username": user.telegram_username,
            "telegram_connected_at": user.telegram_connected_at.isoformat()
            if user.telegram_connected_at
            else None,
            "telegram_notifications": user.telegram_notifications,
        },
        "stats": {
            "total_accounts": len(accounts),
            "active_sessions": active_sessions,
            "total_baskets": int(bs.total or 0),
            "active_baskets": int(bs.active or 0),
            "closed_baskets": int(bs.closed or 0),
            "winning_baskets": int(bs.winning or 0),
            "losing_baskets": int(bs.losing or 0),
            "win_rate": win_rate,
            "total_realized_pnl": round(float(bs.total_realized_pnl or 0), 4),
            "total_binance_fees": round(float(bs.total_fees_binance or 0), 4),
            "total_tg_fees_paid": round(total_tg_fees, 4),
            "total_deposits": round(total_deposits, 4),
            "referral_count": referral_count,
            "total_affiliate_earned": round(total_affiliate_earned, 4),
        },
        "subscription": subscription_data,
        "affiliate": {
            "balance": round(float(user.affiliate_balance or 0), 4),
            "total_earned": round(total_affiliate_earned, 4),
            "total_withdrawn": round(total_withdrawn, 4),
            "pending_withdrawal": round(pending_withdrawal, 4),
            "commission_override": float(user.affiliate_commission_override)
            if user.affiliate_commission_override is not None
            else None,
            "invite_code": user.invite_code,
            "invited_by": invited_by_info,
            "referral_count": referral_count,
            "referrals": referral_items,
            "commission_history": [
                {
                    "id": str(c.id),
                    "referral_id": str(c.referral_id),
                    "referral_email": comm_user_map.get(c.referral_id, {}).get("email", ""),
                    "referral_name": comm_user_map.get(c.referral_id, {}).get("name", ""),
                    "fee_amount": round(float(c.fee_amount), 4),
                    "commission_pct": round(float(c.commission_pct), 2),
                    "commission_amount": round(float(c.commission_amount), 4),
                    "created_at": c.created_at.isoformat() if c.created_at else None,
                }
                for c in commissions
            ],
        },
        "accounts": [
            {
                "id": str(a.id),
                "name": a.name,
                "exchange": a.exchange,
                "is_testnet": a.is_testnet,
                "status": a.status,
                "auto_trade_enabled": a.auto_trade_enabled,
            }
            for a in accounts
        ],
        "fee_history": [
            {
                "id": str(f.id),
                "type": f.type,
                "amount": float(f.amount),
                "balance_before": float(f.balance_before),
                "balance_after": float(f.balance_after),
                "fee_percentage": float(f.fee_percentage) if f.fee_percentage else None,
                "basket_pnl": float(f.basket_pnl) if f.basket_pnl else None,
                "note": f.note,
                "created_at": f.created_at.isoformat() if f.created_at else None,
            }
            for f in fee_txns
        ],
    }


@router.post("/users/{user_id}/promote")
async def promote_to_admin(
    user_id: UUID,
    request: Request,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Promote a USER to ADMIN role."""
    result = await db.execute(select(User).where(User.id == user_id, User.deleted_at == None))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.role != Role.USER.value:
        raise HTTPException(status_code=400, detail=f"User already has role: {user.role}")

    old_role = user.role
    user.role = Role.ADMIN.value

    await record_audit(
        db,
        action=AuditAction.USER_PROMOTED,
        actor_user_id=admin.id,
        target_user_id=user_id,
        payload={"old_role": old_role, "new_role": Role.ADMIN.value},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()

    return {"detail": f"{user.email} promoted to ADMIN"}


@router.post("/users/{user_id}/demote")
async def demote_to_user(
    user_id: UUID,
    request: Request,
    admin: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """Demote an ADMIN to USER role."""
    result = await db.execute(select(User).where(User.id == user_id, User.deleted_at == None))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.role != Role.ADMIN.value:
        raise HTTPException(
            status_code=400, detail=f"Can only demote ADMIN role, user has: {user.role}"
        )

    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot demote yourself")

    old_role = user.role
    user.role = Role.USER.value

    await record_audit(
        db,
        action=AuditAction.USER_DEMOTED,
        actor_user_id=admin.id,
        target_user_id=user_id,
        payload={"old_role": old_role, "new_role": Role.USER.value},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()

    return {"detail": f"{user.email} demoted to USER"}


@router.delete("/users/{user_id}")
async def hard_delete_user(
    user_id: UUID,
    request: Request,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Hard-delete a user and cascade (GDPR). Audit entries retained with PII redacted."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")

    if user.role == Role.SUPER_ADMIN.value:
        raise HTTPException(status_code=403, detail="Cannot delete a super admin")

    user_email = user.email

    # Record audit BEFORE deletion (retain with PII redacted)
    await record_audit(
        db,
        action=AuditAction.USER_HARD_DELETED,
        actor_user_id=admin.id,
        target_user_id=user_id,
        payload={"deleted_email_hash": str(hash(user_email))},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    # Delete cascade: orders → baskets → accounts → sessions → workspace members → workspaces → user
    await db.execute(delete(Order).where(Order.user_id == user_id))
    await db.execute(delete(Basket).where(Basket.user_id == user_id))
    await db.execute(delete(Account).where(Account.user_id == user_id))
    await db.execute(delete(Session).where(Session.user_id == user_id))

    from app.models.workspace import Workspace
    from app.models.workspace_member import WorkspaceMember

    await db.execute(delete(WorkspaceMember).where(WorkspaceMember.user_id == user_id))
    await db.execute(delete(Workspace).where(Workspace.owner_id == user_id))

    # Redact PII in audit logs but keep the log entries
    from sqlalchemy import update

    await db.execute(
        update(AuditLog)
        .where((AuditLog.actor_user_id == user_id) | (AuditLog.target_user_id == user_id))
        .values(ip_address=None, user_agent=None)
    )

    await db.delete(user)
    await db.commit()

    return {"detail": f"User {user_email} permanently deleted"}


@router.post("/users/{user_id}/suspend")
async def suspend_user(
    user_id: UUID,
    request: Request,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Suspend a user — sets is_active=False, records suspension info."""
    result = await db.execute(select(User).where(User.id == user_id, User.deleted_at == None))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot suspend yourself")

    if user.role == Role.SUPER_ADMIN.value:
        raise HTTPException(status_code=403, detail="Cannot suspend a super admin")

    if user.suspended_at:
        raise HTTPException(status_code=400, detail="User is already suspended")

    body = (
        await request.json()
        if request.headers.get("content-type", "").startswith("application/json")
        else {}
    )
    reason = body.get("reason", "Suspended by admin")

    user.is_active = False
    user.suspended_at = datetime.now(UTC)
    user.suspended_reason = reason
    user.suspended_by = admin.id

    # Kill all active sessions
    await db.execute(delete(Session).where(Session.user_id == user_id))

    await record_audit(
        db,
        action=AuditAction.USER_SUSPENDED,
        actor_user_id=admin.id,
        target_user_id=user_id,
        payload={"reason": reason},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()

    # Send suspension email
    try:
        from app.services.notification_service import notification_service

        await notification_service.notify_suspended(user.email, reason)
    except Exception:
        pass

    return {"detail": f"{user.email} has been suspended", "reason": reason}


@router.post("/users/{user_id}/unsuspend")
async def unsuspend_user(
    user_id: UUID,
    request: Request,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Unsuspend a user — restores is_active=True, clears suspension info."""
    result = await db.execute(select(User).where(User.id == user_id, User.deleted_at == None))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not user.suspended_at:
        raise HTTPException(status_code=400, detail="User is not suspended")

    user.is_active = True
    user.suspended_at = None
    user.suspended_reason = None
    user.suspended_by = None

    await record_audit(
        db,
        action=AuditAction.USER_UNSUSPENDED,
        actor_user_id=admin.id,
        target_user_id=user_id,
        payload={},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()

    # Send unsuspension email
    try:
        from app.services.notification_service import notification_service

        await notification_service.notify_unsuspended(user.email)
    except Exception:
        pass

    return {"detail": f"{user.email} has been unsuspended"}


@router.patch("/users/{user_id}")
async def update_user(
    user_id: UUID,
    request: Request,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update user profile fields (display_name)."""
    result = await db.execute(select(User).where(User.id == user_id, User.deleted_at == None))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    body = await request.json()
    if "display_name" in body:
        user.display_name = body["display_name"]

    await db.commit()

    return {
        "detail": f"User {user.email} updated",
        "id": str(user.id),
        "email": user.email,
        "display_name": user.display_name,
        "role": user.role,
        "is_active": user.is_active,
    }
