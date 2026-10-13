import uuid
from datetime import datetime
from typing import List, Optional, Literal
from pydantic import BaseModel, ConfigDict, Field, EmailStr
from app.schemas.user import UserResponse


WorkspaceRoleType = Literal["owner", "admin", "member"]


class WorkspaceBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)


class WorkspaceCreate(WorkspaceBase):
    pass


class WorkspaceUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)


class WorkspaceMemberResponse(BaseModel):
    workspace_id: uuid.UUID
    user_id: uuid.UUID
    role: str
    user: Optional[UserResponse] = None

    model_config = ConfigDict(from_attributes=True)


class WorkspaceResponse(WorkspaceBase):
    id: uuid.UUID
    created_at: datetime
    role: Optional[str] = None  # Current caller's role in the workspace

    model_config = ConfigDict(from_attributes=True)


class WorkspaceDetailResponse(WorkspaceResponse):
    members: List[WorkspaceMemberResponse] = []


class AddWorkspaceMemberRequest(BaseModel):
    email: EmailStr
    role: WorkspaceRoleType = "member"


class UpdateWorkspaceMemberRequest(BaseModel):
    role: WorkspaceRoleType
