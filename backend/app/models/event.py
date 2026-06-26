"""System event model — platform-wide event feed."""

import uuid
from datetime import datetime
from typing import Optional, Any
from sqlalchemy import String, text, DateTime, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.models.base import Base
from app.core.enums import EventSeverity


class Event(Base):
    """System-wide events for the admin event feed."""
    __tablename__ = "events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    type: Mapped[str] = mapped_column(String, nullable=False, index=True)
    severity: Mapped[str] = mapped_column(
        String, nullable=False, server_default=EventSeverity.INFO.value
    )
    title: Mapped[str] = mapped_column(String, nullable=False)
    message: Mapped[Optional[str]] = mapped_column(String)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), index=True
    )
    account_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), index=True
    )
    basket_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True))
    payload: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    __table_args__ = (
        Index("ix_events_severity_occurred", "severity", "occurred_at"),
    )
