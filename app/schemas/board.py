import uuid
from datetime import datetime
from typing import List, Optional, Literal
from pydantic import BaseModel, ConfigDict, Field


# -------------------------------------------------------------
# Card Schemas
# -------------------------------------------------------------
class CardBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    assignee_id: Optional[uuid.UUID] = None


class CardCreate(CardBase):
    rank: Optional[str] = None
    prev_rank: Optional[str] = None
    next_rank: Optional[str] = None
    position: Optional[Literal["start", "end"]] = "end"


class CardUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    assignee_id: Optional[uuid.UUID] = None


class CardMoveRequest(BaseModel):
    target_column_id: Optional[uuid.UUID] = None
    rank: Optional[str] = None
    prev_rank: Optional[str] = None
    next_rank: Optional[str] = None
    version: Optional[int] = None  # Optimistic concurrency check


class CardResponse(CardBase):
    id: uuid.UUID
    column_id: uuid.UUID
    board_id: uuid.UUID
    assignee_id: Optional[uuid.UUID] = None
    rank: str
    version: int
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# -------------------------------------------------------------
# Column Schemas
# -------------------------------------------------------------
class ColumnBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)


class ColumnCreate(ColumnBase):
    rank: Optional[str] = None
    prev_rank: Optional[str] = None
    next_rank: Optional[str] = None


class ColumnUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=100)


class ColumnResponse(ColumnBase):
    id: uuid.UUID
    board_id: uuid.UUID
    rank: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ColumnDetailResponse(ColumnResponse):
    cards: List[CardResponse] = []


# -------------------------------------------------------------
# Board Schemas
# -------------------------------------------------------------
class BoardBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=150)


class BoardCreate(BoardBase):
    pass


class BoardUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=150)


class BoardResponse(BoardBase):
    id: uuid.UUID
    workspace_id: uuid.UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BoardDetailResponse(BoardResponse):
    columns: List[ColumnDetailResponse] = []
