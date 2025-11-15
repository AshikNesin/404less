from __future__ import annotations

from fastapi import APIRouter, status
from sqlalchemy import delete, select

from app.api.deps import SessionDep, get_todo_or_404
from app.db.models import Todo
from app.schemas import TodoCreate, TodoOut, TodoUpdate

router = APIRouter(prefix="/todos", tags=["todos"], redirect_slashes=False)


@router.get("", response_model=list[TodoOut])
async def list_todos(session: SessionDep) -> list[Todo]:
    result = await session.execute(select(Todo).order_by(Todo.id))
    return result.scalars().all()


@router.post("", response_model=TodoOut, status_code=status.HTTP_201_CREATED)
async def create_todo(
    payload: TodoCreate,
    session: SessionDep,
) -> Todo:
    todo = Todo(title=payload.title)
    session.add(todo)
    await session.commit()
    await session.refresh(todo)
    return todo


@router.patch("/{todo_id}", response_model=TodoOut)
async def update_todo(
    todo_id: int,
    payload: TodoUpdate,
    session: SessionDep,
) -> Todo:
    todo = await get_todo_or_404(todo_id, session)
    if payload.title is not None:
        todo.title = payload.title
    if payload.completed is not None:
        todo.completed = payload.completed
    await session.commit()
    await session.refresh(todo)
    return todo


@router.delete("/{todo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_todo(
    todo_id: int,
    session: SessionDep,
) -> None:
    await get_todo_or_404(todo_id, session)
    await session.execute(delete(Todo).where(Todo.id == todo_id))
    await session.commit()
