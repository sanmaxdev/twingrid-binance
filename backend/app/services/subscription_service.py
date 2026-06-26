"""
Subscription Service
====================
Core business logic for plan management, billing, renewals, and enforcement.
"""

import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import AuditAction, FeeTransactionType
from app.models.fee_transaction import FeeTransaction
from app.models.subscription_invoice import SubscriptionInvoice
from app.models.subscription_plan import SubscriptionPlan
from app.models.user import User
from app.models.user_backtest_usage import UserBacktestUsage
from app.models.user_subscription import UserSubscription
from app.services.audit_service import record_audit

logger = logging.getLogger(__name__)

GRACE_PERIOD_DAYS = 3


# ── Plan helpers ──────────────────────────────────────────────────────────────


async def get_all_plans(db: AsyncSession) -> list[SubscriptionPlan]:
    """Return all active subscription plans, ordered by sort_order."""
    result = await db.execute(
        select(SubscriptionPlan)
        .where(SubscriptionPlan.is_active == True)
        .order_by(SubscriptionPlan.sort_order)
    )
    return result.scalars().all()


async def get_plan(db: AsyncSession, plan_id: str) -> SubscriptionPlan | None:
    return await db.get(SubscriptionPlan, plan_id)


# ── User subscription helpers ─────────────────────────────────────────────────


async def get_user_subscription(db: AsyncSession, user_id: uuid.UUID) -> UserSubscription:
    """Get user's subscription. Auto-creates a Free plan subscription if none exists."""
    result = await db.execute(select(UserSubscription).where(UserSubscription.user_id == user_id))
    sub = result.scalar_one_or_none()

    if sub is None:
        # Bootstrap free plan
        sub = await _create_free_subscription(db, user_id)

    return sub


async def _create_free_subscription(db: AsyncSession, user_id: uuid.UUID) -> UserSubscription:
    """Silently create a Free tier subscription for a new user."""
    now = datetime.now(UTC)
    sub = UserSubscription(
        user_id=user_id,
        plan_id="free",
        status="active",
        started_at=now,
        current_period_start=now,
        current_period_end=now + timedelta(days=36500),  # Free plan never expires
    )
    db.add(sub)
    await db.commit()
    await db.refresh(sub)
    return sub


async def get_user_plan(db: AsyncSession, user_id: uuid.UUID) -> SubscriptionPlan:
    """Get the effective plan for a user, respecting grace period."""
    sub = await get_user_subscription(db, user_id)
    now = datetime.now(UTC)

    # During grace period, still on old plan
    if sub.status == "grace_period" and sub.grace_period_end and now < sub.grace_period_end:
        plan = await get_plan(db, sub.plan_id)
    elif sub.status in ("cancelled", "expired") or (
        sub.status == "grace_period" and (not sub.grace_period_end or now >= sub.grace_period_end)
    ):
        plan = await get_plan(db, "free")
    else:
        plan = await get_plan(db, sub.plan_id)

    return plan or await get_plan(db, "free")


# ── Subscribe / Upgrade / Downgrade ──────────────────────────────────────────


async def subscribe(
    db: AsyncSession,
    user_id: uuid.UUID,
    plan_id: str,
    actor_id: uuid.UUID | None = None,
) -> dict:
    """
    Subscribe or change a user's plan.
    - Immediately charges the wallet for paid plans.
    - Sets default fee_percentage_override if admin hasn't set one.
    - Returns dict with result details.
    """
    now = datetime.now(UTC)

    plan = await get_plan(db, plan_id)
    if not plan:
        raise ValueError(f"Plan '{plan_id}' not found")

    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise ValueError("User not found")

    sub = await get_user_subscription(db, user_id)
    old_plan_id = sub.plan_id

    # For paid plans, charge immediately
    if float(plan.price_usd) > 0:
        balance = float(user.twin_grid_balance)
        if balance < float(plan.price_usd):
            return {
                "success": False,
                "error": "insufficient_balance",
                "message": f"Insufficient balance. Need ${plan.price_usd:.2f} USDT but wallet has ${balance:.2f} USDT.",
                "required": float(plan.price_usd),
                "balance": balance,
            }

        # Deduct from wallet
        balance_before = balance
        user.twin_grid_balance = balance - float(plan.price_usd)
        balance_after = float(user.twin_grid_balance)

        # Record fee transaction
        txn = FeeTransaction(
            user_id=user_id,
            type=FeeTransactionType.SUBSCRIPTION_CHARGE,
            amount=-float(plan.price_usd),
            balance_before=balance_before,
            balance_after=balance_after,
            note=f"Subscription charge: {plan.name} plan",
        )
        db.add(txn)
        await db.flush()
        txn_id = txn.id
    else:
        txn_id = None

    # Update subscription
    sub.plan_id = plan_id
    sub.status = "active"
    sub.current_period_start = now
    sub.current_period_end = now + timedelta(days=30)
    sub.grace_period_end = None
    sub.cancel_at_period_end = False
    sub.cancelled_at = None
    sub.updated_at = now

    # Record invoice
    invoice = SubscriptionInvoice(
        user_id=user_id,
        subscription_id=sub.id,
        plan_id=plan_id,
        amount=float(plan.price_usd),
        status="paid",
        billing_period_start=now,
        billing_period_end=now + timedelta(days=30),
        fee_transaction_id=txn_id,
    )
    db.add(invoice)

    # NOTE: fee_percentage_override is NOT set here.
    # get_fee_percentage() reads the plan's default_fee_pct automatically.
    # Only admin explicit overrides should touch fee_percentage_override.

    await record_audit(
        db,
        action=AuditAction.SUBSCRIPTION_CHANGED,
        actor_user_id=actor_id or user_id,
        target_user_id=user_id,
        payload={"old_plan": old_plan_id, "new_plan": plan_id, "amount": float(plan.price_usd)},
    )
    await db.commit()

    # Send activation email (fire-and-forget)
    try:
        from app.services.notification_service import notification_service

        max_acc_label = "Unlimited" if plan.max_accounts is None else str(plan.max_accounts)
        next_billing = (now + timedelta(days=30)).strftime("%b %d, %Y")
        await notification_service.notify_subscription_activated(
            email=user.email,
            display_name=user.display_name or user.email.split("@")[0],
            plan_name=plan.name,
            amount_charged=float(plan.price_usd),
            next_billing=next_billing,
            fee_pct=float(plan.default_fee_pct),
            max_accounts=max_acc_label,
        )
    except Exception as e:
        logger.warning(f"Subscription activation email failed: {e}")

    return {
        "success": True,
        "plan": plan_id,
        "message": f"Successfully subscribed to {plan.name} plan.",
        "next_billing": (now + timedelta(days=30)).isoformat(),
        "amount_charged": float(plan.price_usd),
    }


# ── Cancel ────────────────────────────────────────────────────────────────────


async def cancel_subscription(db: AsyncSession, user_id: uuid.UUID) -> dict:
    """Cancel at period end — user retains access until current_period_end."""
    sub = await get_user_subscription(db, user_id)
    if sub.plan_id == "free":
        return {"success": False, "message": "Free plan cannot be cancelled."}

    sub.cancel_at_period_end = True
    sub.cancelled_at = datetime.now(UTC)

    await record_audit(
        db,
        action=AuditAction.SUBSCRIPTION_CANCELLED,
        actor_user_id=user_id,
        target_user_id=user_id,
        payload={"plan": sub.plan_id, "effective": sub.current_period_end.isoformat()},
    )
    await db.commit()

    # Send cancellation confirmation email
    try:
        from app.services.notification_service import notification_service

        user_result = await db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()
        plan = await get_plan(db, sub.plan_id)
        if user and plan:
            await notification_service.notify_subscription_cancelled(
                email=user.email,
                display_name=user.display_name or user.email.split("@")[0],
                plan_name=plan.name,
                access_until=sub.current_period_end.strftime("%B %d, %Y"),
            )
    except Exception as e:
        logger.warning(f"Subscription cancelled email failed: {e}")

    return {
        "success": True,
        "message": f"Subscription cancelled. Access continues until {sub.current_period_end.strftime('%Y-%m-%d')}.",
        "effective_date": sub.current_period_end.isoformat(),
    }


# ── Renewal (called by scheduler) ────────────────────────────────────────────


async def process_renewal(db: AsyncSession, sub: UserSubscription) -> dict:
    """
    Process a subscription renewal attempt.
    - If wallet is sufficient → charge and extend.
    - If insufficient → enter 3-day grace period.
    - If grace period also expired → downgrade to Free.
    """
    now = datetime.now(UTC)

    user_result = await db.execute(select(User).where(User.id == sub.user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        return {"success": False, "error": "user_not_found"}

    plan = await get_plan(db, sub.plan_id)
    if not plan or float(plan.price_usd) == 0:
        # Free plan, extend indefinitely
        sub.current_period_start = now
        sub.current_period_end = now + timedelta(days=36500)
        await db.commit()
        return {"success": True, "action": "extended_free"}

    # Cancelled at period end — downgrade
    if sub.cancel_at_period_end:
        return await _downgrade_to_free(db, sub, user, reason="cancelled_by_user")

    balance = float(user.twin_grid_balance)
    price = float(plan.price_usd)

    if balance >= price:
        # Charge and extend
        balance_before = balance
        user.twin_grid_balance = balance - price

        txn = FeeTransaction(
            user_id=sub.user_id,
            type=FeeTransactionType.SUBSCRIPTION_CHARGE,
            amount=-price,
            balance_before=balance_before,
            balance_after=float(user.twin_grid_balance),
            note=f"Subscription renewal: {plan.name} plan",
        )
        db.add(txn)
        await db.flush()

        invoice = SubscriptionInvoice(
            user_id=sub.user_id,
            subscription_id=sub.id,
            plan_id=sub.plan_id,
            amount=price,
            status="paid",
            billing_period_start=now,
            billing_period_end=now + timedelta(days=30),
            fee_transaction_id=txn.id,
        )
        db.add(invoice)

        sub.status = "active"
        sub.current_period_start = now
        sub.current_period_end = now + timedelta(days=30)
        sub.grace_period_end = None
        sub.updated_at = now

        await record_audit(
            db,
            action=AuditAction.SUBSCRIPTION_RENEWED,
            actor_user_id=sub.user_id,
            target_user_id=sub.user_id,
            payload={"plan": sub.plan_id, "amount": price},
        )
        await db.commit()

        # Send renewal confirmation email
        try:
            from app.services.notification_service import notification_service

            await notification_service.notify_subscription_renewed(
                email=user.email,
                display_name=user.display_name or user.email.split("@")[0],
                plan_name=plan.name,
                amount_charged=price,
                next_billing=(now + timedelta(days=30)).strftime("%b %d, %Y"),
                balance_after=float(user.twin_grid_balance),
            )
        except Exception as e:
            logger.warning(f"Subscription renewal email failed: {e}")

        return {"success": True, "action": "renewed", "amount": price}

    else:
        # Insufficient funds — enter grace period if not already
        if sub.status != "grace_period":
            sub.status = "grace_period"
            sub.grace_period_end = now + timedelta(days=GRACE_PERIOD_DAYS)
            sub.updated_at = now

            # Record failed invoice
            invoice = SubscriptionInvoice(
                user_id=sub.user_id,
                subscription_id=sub.id,
                plan_id=sub.plan_id,
                amount=price,
                status="failed",
                billing_period_start=now,
                billing_period_end=now + timedelta(days=30),
                failure_reason=f"Insufficient balance: ${balance:.2f} available, ${price:.2f} required",
            )
            db.add(invoice)

            await record_audit(
                db,
                action=AuditAction.SUBSCRIPTION_FAILED,
                actor_user_id=sub.user_id,
                target_user_id=sub.user_id,
                payload={"plan": sub.plan_id, "balance": balance, "required": price},
            )
            await db.commit()

            # Send payment failed / grace period email
            try:
                from app.services.notification_service import notification_service

                await notification_service.notify_subscription_payment_failed(
                    email=user.email,
                    display_name=user.display_name or user.email.split("@")[0],
                    plan_name=plan.name,
                    amount_due=price,
                    current_balance=balance,
                    grace_period_end=sub.grace_period_end.strftime("%B %d, %Y"),
                )
            except Exception as e:
                logger.warning(f"Payment failed email failed: {e}")

            return {
                "success": False,
                "action": "grace_period_started",
                "grace_ends": sub.grace_period_end.isoformat(),
            }

        elif sub.grace_period_end and now >= sub.grace_period_end:
            # Grace period exhausted — downgrade
            return await _downgrade_to_free(db, sub, user, reason="payment_failed_after_grace")

        return {"success": False, "action": "still_in_grace_period"}


async def _downgrade_to_free(
    db: AsyncSession, sub: UserSubscription, user: User, reason: str
) -> dict:
    """Downgrade user to Free plan."""
    now = datetime.now(UTC)
    old_plan = sub.plan_id
    sub.plan_id = "free"
    sub.status = "active"
    sub.current_period_start = now
    sub.current_period_end = now + timedelta(days=36500)
    sub.grace_period_end = None
    sub.cancel_at_period_end = False
    sub.updated_at = now

    # Clear any override so the global/Free rate applies correctly
    user.fee_percentage_override = None

    await record_audit(
        db,
        action=AuditAction.SUBSCRIPTION_CHANGED,
        actor_user_id=sub.user_id,
        target_user_id=sub.user_id,
        payload={"old_plan": old_plan, "new_plan": "free", "reason": reason},
    )
    await db.commit()

    # Send downgrade email
    try:
        from app.services.notification_service import notification_service

        old_plan_obj = await get_plan(db, old_plan)
        await notification_service.notify_subscription_downgraded(
            email=user.email,
            display_name=user.display_name or user.email.split("@")[0],
            old_plan_name=old_plan_obj.name if old_plan_obj else old_plan.capitalize(),
            reason=reason,
        )
    except Exception as e:
        logger.warning(f"Downgrade email failed: {e}")

    return {"success": True, "action": "downgraded_to_free", "reason": reason}


# ── Feature enforcement ───────────────────────────────────────────────────────


async def check_account_limit(db: AsyncSession, user_id: uuid.UUID) -> dict:
    """
    Check if user can add another account under their plan.
    Returns {"allowed": bool, "current": int, "max": int|None, "plan": str}
    """
    from app.models.account import Account

    plan = await get_user_plan(db, user_id)

    result = await db.execute(
        select(func.count())
        .select_from(Account)
        .where(
            Account.user_id == user_id,
            Account.deleted_at.is_(None),
        )
    )
    current_count = result.scalar() or 0

    if plan.max_accounts is None:
        return {"allowed": True, "current": current_count, "max": None, "plan": plan.id}

    return {
        "allowed": current_count < plan.max_accounts,
        "current": current_count,
        "max": plan.max_accounts,
        "plan": plan.id,
    }


async def check_backtest_access(db: AsyncSession, user_id: uuid.UUID) -> dict:
    """
    Check if user can run a backtest today.
    Returns {"allowed": bool, "used_today": int, "daily_limit": int|None, "plan": str}
    """
    from datetime import date

    plan = await get_user_plan(db, user_id)

    if plan.daily_backtest_limit is None:
        return {
            "allowed": False,
            "used_today": 0,
            "daily_limit": 0,
            "plan": plan.id,
            "reason": "no_backtest_access",
        }

    today = date.today()
    usage_result = await db.execute(
        select(UserBacktestUsage).where(
            UserBacktestUsage.user_id == user_id,
            UserBacktestUsage.date == today,
        )
    )
    usage = usage_result.scalar_one_or_none()
    used_today = usage.count if usage else 0

    return {
        "allowed": used_today < plan.daily_backtest_limit,
        "used_today": used_today,
        "daily_limit": plan.daily_backtest_limit,
        "max_backtest_days": plan.max_backtest_days,
        "plan": plan.id,
        "reason": None if used_today < plan.daily_backtest_limit else "daily_limit_reached",
    }


async def increment_backtest_usage(db: AsyncSession, user_id: uuid.UUID) -> int:
    """Increment today's backtest count and return new total."""
    from datetime import date

    today = date.today()

    usage_result = await db.execute(
        select(UserBacktestUsage).where(
            UserBacktestUsage.user_id == user_id,
            UserBacktestUsage.date == today,
        )
    )
    usage = usage_result.scalar_one_or_none()

    if usage:
        usage.count += 1
    else:
        usage = UserBacktestUsage(user_id=user_id, date=today, count=1)
        db.add(usage)

    await db.commit()
    return usage.count
