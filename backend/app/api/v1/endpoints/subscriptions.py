"""
User Subscription Endpoints
===========================
GET  /subscriptions/plans        - List all plans with prices & features
GET  /subscriptions/current      - Get user's current subscription & status
POST /subscriptions/subscribe    - Subscribe/upgrade to a plan
POST /subscriptions/cancel       - Cancel subscription (at period end)
GET  /subscriptions/invoices     - List billing history
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.subscription_invoice import SubscriptionInvoice
from app.models.user import User
from app.services.subscription_service import (
    cancel_subscription,
    check_backtest_access,
    get_all_plans,
    get_user_plan,
    get_user_subscription,
    subscribe,
)

router = APIRouter()


@router.get("/plans")
async def list_plans(db: AsyncSession = Depends(get_db)):
    """Public endpoint — list all active subscription plans."""
    plans = await get_all_plans(db)
    return [
        {
            "id": p.id,
            "name": p.name,
            "price_usd": float(p.price_usd),
            "max_accounts": p.max_accounts,
            "default_fee_pct": float(p.default_fee_pct),
            "daily_backtest_limit": p.daily_backtest_limit,
            "max_backtest_days": p.max_backtest_days,
            "ai_builder_access": p.ai_builder_access,
            "description": p.description,
            "sort_order": p.sort_order,
        }
        for p in plans
    ]


@router.get("/current")
async def get_current_subscription(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return current subscription state, effective plan, and feature access."""

    sub = await get_user_subscription(db, current_user.id)
    plan = await get_user_plan(db, current_user.id)
    backtest = await check_backtest_access(db, current_user.id)

    return {
        "subscription": {
            "id": str(sub.id),
            "plan_id": sub.plan_id,
            "status": sub.status,
            "started_at": sub.started_at.isoformat() if sub.started_at else None,
            "current_period_start": sub.current_period_start.isoformat()
            if sub.current_period_start
            else None,
            "current_period_end": sub.current_period_end.isoformat()
            if sub.current_period_end
            else None,
            "grace_period_end": sub.grace_period_end.isoformat() if sub.grace_period_end else None,
            "cancel_at_period_end": sub.cancel_at_period_end,
            "cancelled_at": sub.cancelled_at.isoformat() if sub.cancelled_at else None,
        },
        "effective_plan": {
            "id": plan.id,
            "name": plan.name,
            "price_usd": float(plan.price_usd),
            "max_accounts": plan.max_accounts,
            "default_fee_pct": float(plan.default_fee_pct),
            "daily_backtest_limit": plan.daily_backtest_limit,
            "max_backtest_days": plan.max_backtest_days,
            "ai_builder_access": plan.ai_builder_access,
        },
        "wallet_balance": float(current_user.twin_grid_balance),
        "backtest_access": backtest,
    }


@router.post("/subscribe")
async def subscribe_to_plan(
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Subscribe or upgrade/downgrade to a plan."""
    plan_id = body.get("plan_id", "").strip().lower()
    if not plan_id:
        raise HTTPException(400, "plan_id is required")

    result = await subscribe(db, current_user.id, plan_id, actor_id=current_user.id)
    if not result["success"]:
        raise HTTPException(402, detail=result["message"])
    return result


@router.post("/cancel")
async def cancel_plan(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cancel subscription at end of current period."""
    result = await cancel_subscription(db, current_user.id)
    if not result.get("success"):
        raise HTTPException(400, detail=result.get("message", "Cannot cancel"))
    return result


@router.get("/invoices")
async def list_invoices(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List billing invoices for the current user."""
    result = await db.execute(
        select(SubscriptionInvoice)
        .where(SubscriptionInvoice.user_id == current_user.id)
        .order_by(desc(SubscriptionInvoice.created_at))
        .limit(50)
    )
    invoices = result.scalars().all()
    return [
        {
            "id": str(inv.id),
            "plan_id": inv.plan_id,
            "amount": float(inv.amount),
            "status": inv.status,
            "billing_period_start": inv.billing_period_start.isoformat(),
            "billing_period_end": inv.billing_period_end.isoformat(),
            "failure_reason": inv.failure_reason,
            "created_at": inv.created_at.isoformat(),
        }
        for inv in invoices
    ]
