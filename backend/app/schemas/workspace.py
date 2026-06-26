from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr

from app.core.enums import WorkspaceRole


class WorkspaceBase(BaseModel):
    name: str


class WorkspaceCreate(WorkspaceBase):
    pass


class WorkspaceUpdate(WorkspaceBase):
    pass


class WorkspaceResponse(WorkspaceBase):
    id: UUID
    owner_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class WorkspaceMemberAdd(BaseModel):
    email: EmailStr
    role: WorkspaceRole = WorkspaceRole.VIEWER


class WorkspaceMemberResponse(BaseModel):
    workspace_id: UUID
    user_id: UUID
    role: WorkspaceRole
    joined_at: datetime
    # We can include simple user details
    user_email: str | None = None
    user_display_name: str | None = None

    model_config = ConfigDict(from_attributes=True)
