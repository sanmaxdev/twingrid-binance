"""
Admin: Subscription Plan Management + User Subscription Overview
================================================================
GET  /admin/subscription-plans              - List all plans
PATCH /admin/subscription-plans/{plan_id}   - Update plan config
GET  /admin/subscriptions                   - All user subscriptions (paginated)
GET  /admin/subscriptions/revenue           - Revenue summary
PATCH /admin/subscriptions/{user_id}        - Override user's plan
"""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_admin, require_super_admin
from app.models.subscription_invoice import SubscriptionInvoice
from app.models.subscription_plan import SubscriptionPlan
from app.models.user import User
from app.models.user_subscription import UserSubscription
from app.services.subscription_service import get_all_plans, get_plan

router = APIRouter()


# ── Plan Management (Super Admin only) ───────────────────────────────────────


@router.get("/plans")
async def admin_list_plans(
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
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
            "is_active": p.is_active,
            "sort_order": p.sort_order,
            "description": p.description,
            "updated_at": p.updated_at.isoformat() if p.updated_at else None,
        }
        for p in plans
    ]


@router.patch("/plans/{plan_id}")
async def admin_update_plan(
    plan_id: str,
    body: dict,
    admin_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Update plan configuration. Allowed fields:
    name, price_usd, max_accounts, default_fee_pct,
    daily_backtest_limit, max_backtest_days, ai_builder_access,
    is_active, description
    """
    plan = await db.get(SubscriptionPlan, plan_id)
    if not plan:
        raise HTTPException(404, "Plan not found")

    allowed = {
        "name",
        "price_usd",
        "max_accounts",
        "default_fee_pct",
        "daily_backtest_limit",
        "max_backtest_days",
        "ai_builder_access",
        "is_active",
        "description",
    }

    for field, value in body.items():
        if field in allowed:
            setattr(plan, field, value)

    plan.updated_at = datetime.now(UTC)
    plan.updated_by = admin_user.id
    await db.commit()
    await db.refresh(plan)

    return {
        "id": plan.id,
        "name": plan.name,
        "price_usd": float(plan.price_usd),
        "max_accounts": plan.max_accounts,
        "default_fee_pct": float(plan.default_fee_pct),
        "daily_backtest_limit": plan.daily_backtest_limit,
        "max_backtest_days": plan.max_backtest_days,
        "ai_builder_access": plan.ai_builder_access,
        "is_active": plan.is_active,
        "description": plan.description,
    }


# ── User Subscription Overview ────────────────────────────────────────────────


@router.get("/subscriptions")
async def admin_list_subscriptions(
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    plan_id: str | None = Query(None),
    status: str | None = Query(None),
    search: str | None = Query(None),
):
    """List all user subscriptions with user info."""
    stmt = (
        select(UserSubscription, User)
        .join(User, User.id == UserSubscription.user_id)
        .where(User.deleted_at.is_(None))
    )

    if plan_id:
        stmt = stmt.where(UserSubscription.plan_id == plan_id)
    if status:
        stmt = stmt.where(UserSubscription.status == status)
    if search:
        stmt = stmt.where(
            (User.email.ilike(f"%{search}%")) | (User.display_name.ilike(f"%{search}%"))
        )

    count_result = await db.execute(select(func.count()).select_from(stmt.subquery()))
    total = count_result.scalar()

    stmt = (
        stmt.order_by(desc(UserSubscription.updated_at))
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(stmt)
    rows = result.all()

    return {
        "items": [
            {
                "user_id": str(user.id),
                "email": user.email,
                "display_name": user.display_name,
                "plan_id": sub.plan_id,
                "status": sub.status,
                "current_period_end": sub.current_period_end.isoformat()
                if sub.current_period_end
                else None,
                "grace_period_end": sub.grace_period_end.isoformat()
                if sub.grace_period_end
                else None,
                "cancel_at_period_end": sub.cancel_at_period_end,
                "started_at": sub.started_at.isoformat() if sub.started_at else None,
                "updated_at": sub.updated_at.isoformat() if sub.updated_at else None,
            }
            for sub, user in rows
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.get("/subscriptions/revenue")
async def admin_revenue_summary(
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Revenue overview: MRR, total collected, plan distribution."""

    # Total revenue all time
    total_rev = (
        await db.execute(
            select(func.coalesce(func.sum(SubscriptionInvoice.amount), 0)).where(
                SubscriptionInvoice.status == "paid"
            )
        )
    ).scalar()

    # This month revenue
    now = datetime.now(UTC)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    monthly_rev = (
        await db.execute(
            select(func.coalesce(func.sum(SubscriptionInvoice.amount), 0)).where(
                SubscriptionInvoice.status == "paid", SubscriptionInvoice.created_at >= month_start
            )
        )
    ).scalar()

    # Active subscriptions by plan
    plan_counts_result = await db.execute(
        select(UserSubscription.plan_id, func.count())
        .where(UserSubscription.status.in_(["active", "grace_period"]))
        .group_by(UserSubscription.plan_id)
    )
    plan_counts = {row[0]: row[1] for row in plan_counts_result.all()}

    # MRR estimate (active paid subs × price)
    plans = await get_all_plans(db)
    mrr = sum(
        plan_counts.get(p.id, 0) * float(p.price_usd) for p in plans if float(p.price_usd) > 0
    )

    return {
        "total_revenue": float(total_rev),
        "monthly_revenue": float(monthly_rev),
        "mrr_estimate": mrr,
        "active_by_plan": plan_counts,
        "total_active": sum(plan_counts.values()),
    }


@router.patch("/subscriptions/{user_id}")
async def admin_override_subscription(
    user_id: uuid.UUID,
    body: dict,
    admin_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Admin override — force change a user's plan (no charge).
    Body: { plan_id: "pro" }
    """
    plan_id = body.get("plan_id", "").strip().lower()
    if not plan_id:
        raise HTTPException(400, "plan_id is required")

    plan = await get_plan(db, plan_id)
    if not plan:
        raise HTTPException(404, f"Plan '{plan_id}' not found")

    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")

    # Update subscription without charging
    from datetime import timedelta

    from app.services.subscription_service import get_user_subscription

    sub = await get_user_subscription(db, user_id)
    now = datetime.now(UTC)

    sub.plan_id = plan_id
    sub.status = "active"
    sub.current_period_start = now
    sub.current_period_end = (
        now + timedelta(days=30) if float(plan.price_usd) > 0 else now + timedelta(days=36500)
    )
    sub.grace_period_end = None
    sub.cancel_at_period_end = False
    sub.updated_at = now

    # Update fee percentage
    user.fee_percentage_override = float(plan.default_fee_pct)

    await db.commit()
    return {"success": True, "user_id": str(user_id), "plan_id": plan_id}
