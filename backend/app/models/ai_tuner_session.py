"""AI Tuner Session — stores Gemini agent optimization sessions."""

import uuid
from datetime import datetime, timezone
from sqlalchemy import Integer, String, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app.models.base import Base


class AiTunerSession(Base):
    __tablename__ = "ai_tuner_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # Who ran it
    run_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )

    # Optimization context
    symbol: Mapped[str] = mapped_column(String(20), nullable=False)
    goal: Mapped[str] = mapped_column(Text, nullable=False)  # User's prompt / goal
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="running"
    )  # running, completed, failed, cancelled

    # Conversation history  (list of {role, content, function_call?, function_result?})
    messages: Mapped[dict] = mapped_column(JSONB, nullable=False, default=list)

    # Results tracking
    backtests_run: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    results: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=list
    )  # List of summary results from each backtest

    # Best config found
    best_config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    best_sharpe: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    best_pnl_pct: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    best_max_drawdown: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    run_by_user = relationship("User", foreign_keys=[run_by])
