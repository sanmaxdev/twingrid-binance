#!/usr/bin/env python3
"""
One-time migration: Clear fee_percentage_override for users where the override
equals their plan's default_fee_pct (i.e., it was set by the old subscribe() logic,
not by an admin). After this, get_fee_percentage() reads the plan default automatically.

Run once: python scripts/fix_fee_overrides.py
"""

import asyncio
import sys
import os

# Add the project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.user import User
from app.models.user_subscription import UserSubscription
from app.models.subscription_plan import SubscriptionPlan


async def fix_fee_overrides():
    async with AsyncSessionLocal() as db:
        # Load all users with a non-null override
        users_result = await db.execute(
            select(User).where(User.fee_percentage_override != None, User.deleted_at == None)
        )
        users = users_result.scalars().all()
        print(f"Found {len(users)} users with fee_percentage_override set")

        cleared = 0
        kept = 0

        for user in users:
            # Get their subscription
            sub_result = await db.execute(
                select(UserSubscription).where(UserSubscription.user_id == user.id)
            )
            user_sub = sub_result.scalar_one_or_none()

            if not user_sub or user_sub.plan_id == "free":
                # Free plan users: keep override if set (it might be a real admin override)
                # But also clear it if it matches the free plan default
                if user_sub and user_sub.plan_id == "free":
                    plan_result = await db.execute(
                        select(SubscriptionPlan).where(SubscriptionPlan.id == "free")
                    )
                    free_plan = plan_result.scalar_one_or_none()
                    if free_plan and abs(user.fee_percentage_override - float(free_plan.default_fee_pct)) < 0.01:
                        print(f"  Clearing override for {user.email} (Free, override={user.fee_percentage_override} == plan default)")
                        user.fee_percentage_override = None
                        cleared += 1
                        continue
                kept += 1
                continue

            # Paid plan user: check if override equals plan default
            plan_result = await db.execute(
                select(SubscriptionPlan).where(SubscriptionPlan.id == user_sub.plan_id)
            )
            plan = plan_result.scalar_one_or_none()

            if plan and abs(user.fee_percentage_override - float(plan.default_fee_pct)) < 0.01:
                # Override matches plan default — was set by old subscribe() logic, clear it
                print(f"  Clearing override for {user.email} ({plan.name}, override={user.fee_percentage_override} == plan default {plan.default_fee_pct})")
                user.fee_percentage_override = None
                cleared += 1
            else:
                # Override differs from plan default — this is a real admin override, keep it
                print(f"  Keeping override for {user.email} ({plan.name if plan else '?'}, override={user.fee_percentage_override} != plan default {float(plan.default_fee_pct) if plan else '?'})")
                kept += 1

        await db.commit()
        print(f"\nDone. Cleared: {cleared}, Kept (real admin overrides): {kept}")


if __name__ == "__main__":
    asyncio.run(fix_fee_overrides())
