import uuid
from datetime import UTC

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user, get_db, require_workspace_role
from app.core.enums import WorkspaceRole
from app.models.user import User
from app.models.workspace import Workspace
from app.models.workspace_member import WorkspaceMember
from app.schemas.workspace import (
    WorkspaceCreate,
    WorkspaceMemberAdd,
    WorkspaceMemberResponse,
    WorkspaceResponse,
    WorkspaceUpdate,
)

router = APIRouter()


@router.post("/", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED)
async def create_workspace(
    payload: WorkspaceCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    workspace = Workspace(name=payload.name, owner_id=current_user.id)
    db.add(workspace)
    await db.flush()

    member = WorkspaceMember(
        workspace_id=workspace.id, user_id=current_user.id, role=WorkspaceRole.OWNER
    )
    db.add(member)
    await db.commit()
    await db.refresh(workspace)
    return workspace


@router.get("/", response_model=list[WorkspaceResponse])
async def list_workspaces(
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Workspace)
        .join(WorkspaceMember)
        .where(WorkspaceMember.user_id == current_user.id, Workspace.deleted_at == None)
    )
    return result.scalars().all()


@router.get("/{workspace_id}", response_model=WorkspaceResponse)
async def get_workspace(
    workspace_id: uuid.UUID,
    member: WorkspaceMember = Depends(
        require_workspace_role([WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.VIEWER])
    ),
    db: AsyncSession = Depends(get_db),
):
    # 'member' already verified they have access to x_workspace_id
    # Ensure they match just in case
    if member.workspace_id != workspace_id:
        raise HTTPException(status_code=403, detail="Workspace ID mismatch")

    result = await db.execute(
        select(Workspace).where(Workspace.id == workspace_id, Workspace.deleted_at == None)
    )
    workspace = result.scalars().first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return workspace


@router.put("/{workspace_id}", response_model=WorkspaceResponse)
async def update_workspace(
    workspace_id: uuid.UUID,
    payload: WorkspaceUpdate,
    member: WorkspaceMember = Depends(
        require_workspace_role([WorkspaceRole.OWNER, WorkspaceRole.ADMIN])
    ),
    db: AsyncSession = Depends(get_db),
):
    if member.workspace_id != workspace_id:
        raise HTTPException(status_code=403, detail="Workspace ID mismatch")

    result = await db.execute(
        select(Workspace).where(Workspace.id == workspace_id, Workspace.deleted_at == None)
    )
    workspace = result.scalars().first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    workspace.name = payload.name
    await db.commit()
    await db.refresh(workspace)
    return workspace


@router.delete("/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workspace(
    workspace_id: uuid.UUID,
    member: WorkspaceMember = Depends(require_workspace_role([WorkspaceRole.OWNER])),
    db: AsyncSession = Depends(get_db),
):
    if member.workspace_id != workspace_id:
        raise HTTPException(status_code=403, detail="Workspace ID mismatch")

    result = await db.execute(
        select(Workspace).where(Workspace.id == workspace_id, Workspace.deleted_at == None)
    )
    workspace = result.scalars().first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    from datetime import datetime

    workspace.deleted_at = datetime.now(UTC)
    await db.commit()
    return None


@router.get("/{workspace_id}/members", response_model=list[WorkspaceMemberResponse])
async def list_workspace_members(
    workspace_id: uuid.UUID,
    member: WorkspaceMember = Depends(
        require_workspace_role([WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.VIEWER])
    ),
    db: AsyncSession = Depends(get_db),
):
    if member.workspace_id != workspace_id:
        raise HTTPException(status_code=403, detail="Workspace ID mismatch")

    result = await db.execute(
        select(WorkspaceMember)
        .options(selectinload(WorkspaceMember.user))
        .where(WorkspaceMember.workspace_id == workspace_id)
    )
    members = result.scalars().all()

    response = []
    for m in members:
        # Convert to a dict to match schema and include user details
        m_dict = {
            "workspace_id": m.workspace_id,
            "user_id": m.user_id,
            "role": m.role,
            "joined_at": m.joined_at,
            "user_email": m.user.email if m.user else None,
            "user_display_name": m.user.display_name if m.user else None,
        }
        response.append(m_dict)

    return response


@router.post(
    "/{workspace_id}/members",
    response_model=WorkspaceMemberResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_workspace_member(
    workspace_id: uuid.UUID,
    payload: WorkspaceMemberAdd,
    current_member: WorkspaceMember = Depends(
        require_workspace_role([WorkspaceRole.OWNER, WorkspaceRole.ADMIN])
    ),
    db: AsyncSession = Depends(get_db),
):
    if current_member.workspace_id != workspace_id:
        raise HTTPException(status_code=403, detail="Workspace ID mismatch")

    # Find user by email
    result = await db.execute(
        select(User).where(User.email == payload.email, User.deleted_at == None)
    )
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Check if already a member
    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == user.id
        )
    )
    existing = result.scalars().first()
    if existing:
        raise HTTPException(status_code=400, detail="User is already a member")

    # Create member
    new_member = WorkspaceMember(workspace_id=workspace_id, user_id=user.id, role=payload.role)
    db.add(new_member)
    await db.commit()
    await db.refresh(new_member)

    return {
        "workspace_id": new_member.workspace_id,
        "user_id": new_member.user_id,
        "role": new_member.role,
        "joined_at": new_member.joined_at,
        "user_email": user.email,
        "user_display_name": user.display_name,
    }


@router.delete("/{workspace_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_workspace_member(
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    current_member: WorkspaceMember = Depends(
        require_workspace_role([WorkspaceRole.OWNER, WorkspaceRole.ADMIN])
    ),
    db: AsyncSession = Depends(get_db),
):
    if current_member.workspace_id != workspace_id:
        raise HTTPException(status_code=403, detail="Workspace ID mismatch")

    # Prevent removing owner
    result = await db.execute(select(Workspace).where(Workspace.id == workspace_id))
    workspace = result.scalars().first()
    if workspace and workspace.owner_id == user_id:
        raise HTTPException(status_code=400, detail="Cannot remove workspace owner")

    # Admin cannot remove another admin or owner (simplified logic: admins can't remove owners, checked above. Admins removing admins? Let's say only owner can remove admin for now, or keep it simple).
    # Keep it simple for MVP: Owner can't be removed.

    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == user_id
        )
    )
    member_to_remove = result.scalars().first()
    if not member_to_remove:
        raise HTTPException(status_code=404, detail="Member not found")

    await db.delete(member_to_remove)
    await db.commit()
    return None
