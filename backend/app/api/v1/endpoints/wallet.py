"""User wallet endpoints — balance, deposits, transaction history."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.core.enums import DepositStatus, FeeTransactionType
from app.models.deposit_request import DepositRequest
from app.models.fee_transaction import FeeTransaction
from app.models.subscription_plan import SubscriptionPlan
from app.models.user import User
from app.models.user_subscription import UserSubscription
from app.schemas.fee import (
    DepositSubmitRequest,
)
from app.services.fee_service import (
    calculate_minimum_balance,
    get_fee_percentage,
    get_fee_setting,
    is_fee_enabled,
)

router = APIRouter()


@router.get("/balance")
async def get_wallet_balance(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get user's Twin Grid Balance and minimum required balance."""
    fee_enabled = await is_fee_enabled(db)
    fee_pct = float(await get_fee_percentage(db, current_user.id))
    balance = float(current_user.twin_grid_balance)

    # Calculate minimum from all active accounts (running or paused, not deleted)
    from app.core.enums import AccountStatus
    from app.models.account import Account

    result = await db.execute(
        select(Account).where(
            Account.user_id == current_user.id,
            Account.status.in_([AccountStatus.RUNNING, AccountStatus.PAUSED]),
            Account.deleted_at == None,
        )
    )
    active_accounts = result.scalars().all()

    min_required = 0.0
    for acc in active_accounts:
        acc_min = float(await calculate_minimum_balance(db, current_user.id, acc.id))
        min_required = max(min_required, acc_min)

    # Admin override: fee_percentage_override is ONLY set by admin now.
    # Any non-None value means admin has explicitly customised this user's rate.
    admin_override = False
    override_note = None
    if current_user.fee_percentage_override is not None:
        try:
            # Get plan's natural default for context display
            sub_result = await db.execute(
                select(UserSubscription).where(UserSubscription.user_id == current_user.id)
            )
            user_sub = sub_result.scalar_one_or_none()
            plan_default_fee: float | None = None
            if user_sub and user_sub.plan_id != "free":
                plan_result = await db.execute(
                    select(SubscriptionPlan).where(SubscriptionPlan.id == user_sub.plan_id)
                )
                plan_obj = plan_result.scalar_one_or_none()
                if plan_obj:
                    plan_default_fee = float(plan_obj.default_fee_pct)

            admin_override = True
            plan_info = (
                f" (your {user_sub.plan_id.title()} plan rate is {plan_default_fee}%)"
                if plan_default_fee is not None
                else ""
            )
            override_note = f"Your profit share fee has been customised to {fee_pct}% by an administrator{plan_info}."
        except Exception:
            admin_override = True
            override_note = (
                f"Your profit share fee has been customised to {fee_pct}% by an administrator."
            )

    return {
        "balance": balance,
        "minimum_required": min_required,
        "is_sufficient": balance >= min_required,
        "fee_percentage": fee_pct,
        "fee_enabled": fee_enabled,
        "admin_override": admin_override,
        "override_note": override_note,
    }


@router.get("/summary")
async def get_wallet_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Dashboard summary — total deposited, total fees, pending deposits."""
    balance = float(current_user.twin_grid_balance)
    fee_pct = float(await get_fee_percentage(db, current_user.id))

    # Total deposited
    total_deposited = (
        await db.execute(
            select(func.coalesce(func.sum(FeeTransaction.amount), 0)).where(
                FeeTransaction.user_id == current_user.id,
                FeeTransaction.type == FeeTransactionType.DEPOSIT,
            )
        )
    ).scalar()

    # Total fees paid (absolute value of deductions)
    total_fees = (
        await db.execute(
            select(func.coalesce(func.sum(FeeTransaction.amount), 0)).where(
                FeeTransaction.user_id == current_user.id,
                FeeTransaction.type == FeeTransactionType.FEE_DEDUCTION,
            )
        )
    ).scalar()

    # Pending deposits count
    pending_count = (
        await db.execute(
            select(func.count())
            .select_from(DepositRequest)
            .where(
                DepositRequest.user_id == current_user.id,
                DepositRequest.status == DepositStatus.PENDING,
            )
        )
    ).scalar()

    return {
        "balance": balance,
        "total_deposited": float(total_deposited),
        "total_fees_paid": abs(float(total_fees)),
        "pending_deposits": pending_count,
        "fee_percentage": fee_pct,
    }


@router.get("/transactions")
async def get_transactions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    type: FeeTransactionType | None = Query(None),
):
    """Paginated fee transaction history."""
    stmt = select(FeeTransaction).where(FeeTransaction.user_id == current_user.id)
    if type is not None:
        stmt = stmt.where(FeeTransaction.type == type)
    else:
        # Exclude affiliate commissions from the wallet view — they belong to /affiliates
        stmt = stmt.where(FeeTransaction.type != FeeTransactionType.AFFILIATE_COMMISSION)

    count_result = await db.execute(select(func.count()).select_from(stmt.subquery()))
    total = count_result.scalar()

    stmt = stmt.order_by(FeeTransaction.created_at.desc())
    stmt = stmt.offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    transactions = result.scalars().all()

    return {
        "items": [
            {
                "id": str(t.id),
                "type": t.type,
                "amount": float(t.amount),
                "balance_before": float(t.balance_before),
                "balance_after": float(t.balance_after),
                "fee_percentage": float(t.fee_percentage) if t.fee_percentage else None,
                "basket_pnl": float(t.basket_pnl) if t.basket_pnl else None,
                "basket_id": str(t.basket_id) if t.basket_id else None,
                "note": t.note,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }
            for t in transactions
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.post("/deposit")
async def submit_deposit(
    body: DepositSubmitRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Submit a deposit request (USDT TRC-20)."""
    # Check minimum deposit
    min_deposit_raw = await get_fee_setting(db, "twin_grid_min_deposit", "10.0")
    min_deposit = float(str(min_deposit_raw))

    if body.amount < min_deposit:
        raise HTTPException(status_code=400, detail=f"Minimum deposit is ${min_deposit:.2f} USDT")

    # Check for duplicate TX hash
    existing = (
        await db.execute(select(DepositRequest).where(DepositRequest.tx_hash == body.tx_hash))
    ).scalar_one_or_none()

    if existing:
        raise HTTPException(
            status_code=400, detail="This transaction hash has already been submitted"
        )

    deposit = DepositRequest(
        user_id=current_user.id,
        amount=body.amount,
        tx_hash=body.tx_hash.strip(),
        status=DepositStatus.PENDING,
    )
    db.add(deposit)
    await db.commit()

    return {
        "id": str(deposit.id),
        "amount": float(deposit.amount),
        "tx_hash": deposit.tx_hash,
        "status": deposit.status,
        "message": "Deposit submitted. Awaiting admin confirmation.",
    }


@router.get("/deposits")
async def get_deposits(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
):
    """List user's deposit requests with status."""
    stmt = select(DepositRequest).where(DepositRequest.user_id == current_user.id)

    count_result = await db.execute(select(func.count()).select_from(stmt.subquery()))
    total = count_result.scalar()

    stmt = stmt.order_by(DepositRequest.created_at.desc())
    stmt = stmt.offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(stmt)
    deposits = result.scalars().all()

    return {
        "items": [
            {
                "id": str(d.id),
                "amount": float(d.amount),
                "tx_hash": d.tx_hash,
                "status": d.status,
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


@router.get("/deposit-info")
async def get_deposit_info(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get deposit address and minimum deposit info."""
    deposit_address = await get_fee_setting(
        db, "twin_grid_deposit_address", "TRR4tBqskmJLRQHcJXAGGJmf54pSBJBQyr"
    )
    min_deposit = await get_fee_setting(db, "twin_grid_min_deposit", "10.0")

    return {
        "deposit_address": str(deposit_address),
        "network": "TRC-20 (Tron)",
        "currency": "USDT",
        "min_deposit": float(str(min_deposit)),
    }
