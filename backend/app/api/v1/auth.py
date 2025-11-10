from __future__ import annotations

import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.db.models import MagicLink, User
from app.db.session import get_session
from app.schemas.auth import MagicLinkRequest, MagicLinkResponse, MagicLinkVerify, TokenOut, UserOut

router = APIRouter(tags=["auth"])

# Magic link expiration time (in minutes)
MAGIC_LINK_EXPIRE_MINUTES = 15

# Force reload


@router.post("/magic-link", status_code=status.HTTP_202_ACCEPTED, response_model=MagicLinkResponse)
async def request_magic_link(
    request: MagicLinkRequest, session: AsyncSession = Depends(get_session)
) -> MagicLinkResponse:
    """
    Request a magic link for authentication.

    This endpoint will:
    1. Create or find the user
    2. Generate a magic link token
    3. In a real app, send the link via email
    4. Return success message (for development)
    """
    # Find or create user
    stmt = select(User).where(User.email == request.email)
    result = await session.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        # Set a dummy password hash for compatibility - this is magic link auth
        dummy_password_hash = "magic_link_auth_no_password"
        user = User(email=request.email, password_hash=dummy_password_hash)
        session.add(user)
        await session.flush()

    # Generate secure token
    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(minutes=MAGIC_LINK_EXPIRE_MINUTES)

    # Create magic link
    magic_link = MagicLink(
        token=token,
        user_id=user.id,
        expires_at=expires_at
    )
    session.add(magic_link)
    await session.commit()

    # In development, return the magic link URL
    if settings.is_development:
        magic_url = f"http://localhost:9000/auth/verify?token={token}"
        return MagicLinkResponse(
            message="Magic link generated",
            magic_url=magic_url,
            expires_in_minutes=str(MAGIC_LINK_EXPIRE_MINUTES)
        )

    return MagicLinkResponse(message="Magic link sent to your email")


@router.post("/verify", response_model=TokenOut)
async def verify_magic_link(
    request: MagicLinkVerify, session: AsyncSession = Depends(get_session)
) -> TokenOut:
    """
    Verify a magic link token and return access token.
    """
    # Find magic link with user
    stmt = (
        select(MagicLink)
        .options(selectinload(MagicLink.user))
        .where(MagicLink.token == request.token)
    )
    result = await session.execute(stmt)
    magic_link = result.scalar_one_or_none()

    if not magic_link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid or expired magic link"
        )

    # Check if magic link is expired
    if magic_link.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Magic link has expired"
        )

    # Check if already used
    if magic_link.used:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Magic link has already been used"
        )

    # Mark as used
    magic_link.used = True
    await session.commit()

    # Generate JWT token (in a real app, use proper JWT library)
    # For now, we'll use the magic link token as a simple access token
    access_token = secrets.token_urlsafe(32)

    user_out = UserOut.model_validate(magic_link.user)

    return TokenOut(
        access_token=access_token,
        user=user_out
    )


# @router.get("/me", response_model=UserOut)
# async def get_current_user() -> UserOut:
#     """
#     Get current authenticated user.
#     """
#     # This is a placeholder - in a real app, you'd decode the JWT
#     # and fetch the user from the database
#     raise HTTPException(
#         status_code=status.HTTP_501_NOT_IMPLEMENTED,
#         detail="Not implemented yet"
#     )