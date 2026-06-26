from fastapi import APIRouter

from app.api.v1.endpoints import (
    accounts,
    affiliates,
    auth,
    history,
    me,
    subscriptions,
    user_backtest,
    wallet,
    workspaces,
)
from app.api.v1.endpoints import telegram as telegram_endpoints
from app.api.v1.endpoints.admin import affiliates as admin_affiliates
from app.api.v1.endpoints.admin import ai_tuner as admin_ai_tuner
from app.api.v1.endpoints.admin import audit as admin_audit
from app.api.v1.endpoints.admin import backtest as admin_backtest
from app.api.v1.endpoints.admin import events as admin_events
from app.api.v1.endpoints.admin import fees as admin_fees
from app.api.v1.endpoints.admin import market_data as admin_market_data
from app.api.v1.endpoints.admin import metrics as admin_metrics
from app.api.v1.endpoints.admin import subscription_admin
from app.api.v1.endpoints.admin import users as admin_users
from app.api.v1.endpoints.super_admin import encryption, management
from app.api.v1.endpoints.super_admin import system as super_admin_system
from app.api.v1.endpoints.super_admin import users as super_admin_users

api_router = APIRouter()

# Public / user endpoints
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(me.router, prefix="/me", tags=["me"])
api_router.include_router(workspaces.router, prefix="/workspaces", tags=["workspaces"])
api_router.include_router(accounts.router, prefix="/accounts", tags=["accounts"])
api_router.include_router(history.router, prefix="", tags=["history"])
api_router.include_router(wallet.router, prefix="/wallet", tags=["wallet"])
api_router.include_router(affiliates.router, prefix="/affiliates", tags=["affiliates"])
api_router.include_router(subscriptions.router, prefix="/subscriptions", tags=["subscriptions"])
api_router.include_router(user_backtest.router, prefix="/user-backtest", tags=["user_backtest"])
api_router.include_router(telegram_endpoints.router, prefix="", tags=["telegram"])

# Admin endpoints (ADMIN + SUPER_ADMIN)
api_router.include_router(admin_users.router, prefix="/admin", tags=["admin_users"])
api_router.include_router(admin_events.router, prefix="/admin", tags=["admin_events"])
api_router.include_router(admin_audit.router, prefix="/admin", tags=["admin_audit"])
api_router.include_router(admin_metrics.router, prefix="/admin", tags=["admin_metrics"])
api_router.include_router(admin_backtest.router, prefix="/admin", tags=["admin_backtest"])
api_router.include_router(admin_ai_tuner.router, prefix="/admin", tags=["admin_ai_tuner"])
api_router.include_router(admin_market_data.router, prefix="/admin", tags=["admin_market_data"])
api_router.include_router(admin_fees.router, prefix="/admin/fees", tags=["admin_fees"])
api_router.include_router(
    admin_affiliates.router, prefix="/admin/affiliates", tags=["admin_affiliates"]
)
api_router.include_router(subscription_admin.router, prefix="/admin", tags=["admin_subscriptions"])

# Super-admin endpoints (SUPER_ADMIN only)
api_router.include_router(encryption.router, prefix="/admin/super", tags=["super_admin"])
api_router.include_router(
    management.router, prefix="/admin/super/management", tags=["super_admin_management"]
)
api_router.include_router(
    super_admin_users.router, prefix="/admin/super", tags=["super_admin_users"]
)
api_router.include_router(
    super_admin_system.router, prefix="/admin/super/management", tags=["super_admin_system"]
)
