import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, Numeric, String, text
from sqlalchemy.dialects.postgresql import BYTEA, CITEXT, INET, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import Role
from app.models.base import Base

if TYPE_CHECKING:
    from app.models.session import Session
    from app.models.workspace import Workspace
    from app.models.workspace_member import WorkspaceMember


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    email: Mapped[str] = mapped_column(CITEXT, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    display_name: Mapped[str | None] = mapped_column(String)
    role: Mapped[Role] = mapped_column(String, nullable=False, server_default="USER")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    is_email_verified: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    email_verification_token_hash: Mapped[str | None] = mapped_column(String)
    email_verification_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    password_reset_token_hash: Mapped[str | None] = mapped_column(String)
    password_reset_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    totp_secret_encrypted: Mapped[bytes | None] = mapped_column(BYTEA)
    failed_login_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    suspended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    suspended_reason: Mapped[str | None] = mapped_column(String)
    suspended_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_ip: Mapped[str | None] = mapped_column(INET)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    invite_code: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    invited_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )

    # Twin Grid Fee System
    twin_grid_balance: Mapped[float] = mapped_column(
        Numeric(24, 8), nullable=False, server_default=text("0")
    )
    fee_percentage_override: Mapped[float | None] = mapped_column(
        Numeric(8, 4), nullable=True
    )  # Per-user fee override; NULL = use global
    affiliate_commission_override: Mapped[float | None] = mapped_column(
        Numeric(8, 4), nullable=True
    )  # Per-user affiliate commission override; NULL = use global
    affiliate_balance: Mapped[float] = mapped_column(
        Numeric(24, 8), nullable=False, server_default=text("0")
    )  # Separate affiliate wallet for commissions

    # Telegram Notifications
    telegram_chat_id: Mapped[int | None] = mapped_column(BigInteger, unique=True, nullable=True)
    telegram_username: Mapped[str | None] = mapped_column(String(255), nullable=True)
    telegram_connected_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    telegram_link_token: Mapped[str | None] = mapped_column(String(64), nullable=True)
    telegram_link_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    telegram_notifications: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    sessions: Mapped[list["Session"]] = relationship(
        "Session", back_populates="user", cascade="all, delete"
    )
    workspace_memberships: Mapped[list["WorkspaceMember"]] = relationship(
        "WorkspaceMember", back_populates="user", cascade="all, delete"
    )
    owned_workspaces: Mapped[list["Workspace"]] = relationship(
        "Workspace", back_populates="owner", cascade="all, delete"
    )
