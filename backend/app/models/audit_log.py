import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, String, text
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    target_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    target_account_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True)
    )  # no strict fkey right now to avoid schema cyclic deps before account model
    action: Mapped[str] = mapped_column(String, nullable=False)
    target: Mapped[str | None] = mapped_column(String)
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    impersonating: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    ip_address: Mapped[str | None] = mapped_column(INET)
    user_agent: Mapped[str | None] = mapped_column(String)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
