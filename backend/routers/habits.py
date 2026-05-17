from datetime import date
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from ..database import get_db
from ..auth import get_current_user

router = APIRouter()


class HabitIn(BaseModel):
    name: str


class HabitLogIn(BaseModel):
    habit_name: str
    done: bool


@router.get("/habits")
def list_habits(user_id: int = Depends(get_current_user)):
    db = get_db()
    today = str(date.today())
    habits = db.execute("SELECT name FROM habits WHERE user_id = ?", (user_id,)).fetchall()
    logs = db.execute(
        "SELECT habit_name, done FROM habit_logs WHERE user_id = ? AND date = ?", (user_id, today)
    ).fetchall()
    db.close()
    log_map = {r["habit_name"]: bool(r["done"]) for r in logs}
    return [{"name": h["name"], "done": log_map.get(h["name"], False)} for h in habits]


@router.post("/habits")
def create_habit(habit: HabitIn, user_id: int = Depends(get_current_user)):
    db = get_db()
    db.execute("INSERT OR IGNORE INTO habits (user_id, name) VALUES (?, ?)", (user_id, habit.name))
    db.commit()
    db.close()
    return {"ok": True}


@router.post("/habits/log")
def log_habit(log: HabitLogIn, user_id: int = Depends(get_current_user)):
    db = get_db()
    today = str(date.today())
    db.execute(
        "INSERT INTO habit_logs (user_id, habit_name, date, done) VALUES (?, ?, ?, ?) "
        "ON CONFLICT(user_id, habit_name, date) DO UPDATE SET done = excluded.done",
        (user_id, log.habit_name, today, int(log.done)),
    )
    db.commit()
    db.close()
    return {"ok": True}


@router.delete("/habits/{name}")
def delete_habit(name: str, user_id: int = Depends(get_current_user)):
    db = get_db()
    db.execute("DELETE FROM habits WHERE user_id = ? AND name = ?", (user_id, name))
    db.commit()
    db.close()
    return {"ok": True}
