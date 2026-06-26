"""Admin-configurable subscription plan definition."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class SubscriptionPlan(Base):
    __tablename__ = "subscription_plans"

    id: Mapped[str] = mapped_column(String(20), primary_key=True)  # 'free', 'pro', 'elite'
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    price_usd: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    max_accounts: Mapped[int | None] = mapped_column(Integer, nullable=True)  # NULL = unlimited
    default_fee_pct: Mapped[float] = mapped_column(Numeric(8, 4), nullable=False, default=25)
    daily_backtest_limit: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )  # NULL = no access
    max_backtest_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ai_builder_access: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
