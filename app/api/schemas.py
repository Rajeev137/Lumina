from pydantic import BaseModel, EmailStr, ConfigDict
from uuid import UUID
from datetime import datetime


# ── Auth Schemas ─────────────────────────────────
class UserCreate(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: UUID
    email: EmailStr
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: int


# ── RLHF Schemas ────────────────────────────────
class FeedbackRequest(BaseModel):
    question: str
    answer: str
    status: str  # "approved" | "rejected" | "neutral"
