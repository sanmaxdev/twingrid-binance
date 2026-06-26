"""Backtest history — stores results of admin strategy backtests."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class BacktestHistory(Base):
    __tablename__ = "backtest_history"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Who ran it
    run_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )

    # Config used
    symbol: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    period_days: Mapped[int] = mapped_column(Integer, nullable=False)
    initial_capital: Mapped[float] = mapped_column(Float, nullable=False)
    config: Mapped[dict] = mapped_column(JSONB, nullable=False)  # full strategy config

    # Summary results
    total_trades: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    winning_trades: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    losing_trades: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    win_rate: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    total_pnl: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    total_pnl_pct: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    max_drawdown_pct: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    sharpe_ratio: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    profit_factor: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    final_capital: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    total_fees_paid: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    liquidated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    trend_filter_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    trend_blocked_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Full result payload (trades, equity curve, etc.) — stored compressed
    full_result: Mapped[dict] = mapped_column(JSONB, nullable=False)

    # Optional label/notes from admin
    label: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
        index=True,
    )

    run_by_user = relationship("User", foreign_keys=[run_by])
