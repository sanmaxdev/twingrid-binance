"""Admin affiliate management endpoints."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_admin
from app.models.affiliate_commission import AffiliateCommission
from app.models.affiliate_withdrawal import AffiliateWithdrawal
from app.models.platform_settings import PlatformSettings
from app.models.user import User

router = APIRouter()


class AffiliateConfigUpdate(BaseModel):
    enabled: bool = True
    default_commission_pct: float = 10.0


class UserOverrideUpdate(BaseModel):
    commission_pct: float | None = None


class WithdrawalAction(BaseModel):
    tx_hash: str | None = None
    reject_reason: str | None = None
    admin_note: str | None = None


@router.get("/config")
async def get_config(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PlatformSettings).where(PlatformSettings.key == "affiliate_config")
    )
    setting = result.scalar_one_or_none()
    if setting:
        return setting.value
    return {"enabled": True, "default_commission_pct": 10.0}


@router.put("/config")
async def update_config(
    payload: AffiliateConfigUpdate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PlatformSettings).where(PlatformSettings.key == "affiliate_config")
    )
    setting = result.scalar_one_or_none()
    value = {"enabled": payload.enabled, "default_commission_pct": payload.default_commission_pct}
    if setting:
        setting.value = value
        setting.updated_by = admin.id
    else:
        db.add(PlatformSettings(key="affiliate_config", value=value, updated_by=admin.id))
    await db.commit()
    return value


@router.get("/overview")
async def get_overview(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    total_q = await db.execute(
        select(func.coalesce(func.sum(AffiliateCommission.commission_amount), 0))
    )
    total_paid = float(total_q.scalar() or 0)

    active_q = await db.execute(select(func.count(func.distinct(AffiliateCommission.referrer_id))))
    active_affiliates = active_q.scalar() or 0

    ref_q = await db.execute(
        select(func.count()).where(User.invited_by_id != None, User.deleted_at == None)
    )
    total_referrals = ref_q.scalar() or 0

    now = datetime.now(UTC)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    month_q = await db.execute(
        select(func.coalesce(func.sum(AffiliateCommission.commission_amount), 0)).where(
            AffiliateCommission.created_at >= month_start
        )
    )
    month_paid = float(month_q.scalar() or 0)

    # Pending withdrawals
    pending_q = await db.execute(
        select(func.count(), func.coalesce(func.sum(AffiliateWithdrawal.amount), 0)).where(
            AffiliateWithdrawal.status == "PENDING"
        )
    )
    pending = pending_q.one()

    # Total withdrawn
    total_wd_q = await db.execute(
        select(func.coalesce(func.sum(AffiliateWithdrawal.amount), 0)).where(
            AffiliateWithdrawal.status == "APPROVED"
        )
    )
    total_withdrawn = float(total_wd_q.scalar() or 0)

    return {
        "total_paid": round(total_paid, 4),
        "active_affiliates": active_affiliates,
        "total_referrals": total_referrals,
        "month_paid": round(month_paid, 4),
        "pending_withdrawals": pending[0] or 0,
        "pending_withdrawal_amount": round(float(pending[1] or 0), 4),
        "total_withdrawn": round(total_withdrawn, 4),
    }


@router.get("/users")
async def get_affiliate_users(
    skip: int = 0,
    limit: int = 100,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User)
        .where(User.deleted_at == None)
        .order_by(User.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    users = result.scalars().all()

    items = []
    for u in users:
        ref_q = await db.execute(
            select(func.count()).where(User.invited_by_id == u.id, User.deleted_at == None)
        )
        referral_count = ref_q.scalar() or 0

        earned_q = await db.execute(
            select(func.coalesce(func.sum(AffiliateCommission.commission_amount), 0)).where(
                AffiliateCommission.referrer_id == u.id
            )
        )
        total_earned = float(earned_q.scalar() or 0)

        items.append(
            {
                "id": str(u.id),
                "email": u.email,
                "display_name": u.display_name,
                "referral_count": referral_count,
                "total_earned": round(total_earned, 4),
                "affiliate_balance": round(float(u.affiliate_balance), 4),
                "commission_override": float(u.affiliate_commission_override)
                if u.affiliate_commission_override is not None
                else None,
                "invite_code": u.invite_code,
            }
        )

    return {"items": items}


@router.put("/users/{user_id}/override")
async def set_user_override(
    user_id: str,
    payload: UserOverrideUpdate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    import uuid as uuid_mod

    result = await db.execute(select(User).where(User.id == uuid_mod.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.affiliate_commission_override = payload.commission_pct
    await db.commit()
    return {"detail": "Updated", "commission_pct": payload.commission_pct}


# ── Withdrawal Management ──


@router.get("/withdrawals")
async def list_withdrawals(
    status: str | None = None,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(AffiliateWithdrawal).order_by(AffiliateWithdrawal.created_at.desc())
    if status:
        stmt = stmt.where(AffiliateWithdrawal.status == status.upper())
    result = await db.execute(stmt.limit(200))
    withdrawals = result.scalars().all()

    # User emails
    user_ids = list({w.user_id for w in withdrawals})
    user_map = {}
    if user_ids:
        users_r = await db.execute(select(User).where(User.id.in_(user_ids)))
        user_map = {
            u.id: {"email": u.email, "name": u.display_name} for u in users_r.scalars().all()
        }

    return {
        "items": [
            {
                "id": str(w.id),
                "user_id": str(w.user_id),
                "user_email": user_map.get(w.user_id, {}).get("email", ""),
                "user_name": user_map.get(w.user_id, {}).get("name", ""),
                "amount": round(float(w.amount), 4),
                "method": w.method,
                "wallet_address": w.wallet_address,
                "status": w.status,
                "tx_hash": w.tx_hash,
                "reject_reason": w.reject_reason,
                "admin_note": w.admin_note,
                "created_at": w.created_at.isoformat(),
                "reviewed_at": w.reviewed_at.isoformat() if w.reviewed_at else None,
            }
            for w in withdrawals
        ]
    }


@router.post("/withdrawals/{withdrawal_id}/approve")
async def approve_withdrawal(
    withdrawal_id: str,
    payload: WithdrawalAction,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    import uuid as uuid_mod

    result = await db.execute(
        select(AffiliateWithdrawal).where(AffiliateWithdrawal.id == uuid_mod.UUID(withdrawal_id))
    )
    wd = result.scalar_one_or_none()
    if not wd:
        raise HTTPException(status_code=404, detail="Withdrawal not found")
    if wd.status != "PENDING":
        raise HTTPException(status_code=400, detail=f"Withdrawal is already {wd.status}")

    wd.status = "APPROVED"
    wd.reviewed_by = admin.id
    wd.reviewed_at = datetime.now(UTC)
    wd.tx_hash = payload.tx_hash
    wd.admin_note = payload.admin_note
    await db.commit()
    return {"detail": f"Withdrawal ${float(wd.amount):.2f} approved"}


@router.post("/withdrawals/{withdrawal_id}/reject")
async def reject_withdrawal(
    withdrawal_id: str,
    payload: WithdrawalAction,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    import uuid as uuid_mod

    result = await db.execute(
        select(AffiliateWithdrawal).where(AffiliateWithdrawal.id == uuid_mod.UUID(withdrawal_id))
    )
    wd = result.scalar_one_or_none()
    if not wd:
        raise HTTPException(status_code=404, detail="Withdrawal not found")
    if wd.status != "PENDING":
        raise HTTPException(status_code=400, detail=f"Withdrawal is already {wd.status}")

    # Refund affiliate balance
    user_result = await db.execute(select(User).where(User.id == wd.user_id))
    user = user_result.scalar_one_or_none()
    if user:
        user.affiliate_balance = float(user.affiliate_balance) + float(wd.amount)

    wd.status = "REJECTED"
    wd.reviewed_by = admin.id
    wd.reviewed_at = datetime.now(UTC)
    wd.reject_reason = payload.reject_reason or "Rejected by admin"
    wd.admin_note = payload.admin_note
    await db.commit()
    return {"detail": f"Withdrawal rejected — ${float(wd.amount):.2f} refunded to affiliate wallet"}
