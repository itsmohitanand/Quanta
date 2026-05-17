from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from ..database import get_db
from ..auth import get_current_user

router = APIRouter()

GOAL_HORIZONS = {"year", "life"}


class TaskIn(BaseModel):
    title: str
    notes: str = ""
    deadline: Optional[str] = None
    horizon: str = "week"          # today|week|month|quarter|year|life
    notify_whatsapp: bool = False


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    notes: Optional[str] = None
    deadline: Optional[str] = None
    horizon: Optional[str] = None
    done: Optional[bool] = None
    notify_whatsapp: Optional[bool] = None


@router.get("/tasks")
def list_tasks(user_id: int = Depends(get_current_user)):
    db = get_db()
    rows = db.execute(
        "SELECT * FROM tasks WHERE user_id = ? ORDER BY done ASC, deadline ASC NULLS LAST, created_at DESC",
        (user_id,),
    ).fetchall()
    db.close()
    return [dict(r) for r in rows]


@router.post("/tasks")
def create_task(task: TaskIn, user_id: int = Depends(get_current_user)):
    db = get_db()
    cur = db.execute(
        "INSERT INTO tasks (user_id, title, notes, deadline, horizon, notify_whatsapp) VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, task.title, task.notes, task.deadline, task.horizon, int(task.notify_whatsapp)),
    )
    task_id = cur.lastrowid
    db.commit()
    row = db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    db.close()
    return dict(row)


@router.patch("/tasks/{task_id}")
def update_task(task_id: int, update: TaskUpdate, user_id: int = Depends(get_current_user)):
    db = get_db()
    fields = {}
    if update.title   is not None: fields["title"]   = update.title
    if update.notes   is not None: fields["notes"]   = update.notes
    if update.deadline is not None: fields["deadline"] = update.deadline
    if update.horizon  is not None: fields["horizon"]  = update.horizon
    if update.done    is not None: fields["done"]    = int(update.done)
    if update.notify_whatsapp is not None:
        fields["notify_whatsapp"] = int(update.notify_whatsapp)
        if update.notify_whatsapp:
            fields["notified"] = 0

    if fields:
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        db.execute(
            f"UPDATE tasks SET {set_clause} WHERE id = ? AND user_id = ?",
            (*fields.values(), task_id, user_id),
        )
        db.commit()
    row = db.execute("SELECT * FROM tasks WHERE id = ? AND user_id = ?", (task_id, user_id)).fetchone()
    db.close()
    return dict(row) if row else {"ok": True}


@router.delete("/tasks/{task_id}")
def delete_task(task_id: int, user_id: int = Depends(get_current_user)):
    db = get_db()
    db.execute("DELETE FROM tasks WHERE id = ? AND user_id = ?", (task_id, user_id))
    db.commit()
    db.close()
    return {"ok": True}
