import asyncio
import logging

from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.security import get_password_hash
from app.models.user import User

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def bootstrap():
    logger.info("Starting bootstrap process...")
    if not settings.BOOTSTRAP_SUPER_ADMIN_EMAIL or not settings.BOOTSTRAP_SUPER_ADMIN_PASSWORD:
        logger.warning(
            "BOOTSTRAP_SUPER_ADMIN_EMAIL or BOOTSTRAP_SUPER_ADMIN_PASSWORD not set. Skipping bootstrap."
        )
        return

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(User).where(User.email == settings.BOOTSTRAP_SUPER_ADMIN_EMAIL)
        )
        existing_user = result.scalars().first()

        if existing_user:
            logger.info("Super admin user already exists. Skipping.")
            return

        import uuid

        from app.core.enums import WorkspaceRole
        from app.models.workspace import Workspace
        from app.models.workspace_member import WorkspaceMember

        logger.info("Creating initial SUPER_ADMIN user...")
        super_admin_invite_code = str(uuid.uuid4())[:8].upper()
        super_admin = User(
            email=settings.BOOTSTRAP_SUPER_ADMIN_EMAIL,
            password_hash=get_password_hash(settings.BOOTSTRAP_SUPER_ADMIN_PASSWORD),
            role="SUPER_ADMIN",
            is_active=True,
            is_email_verified=True,
            invite_code=super_admin_invite_code,
        )
        session.add(super_admin)
        await session.flush()  # flush to get user ID

        # Auto-provision personal workspace
        default_workspace = Workspace(name="Personal Workspace", owner_id=super_admin.id)
        session.add(default_workspace)
        await session.flush()

        member = WorkspaceMember(
            workspace_id=default_workspace.id, user_id=super_admin.id, role=WorkspaceRole.OWNER
        )
        session.add(member)

        await session.commit()
        logger.info(
            f"SUPER_ADMIN user '{settings.BOOTSTRAP_SUPER_ADMIN_EMAIL}' created successfully with invite code: {super_admin_invite_code}."
        )


if __name__ == "__main__":
    asyncio.run(bootstrap())
