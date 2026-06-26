"""User-facing affiliate endpoints."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from typing import Optional

from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.models.affiliate_commission import AffiliateCommission
from app.models.affiliate_withdrawal import AffiliateWithdrawal
from app.models.fee_transaction import FeeTransaction
from app.core.enums import FeeTransactionType

router = APIRouter()

MIN_WITHDRAWAL = 10.0
MIN_TRANSFER = 5.0  # Minimum for internal transfer to Twin Grid Wallet


class WithdrawalRequest(BaseModel):
    amount: float
    method: str  # BINANCE_ID or TRC20
    wallet_address: str


class TransferRequest(BaseModel):
    amount: float  # Amount to transfer from affiliate wallet to Twin Grid wallet


@router.get("/stats")
async def get_affiliate_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get affiliate stats + wallet balance."""
    ref_count = await db.execute(
        select(func.count()).where(User.invited_by_id == current_user.id, User.deleted_at == None)
    )
    total_referrals = ref_count.scalar() or 0

    total_q = await db.execute(
        select(func.coalesce(func.sum(AffiliateCommission.commission_amount), 0)).where(
            AffiliateCommission.referrer_id == current_user.id
        )
    )
    total_earned = float(total_q.scalar() or 0)

    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    month_q = await db.execute(
        select(func.coalesce(func.sum(AffiliateCommission.commission_amount), 0)).where(
            AffiliateCommission.referrer_id == current_user.id,
            AffiliateCommission.created_at >= month_start,
        )
    )
    month_earned = float(month_q.scalar() or 0)

    # Total withdrawn (approved only)
    withdrawn_q = await db.execute(
        select(func.coalesce(func.sum(AffiliateWithdrawal.amount), 0)).where(
            AffiliateWithdrawal.user_id == current_user.id,
            AffiliateWithdrawal.status == "APPROVED",
        )
    )
    total_withdrawn = float(withdrawn_q.scalar() or 0)

    # Pending withdrawal
    pending_q = await db.execute(
        select(func.coalesce(func.sum(AffiliateWithdrawal.amount), 0)).where(
            AffiliateWithdrawal.user_id == current_user.id,
            AffiliateWithdrawal.status == "PENDING",
        )
    )
    pending_withdrawal = float(pending_q.scalar() or 0)

    return {
        "total_referrals": total_referrals,
        "total_earned": round(total_earned, 4),
        "month_earned": round(month_earned, 4),
        "affiliate_balance": round(float(current_user.affiliate_balance), 4),
        "total_withdrawn": round(total_withdrawn, 4),
        "pending_withdrawal": round(pending_withdrawal, 4),
        "invite_code": current_user.invite_code,
        "referral_link": f"https://twingridbot.com/auth/register?ref={current_user.invite_code}",
        "min_withdrawal": MIN_WITHDRAWAL,
    }


@router.get("/referrals")
async def get_referrals(
    skip: int = 0, limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get list of referred users with commission earned from each."""
    result = await db.execute(
        select(User.id, User.display_name, User.email, User.created_at).where(
            User.invited_by_id == current_user.id, User.deleted_at == None
        ).order_by(User.created_at.desc()).offset(skip).limit(limit)
    )
    referrals = result.all()

    items = []
    for r in referrals:
        earned_q = await db.execute(
            select(func.coalesce(func.sum(AffiliateCommission.commission_amount), 0)).where(
                AffiliateCommission.referrer_id == current_user.id,
                AffiliateCommission.referral_id == r.id,
            )
        )
        earned = float(earned_q.scalar() or 0)
        items.append({
            "id": str(r.id),
            "display_name": r.display_name or r.email.split("@")[0],
            "email": r.email[:3] + "***@" + r.email.split("@")[1],
            "joined_at": r.created_at.isoformat(),
            "commission_earned": round(earned, 4),
        })

    return {"items": items, "total": len(items)}


@router.get("/transactions")
async def get_transactions(
    skip: int = 0, limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get unified transaction history — commissions + withdrawals."""
    # Commissions
    comm_result = await db.execute(
        select(AffiliateCommission).where(
            AffiliateCommission.referrer_id == current_user.id
        ).order_by(AffiliateCommission.created_at.desc()).limit(200)
    )
    commissions = comm_result.scalars().all()

    # Referral names
    referral_ids = {c.referral_id for c in commissions}
    names = {}
    if referral_ids:
        name_result = await db.execute(
            select(User.id, User.display_name, User.email).where(User.id.in_(referral_ids))
        )
        for u in name_result.all():
            names[u.id] = u.display_name or u.email.split("@")[0]

    # Withdrawals
    wd_result = await db.execute(
        select(AffiliateWithdrawal).where(
            AffiliateWithdrawal.user_id == current_user.id
        ).order_by(AffiliateWithdrawal.created_at.desc()).limit(200)
    )
    withdrawals = wd_result.scalars().all()

    # Merge into unified list
    items = []
    for c in commissions:
        items.append({
            "id": str(c.id),
            "type": "COMMISSION",
            "amount": round(float(c.commission_amount), 4),
            "description": f"{float(c.commission_pct):.2f}% on ${float(c.fee_amount):.2f} fee from {names.get(c.referral_id, 'referral')}",
            "status": "COMPLETED",
            "created_at": c.created_at.isoformat(),
        })
    for w in withdrawals:
        if w.method == "TWIN_GRID_WALLET":
            description = "Transferred to Twin Grid Wallet"
            tx_type = "TRANSFER"
        else:
            addr = w.wallet_address
            description = f"{w.method} \u2192 {addr[:8]}...{addr[-4:] if len(addr) > 12 else addr}"
            tx_type = "WITHDRAWAL"
        items.append({
            "id": str(w.id),
            "type": tx_type,
            "method": w.method,
            "amount": -round(float(w.amount), 4),
            "description": description,
            "status": w.status,
            "reject_reason": w.reject_reason,
            "created_at": w.created_at.isoformat(),
        })

    # Sort by date desc
    items.sort(key=lambda x: x["created_at"], reverse=True)
    return {"items": items[skip:skip + limit]}


@router.post("/withdraw")
async def request_withdrawal(
    payload: WithdrawalRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Request affiliate commission withdrawal."""
    if payload.method not in ("BINANCE_ID", "TRC20"):
        raise HTTPException(status_code=400, detail="Method must be BINANCE_ID or TRC20")
    if not payload.wallet_address or len(payload.wallet_address.strip()) < 3:
        raise HTTPException(status_code=400, detail="Invalid wallet address")
    if payload.amount < MIN_WITHDRAWAL:
        raise HTTPException(status_code=400, detail=f"Minimum withdrawal is ${MIN_WITHDRAWAL}")

    # Check for pending withdrawal
    pending = await db.execute(
        select(func.count()).where(
            AffiliateWithdrawal.user_id == current_user.id,
            AffiliateWithdrawal.status == "PENDING",
        )
    )
    if (pending.scalar() or 0) > 0:
        raise HTTPException(status_code=400, detail="You already have a pending withdrawal")

    balance = float(current_user.affiliate_balance)
    if payload.amount > balance:
        raise HTTPException(status_code=400, detail=f"Insufficient balance. Available: ${balance:.2f}")

    # Deduct from affiliate balance
    current_user.affiliate_balance = float(balance - payload.amount)

    withdrawal = AffiliateWithdrawal(
        user_id=current_user.id,
        amount=payload.amount,
        method=payload.method,
        wallet_address=payload.wallet_address.strip(),
    )
    db.add(withdrawal)
    await db.commit()

    return {"detail": f"Withdrawal of ${payload.amount:.2f} requested", "id": str(withdrawal.id)}


@router.get("/withdrawals")
async def get_withdrawals(
    skip: int = 0, limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get withdrawal history."""
    result = await db.execute(
        select(AffiliateWithdrawal).where(
            AffiliateWithdrawal.user_id == current_user.id
        ).order_by(AffiliateWithdrawal.created_at.desc()).offset(skip).limit(limit)
    )
    withdrawals = result.scalars().all()
    return {
        "items": [
            {
                "id": str(w.id),
                "amount": round(float(w.amount), 4),
                "method": w.method,
                "wallet_address": w.wallet_address,
                "status": w.status,
                "tx_hash": w.tx_hash,
                "reject_reason": w.reject_reason,
                "created_at": w.created_at.isoformat(),
            }
            for w in withdrawals
        ]
    }


@router.post("/transfer-to-wallet")
async def transfer_to_twin_grid_wallet(
    payload: TransferRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Instantly transfer affiliate commission balance to Twin Grid Wallet.

    - No admin approval needed (internal transfer only)
    - Minimum transfer: $5
    - Creates AffiliateWithdrawal(method=TWIN_GRID_WALLET) for affiliate history
    - Creates FeeTransaction(type=AFFILIATE_TRANSFER) for Twin Grid wallet history
    """
    if payload.amount < MIN_TRANSFER:
        raise HTTPException(
            status_code=400,
            detail=f"Minimum transfer amount is ${MIN_TRANSFER:.2f}"
        )

    affiliate_balance = float(current_user.affiliate_balance)
    if payload.amount > affiliate_balance:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient affiliate balance. Available: ${affiliate_balance:.2f}"
        )

    amount = round(payload.amount, 8)
    twin_grid_balance_before = float(current_user.twin_grid_balance)

    # Atomically update both balances
    current_user.affiliate_balance = round(affiliate_balance - amount, 8)
    current_user.twin_grid_balance = round(twin_grid_balance_before + amount, 8)

    # Record in affiliate history as an approved withdrawal (TWIN_GRID_WALLET method)
    withdrawal = AffiliateWithdrawal(
        user_id=current_user.id,
        amount=amount,
        method="TWIN_GRID_WALLET",
        wallet_address="twin_grid_wallet",
        status="APPROVED",
    )
    db.add(withdrawal)

    # Record in Twin Grid Wallet transaction history
    fee_tx = FeeTransaction(
        user_id=current_user.id,
        type=FeeTransactionType.AFFILIATE_TRANSFER,
        amount=amount,  # positive = credit
        balance_before=twin_grid_balance_before,
        balance_after=float(current_user.twin_grid_balance),
        note=f"Transferred from Affiliate Wallet",
    )
    db.add(fee_tx)

    await db.commit()

    return {
        "detail": f"${amount:.2f} transferred to your Twin Grid Wallet",
        "affiliate_balance": round(float(current_user.affiliate_balance), 4),
        "twin_grid_balance": round(float(current_user.twin_grid_balance), 4),
        "transaction_id": str(fee_tx.id),
    }
