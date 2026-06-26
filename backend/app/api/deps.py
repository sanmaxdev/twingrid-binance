"""FastAPI dependencies — auth, tenant scope, role guards."""

from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.core.enums import Role, WorkspaceRole
from app.core.security import verify_token
from app.models.user import User
from app.models.workspace_member import WorkspaceMember
from app.services.tenant_scope import TenantScope

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


async def get_token_from_header_or_cookie(request: Request) -> str:
    auth = request.headers.get("Authorization")
    if auth and auth.startswith("Bearer "):
        return auth.split(" ")[1]
    token = request.cookies.get("access_token")
    if token:
        return token
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield a database session."""
    async with AsyncSessionLocal() as session:
        yield session


async def get_current_user(
    token: str = Depends(get_token_from_header_or_cookie), db: AsyncSession = Depends(get_db)
) -> User:
    """Validate JWT and return the current user."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = verify_token(token, "access")
    if payload is None:
        raise credentials_exception

    user_id_str: str = payload.get("sub")
    if user_id_str is None:
        raise credentials_exception

    try:
        import uuid

        user_id = uuid.UUID(user_id_str)
    except ValueError:
        raise credentials_exception from None

    result = await db.execute(select(User).where(User.id == user_id, User.deleted_at == None))
    user = result.scalars().first()

    if user is None:
        raise credentials_exception

    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")

    if user.suspended_at is not None:
        raise HTTPException(status_code=403, detail="User account is suspended")

    return user


def get_tenant_scope(current_user: User = Depends(get_current_user)) -> TenantScope:
    """Return a TenantScope bound to the current user."""
    return TenantScope(current_user)


def require_role(*allowed_roles: Role):
    """Dependency factory: require the current user to have one of the specified roles."""

    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        user_role = (
            Role(current_user.role) if isinstance(current_user.role, str) else current_user.role
        )
        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions"
            )
        return current_user

    return role_checker


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Require ADMIN or SUPER_ADMIN role."""
    user_role = Role(current_user.role) if isinstance(current_user.role, str) else current_user.role
    if user_role not in (Role.ADMIN, Role.SUPER_ADMIN):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


def require_super_admin(current_user: User = Depends(get_current_user)) -> User:
    """Require SUPER_ADMIN role."""
    user_role = Role(current_user.role) if isinstance(current_user.role, str) else current_user.role
    if user_role != Role.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Super admin access required"
        )
    return current_user


# Workspace-related deps (backward compat)


async def get_current_workspace_member(
    x_workspace_id: Annotated[str, Header()],
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WorkspaceMember:
    """Resolve workspace membership from header."""
    import uuid

    try:
        workspace_id = uuid.UUID(x_workspace_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid workspace ID format") from None

    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == current_user.id
        )
    )
    member = result.scalars().first()
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this workspace")

    return member


def require_workspace_role(allowed_roles: list[WorkspaceRole]):
    """Require specific workspace role."""

    def role_checker(member: WorkspaceMember = Depends(get_current_workspace_member)):
        if member.role not in allowed_roles:
            raise HTTPException(status_code=403, detail="Insufficient workspace permissions")
        return member

    return role_checker
