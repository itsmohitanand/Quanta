from fastapi import APIRouter, Depends
from pydantic import BaseModel
from ..database import get_db
from ..auth import get_current_user

router = APIRouter()


class GoalIn(BaseModel):
    title: str
    description: str = ""
    priority: int = 1


@router.get("/goals")
def list_goals(user_id: int = Depends(get_current_user)):
    db = get_db()
    rows = db.execute(
        "SELECT * FROM goals WHERE user_id = ? ORDER BY priority DESC", (user_id,)
    ).fetchall()
    db.close()
    return [dict(r) for r in rows]


@router.post("/goals")
def create_goal(goal: GoalIn, user_id: int = Depends(get_current_user)):
    db = get_db()
    db.execute(
        "INSERT INTO goals (user_id, title, description, priority) VALUES (?, ?, ?, ?)",
        (user_id, goal.title, goal.description, goal.priority),
    )
    db.commit()
    db.close()
    return {"ok": True}


@router.delete("/goals/{goal_id}")
def delete_goal(goal_id: int, user_id: int = Depends(get_current_user)):
    db = get_db()
    db.execute("DELETE FROM goals WHERE id = ? AND user_id = ?", (goal_id, user_id))
    db.commit()
    db.close()
    return {"ok": True}
