from __future__ import annotations

from pydantic import BaseModel, ConfigDict, EmailStr


class MagicLinkRequest(BaseModel):
    email: EmailStr


class MagicLinkVerify(BaseModel):
    token: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class MagicLinkResponse(BaseModel):
    message: str
    magic_url: str | None = None
    expires_in_minutes: str | None = None