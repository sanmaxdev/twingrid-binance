"""Admin fee management endpoints — settings, deposits, balance adjustments."""

from datetime import datetime, timezone
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.api.deps import get_db, require_admin
from app.core.rate_limit import get_client_ip
from app.core.enums import AuditAction, DepositStatus, FeeTransactionType
from app.models.user import User
from app.models.fee_transaction import FeeTransaction
from app.models.deposit_request import DepositRequest
from app.models.platform_settings import PlatformSettings
from app.services.fee_service import (
    credit_deposit, admin_adjust_balance, get_fee_setting
)
from app.services.audit_service import record_audit
from app.schemas.fee import (
    FeeSettingsUpdateRequest, BalanceAdjustRequest, UserFeeOverrideRequest,
)

router = APIRouter()


# ── Fee Settings ──

@router.get("/settings")
async def get_fee_settings(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get current fee system configuration."""
    fee_pct = await get_fee_setting(db, "twin_grid_fee_percentage", "20.0")
    deposit_addr = await get_fee_setting(db, "twin_grid_deposit_address", "")
    min_deposit = await get_fee_setting(db, "twin_grid_min_deposit", "10.0")
    multiplier = await get_fee_setting(db, "twin_grid_min_balance_multiplier", "2.0")
    fee_enabled = await get_fee_setting(db, "twin_grid_fee_enabled", "true")

    return {
        "fee_percentage": float(str(fee_pct)),
        "deposit_address": str(deposit_addr),
        "min_deposit": float(str(min_deposit)),
        "min_balance_multiplier": float(str(multiplier)),
        "fee_enabled": str(fee_enabled).lower() in ("true", "1", "yes"),
    }


@router.put("/settings")
async def update_fee_settings(
    body: FeeSettingsUpdateRequest,
    request: Request,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update fee system settings."""
    mapping = {
        "fee_percentage": ("twin_grid_fee_percentage", body.fee_percentage),
        "deposit_address": ("twin_grid_deposit_address", body.deposit_address),
        "min_deposit": ("twin_grid_min_deposit", body.min_deposit),
        "min_balance_multiplier": ("twin_grid_min_balance_multiplier", body.min_balance_multiplier),
        "fee_enabled": ("twin_grid_fee_enabled", body.fee_enabled),
    }

    changes = {}
    for field_name, (key, value) in mapping.items():
        if value is not None:
            result = await db.execute(
                select(PlatformSettings).where(PlatformSettings.key == key)
            )
            setting = result.scalar_one_or_none()
            if setting:
                old_val = setting.value
                if isinstance(value, bool):
                    setting.value = str(value).lower()
                elif isinstance(value, str):
                    setting.value = f'"{value}"' if key == "twin_grid_deposit_address" else str(value)
                else:
                    setting.value = str(value)
                setting.updated_at = datetime.now(timezone.utc)
                setting.updated_by = admin.id
                changes[field_name] = {"old": old_val, "new": setting.value}

    await record_audit(
        db, action=AuditAction.FEE_SETTINGS_CHANGED,
        actor_user_id=admin.id,
        payload=changes,
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()

    return {"detail": "Fee settings updated", "changes": changes}


# ── Deposit Management ──

@router.get("/deposits")
async def list_deposits(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    status: str = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
):
    """List all deposit requests across users."""
    stmt = select(DepositRequest)
    if status:
        stmt = stmt.where(DepositRequest.status == status)

    count_result = await db.execute(
        select(func.count()).select_from(stmt.subquery())
    )
    total = count_result.scalar()

    stmt = stmt.order_by(DepositRequest.created_at.desc())
    stmt = stmt.offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    deposits = result.scalars().all()

    # Fetch user emails for display
    user_ids = list(set(d.user_id for d in deposits))
    users_result = await db.execute(select(User).where(User.id.in_(user_ids)))
    user_map = {u.id: u.email for u in users_result.scalars().all()}

    return {
        "items": [
            {
                "id": str(d.id),
                "user_id": str(d.user_id),
                "user_email": user_map.get(d.user_id, "Unknown"),
                "amount": float(d.amount),
                "tx_hash": d.tx_hash,
                "status": d.status,
                "reviewed_by": str(d.reviewed_by) if d.reviewed_by else None,
                "reviewed_at": d.reviewed_at.isoformat() if d.reviewed_at else None,
                "reject_reason": d.reject_reason,
                "created_at": d.created_at.isoformat() if d.created_at else None,
            }
            for d in deposits
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.post("/deposits/{deposit_id}/approve")
async def approve_deposit(
    deposit_id: UUID,
    request: Request,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Approve a pending deposit — credits user balance."""
    result = await db.execute(
        select(DepositRequest).where(DepositRequest.id == deposit_id)
    )
    deposit = result.scalar_one_or_none()
    if not deposit:
        raise HTTPException(status_code=404, detail="Deposit not found")

    if deposit.status != DepositStatus.PENDING:
        raise HTTPException(status_code=400, detail=f"Deposit is already {deposit.status}")

    # Credit the user's balance
    fee_tx = await credit_deposit(
        db, deposit.user_id, float(deposit.amount), admin.id
    )

    deposit.status = DepositStatus.COMPLETED
    deposit.reviewed_by = admin.id
    deposit.reviewed_at = datetime.now(timezone.utc)
    deposit.fee_transaction_id = fee_tx.id

    await record_audit(
        db, action=AuditAction.DEPOSIT_APPROVED,
        actor_user_id=admin.id,
        target_user_id=deposit.user_id,
        payload={"deposit_id": str(deposit_id), "amount": float(deposit.amount)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()

    return {
        "detail": f"Deposit ${float(deposit.amount):.2f} approved and credited",
        "new_balance": float(fee_tx.balance_after),
    }


@router.post("/deposits/{deposit_id}/reject")
async def reject_deposit(
    deposit_id: UUID,
    request: Request,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    reason: str = Query(None),
):
    """Reject a pending deposit."""
    result = await db.execute(
        select(DepositRequest).where(DepositRequest.id == deposit_id)
    )
    deposit = result.scalar_one_or_none()
    if not deposit:
        raise HTTPException(status_code=404, detail="Deposit not found")

    if deposit.status != DepositStatus.PENDING:
        raise HTTPException(status_code=400, detail=f"Deposit is already {deposit.status}")

    deposit.status = DepositStatus.REJECTED
    deposit.reviewed_by = admin.id
    deposit.reviewed_at = datetime.now(timezone.utc)
    deposit.reject_reason = reason or "Rejected by admin"

    await record_audit(
        db, action=AuditAction.DEPOSIT_REJECTED,
        actor_user_id=admin.id,
        target_user_id=deposit.user_id,
        payload={
            "deposit_id": str(deposit_id),
            "amount": float(deposit.amount),
            "reason": deposit.reject_reason,
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()

    return {"detail": f"Deposit rejected: {deposit.reject_reason}"}


# ── User Balance Management ──

@router.get("/users/{user_id}/balance")
async def get_user_balance(
    user_id: UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """View a user's Twin Grid Balance and transaction summary."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Total fees collected from this user
    total_fees = (await db.execute(
        select(func.coalesce(func.sum(FeeTransaction.amount), 0)).where(
            FeeTransaction.user_id == user_id,
            FeeTransaction.type == FeeTransactionType.FEE_DEDUCTION,
        )
    )).scalar()

    # Total deposited
    total_deposited = (await db.execute(
        select(func.coalesce(func.sum(FeeTransaction.amount), 0)).where(
            FeeTransaction.user_id == user_id,
            FeeTransaction.type == FeeTransactionType.DEPOSIT,
        )
    )).scalar()

    return {
        "user_id": str(user.id),
        "email": user.email,
        "balance": float(user.twin_grid_balance),
        "fee_percentage_override": float(user.fee_percentage_override) if user.fee_percentage_override else None,
        "total_deposited": float(total_deposited),
        "total_fees_paid": abs(float(total_fees)),
    }


@router.post("/users/{user_id}/adjust")
async def adjust_user_balance(
    user_id: UUID,
    body: BalanceAdjustRequest,
    request: Request,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin manual balance add/remove."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    fee_tx = await admin_adjust_balance(
        db, user_id, body.amount, body.note, admin.id
    )

    await record_audit(
        db, action=AuditAction.BALANCE_ADJUSTED,
        actor_user_id=admin.id,
        target_user_id=user_id,
        payload={
            "amount": body.amount,
            "note": body.note,
            "balance_before": float(fee_tx.balance_before),
            "balance_after": float(fee_tx.balance_after),
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()

    return {
        "detail": f"Balance adjusted by ${body.amount:+.2f}",
        "new_balance": float(fee_tx.balance_after),
    }


@router.put("/users/{user_id}/fee-override")
async def set_user_fee_override(
    user_id: UUID,
    body: UserFeeOverrideRequest,
    request: Request,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Set or clear per-user fee percentage override."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    old_val = float(user.fee_percentage_override) if user.fee_percentage_override else None
    user.fee_percentage_override = body.fee_percentage_override

    await record_audit(
        db, action=AuditAction.FEE_SETTINGS_CHANGED,
        actor_user_id=admin.id,
        target_user_id=user_id,
        payload={
            "old_fee_override": old_val,
            "new_fee_override": body.fee_percentage_override,
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()

    return {
        "detail": f"Fee override {'set to ' + str(body.fee_percentage_override) + '%' if body.fee_percentage_override is not None else 'cleared (reverting to plan default rate)'}",
        "fee_percentage_override": body.fee_percentage_override,
    }


# ── Fee Dashboard ──

@router.get("/dashboard")
async def get_fee_dashboard(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Fee revenue overview for admin dashboard."""
    # Total fees collected (sum of all FEE_DEDUCTION — they're negative amounts)
    total_fees = (await db.execute(
        select(func.coalesce(func.sum(FeeTransaction.amount), 0)).where(
            FeeTransaction.type == FeeTransactionType.FEE_DEDUCTION,
        )
    )).scalar()

    # Total deposits
    total_deposits = (await db.execute(
        select(func.coalesce(func.sum(FeeTransaction.amount), 0)).where(
            FeeTransaction.type == FeeTransactionType.DEPOSIT,
        )
    )).scalar()

    # Pending deposits count + amount
    pending_stats = (await db.execute(
        select(
            func.count(),
            func.coalesce(func.sum(DepositRequest.amount), 0)
        ).where(DepositRequest.status == DepositStatus.PENDING)
    )).one()

    # Users with positive balance
    active_users = (await db.execute(
        select(func.count()).select_from(User).where(
            User.twin_grid_balance > 0,
            User.deleted_at == None,
        )
    )).scalar()

    # Total negative balance (debt owed)
    negative_sum = (await db.execute(
        select(func.coalesce(func.sum(User.twin_grid_balance), 0)).where(
            User.twin_grid_balance < 0,
            User.deleted_at == None,
        )
    )).scalar()

    return {
        "total_fees_collected": abs(float(total_fees)),
        "total_deposits": float(total_deposits),
        "pending_deposit_count": pending_stats[0],
        "pending_deposit_amount": float(pending_stats[1]),
        "active_users_with_balance": active_users,
        "total_negative_balances": abs(float(negative_sum)),
    }


@router.get("/transactions")
async def list_all_transactions(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    type: str = Query(None),
    user_id: UUID = Query(None),
):
    """All fee transactions across the platform."""
    stmt = select(FeeTransaction)
    if type:
        stmt = stmt.where(FeeTransaction.type == type)
    if user_id:
        stmt = stmt.where(FeeTransaction.user_id == user_id)

    count_result = await db.execute(
        select(func.count()).select_from(stmt.subquery())
    )
    total = count_result.scalar()

    stmt = stmt.order_by(FeeTransaction.created_at.desc())
    stmt = stmt.offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    transactions = result.scalars().all()

    # Fetch user emails
    user_ids = list(set(t.user_id for t in transactions))
    users_result = await db.execute(select(User).where(User.id.in_(user_ids))) if user_ids else None
    user_map = {u.id: u.email for u in (users_result.scalars().all() if users_result else [])}

    return {
        "items": [
            {
                "id": str(t.id),
                "user_id": str(t.user_id),
                "user_email": user_map.get(t.user_id, "Unknown"),
                "basket_id": str(t.basket_id) if t.basket_id else None,
                "type": t.type,
                "amount": float(t.amount),
                "balance_before": float(t.balance_before),
                "balance_after": float(t.balance_after),
                "fee_percentage": float(t.fee_percentage) if t.fee_percentage else None,
                "basket_pnl": float(t.basket_pnl) if t.basket_pnl else None,
                "note": t.note,
                "created_at": t.created_at.isoformat() if t.created_at else None,
                "created_by": str(t.created_by) if t.created_by else None,
            }
            for t in transactions
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
    }
