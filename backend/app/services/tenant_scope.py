"""Tenant scope dependency for multi-tenant isolation per §12.2."""

from uuid import UUID
from sqlalchemy import Select
from app.models.user import User
from app.core.enums import Role


class TenantScope:
    """Applies tenant-level filtering to database queries.

    For USER role: scopes all queries to the current user's data.
    For ADMIN+ roles: no filter applied (admin reads are permitted).
    """

    def __init__(self, user: User):
        self.user = user
        self.user_id = user.id
        self.role = Role(user.role) if isinstance(user.role, str) else user.role

    @property
    def is_admin(self) -> bool:
        return self.role in (Role.ADMIN, Role.SUPER_ADMIN)

    @property
    def is_super_admin(self) -> bool:
        return self.role == Role.SUPER_ADMIN

    def filter_user_owned(self, stmt: Select, model, *, user_id_col: str = "user_id") -> Select:
        """Add user_id filter for USER role; no-op for ADMIN+."""
        if self.is_admin:
            return stmt
        col = getattr(model, user_id_col)
        return stmt.where(col == self.user_id)

    def can_modify(self, resource_user_id: UUID) -> bool:
        """Check if the current user can modify a resource owned by resource_user_id.

        Users can only modify their own resources. Admins use /admin/* endpoints.
        """
        if self.role == Role.USER:
            return resource_user_id == self.user_id
        # Admins should NOT modify via user endpoints — they use /admin/*
        return False

    def assert_owner(self, resource_user_id: UUID):
        """Raise if current user doesn't own the resource. Returns 404 per §3.5."""
        from fastapi import HTTPException, status
        if resource_user_id != self.user_id and not self.is_admin:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
