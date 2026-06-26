"""Subscription invoice — records every billing charge attempt."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class SubscriptionInvoice(Base):
    __tablename__ = "subscription_invoices"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    subscription_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user_subscriptions.id"), nullable=False
    )
    plan_id: Mapped[str] = mapped_column(String(20), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(24, 8), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)  # paid | failed | refunded
    billing_period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    billing_period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    fee_transaction_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("fee_transactions.id"), nullable=True
    )
    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    user = relationship("User", foreign_keys=[user_id])
