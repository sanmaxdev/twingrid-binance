"""Centralized audit logging service per §16.1."""

from typing import Any
from uuid import UUID

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import AuditAction, EventSeverity
from app.models.audit_log import AuditLog
from app.models.event import Event

logger = structlog.get_logger()

# Map audit actions to severity for the event feed
ACTION_SEVERITY = {
    AuditAction.USER_REGISTERED: EventSeverity.INFO,
    AuditAction.USER_VERIFIED: EventSeverity.INFO,
    AuditAction.LOGIN_SUCCESS: EventSeverity.INFO,
    AuditAction.LOGIN_FAILED: EventSeverity.WARN,
    AuditAction.LOGOUT: EventSeverity.INFO,
    AuditAction.PASSWORD_CHANGED: EventSeverity.INFO,
    AuditAction.PASSWORD_RESET_REQUESTED: EventSeverity.INFO,
    AuditAction.PASSWORD_RESET_COMPLETED: EventSeverity.INFO,
    AuditAction.EMAIL_CHANGED: EventSeverity.INFO,
    AuditAction.TOTP_ENROLLED: EventSeverity.INFO,
    AuditAction.TOTP_DISABLED: EventSeverity.WARN,
    AuditAction.ACCOUNT_CREATED: EventSeverity.INFO,
    AuditAction.ACCOUNT_DELETED: EventSeverity.INFO,
    AuditAction.ACCOUNT_STARTED: EventSeverity.INFO,
    AuditAction.ACCOUNT_PAUSED: EventSeverity.INFO,
    AuditAction.ACCOUNT_HALTED: EventSeverity.WARN,
    AuditAction.ACCOUNT_EMERGENCY_CLOSE: EventSeverity.WARN,
    AuditAction.SETTINGS_CHANGED: EventSeverity.INFO,
    AuditAction.BASKET_OPENED: EventSeverity.INFO,
    AuditAction.BASKET_CLOSED_TP: EventSeverity.INFO,
    AuditAction.BASKET_LIQUIDATED: EventSeverity.CRITICAL,
    AuditAction.USER_SUSPENDED: EventSeverity.WARN,
    AuditAction.USER_UNSUSPENDED: EventSeverity.INFO,
    AuditAction.USER_FORCE_LOGOUT: EventSeverity.WARN,
    AuditAction.USER_FORCE_PASSWORD_RESET: EventSeverity.WARN,
    AuditAction.USER_PROMOTED: EventSeverity.WARN,
    AuditAction.USER_DEMOTED: EventSeverity.WARN,
    AuditAction.USER_HARD_DELETED: EventSeverity.CRITICAL,
    AuditAction.IMPERSONATION_STARTED: EventSeverity.WARN,
    AuditAction.IMPERSONATION_ENDED: EventSeverity.INFO,
    AuditAction.PLATFORM_HALT: EventSeverity.CRITICAL,
    AuditAction.ENCRYPTION_KEY_ROTATED: EventSeverity.CRITICAL,
    AuditAction.TRADING_ENABLED: EventSeverity.INFO,
    AuditAction.TRADING_DISABLED: EventSeverity.WARN,
    AuditAction.AUTO_TRADE_TOGGLED: EventSeverity.INFO,
}


async def record_audit(
    db: AsyncSession,
    *,
    action: AuditAction,
    actor_user_id: UUID | None = None,
    target_user_id: UUID | None = None,
    target_account_id: UUID | None = None,
    payload: dict[str, Any] | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    impersonating: bool = False,
    emit_event: bool = True,
) -> AuditLog:
    """Write an audit log entry and optionally emit a system event."""
    audit = AuditLog(
        actor_user_id=actor_user_id,
        target_user_id=target_user_id,
        target_account_id=target_account_id,
        action=action.value,
        payload=payload,
        impersonating=impersonating,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(audit)

    if emit_event:
        severity = ACTION_SEVERITY.get(action, EventSeverity.INFO)
        event = Event(
            type=action.value,
            severity=severity.value,
            title=action.value.replace("_", " ").title(),
            user_id=target_user_id or actor_user_id,
            account_id=target_account_id,
            payload=payload,
        )
        db.add(event)

    logger.info(
        "audit_recorded",
        action=action.value,
        actor=str(actor_user_id) if actor_user_id else None,
        target=str(target_user_id) if target_user_id else None,
    )
    return audit


async def emit_system_event(
    db: AsyncSession,
    *,
    event_type: str,
    severity: EventSeverity,
    title: str,
    message: str | None = None,
    user_id: UUID | None = None,
    account_id: UUID | None = None,
    basket_id: UUID | None = None,
    payload: dict[str, Any] | None = None,
) -> Event:
    """Emit a system event without an audit log entry."""
    event = Event(
        type=event_type,
        severity=severity.value,
        title=title,
        message=message,
        user_id=user_id,
        account_id=account_id,
        basket_id=basket_id,
        payload=payload,
    )
    db.add(event)
    return event
