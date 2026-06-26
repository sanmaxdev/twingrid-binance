"""Daily backtest usage tracker for quota enforcement."""

import uuid
from datetime import date

from sqlalchemy import Date, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class UserBacktestUsage(Base):
    __tablename__ = "user_backtest_usage"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    __table_args__ = (UniqueConstraint("user_id", "date", name="uq_user_backtest_date"),)
