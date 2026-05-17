from fastapi import APIRouter, Depends
from pydantic import BaseModel
from ..database import get_db
from ..auth import get_current_user

router = APIRouter()


class NoteIn(BaseModel):
    content: str
    category: str = "general"


@router.get("/notes")
def list_notes(user_id: int = Depends(get_current_user)):
    db = get_db()
    rows = db.execute(
        "SELECT * FROM notes WHERE user_id = ? ORDER BY created_at DESC LIMIT 50", (user_id,)
    ).fetchall()
    db.close()
    return [dict(r) for r in rows]


@router.post("/notes")
def create_note(note: NoteIn, user_id: int = Depends(get_current_user)):
    db = get_db()
    db.execute(
        "INSERT INTO notes (user_id, content, category) VALUES (?, ?, ?)",
        (user_id, note.content, note.category),
    )
    db.commit()
    db.close()
    return {"ok": True}


@router.delete("/notes/{note_id}")
def delete_note(note_id: int, user_id: int = Depends(get_current_user)):
    db = get_db()
    db.execute("DELETE FROM notes WHERE id = ? AND user_id = ?", (note_id, user_id))
    db.commit()
    db.close()
    return {"ok": True}
