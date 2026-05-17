import json
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from ..database import get_db
from ..auth import get_current_user
from ..ollama import chat_once

router = APIRouter()

TEXT_SUFFIXES = {".typ", ".md", ".txt"}


def _default_notes_dir(user_id: int) -> Path:
    """~/Documents/quanta-{username}-default, created if missing."""
    db = get_db()
    user = db.execute("SELECT username FROM users WHERE id = ?", (user_id,)).fetchone()
    db.close()
    username = user["username"] if user else "default"
    return Path.home() / "Documents" / f"quanta-{username}-default"


def get_notes_dir(user_id: int) -> Path:
    db = get_db()
    row = db.execute("SELECT notes_dir FROM settings WHERE user_id = ?", (user_id,)).fetchone()
    db.close()

    raw = (row["notes_dir"] or "").strip() if row else ""
    path = Path(raw) if raw else _default_notes_dir(user_id)

    path.mkdir(parents=True, exist_ok=True)
    (path / "daily").mkdir(exist_ok=True)
    return path


class JournalEntry(BaseModel):
    content: str


def safe_path(notes_dir: Path, rel: str) -> Path:
    full = (notes_dir / rel).resolve()
    if not str(full).startswith(str(notes_dir.resolve())):
        raise HTTPException(status_code=400, detail="Invalid path")
    return full


@router.get("/journal/files")
def list_files(user_id: int = Depends(get_current_user)):
    notes_dir = get_notes_dir(user_id)
    tree = {}
    for folder in sorted(notes_dir.iterdir()):
        if not folder.is_dir() or folder.name.startswith("."):
            continue
        files = sorted(
            [f.name for f in folder.iterdir() if f.suffix in TEXT_SUFFIXES],
            reverse=True,
        )
        tree[folder.name] = files  # include empty folders too
    return {"root": str(notes_dir), "tree": tree}


@router.post("/journal/folder")
def create_folder(body: dict, user_id: int = Depends(get_current_user)):
    notes_dir = get_notes_dir(user_id)
    name = body.get("name", "").strip().strip("/")
    if not name or "/" in name or name.startswith("."):
        raise HTTPException(status_code=400, detail="Invalid folder name")
    (notes_dir / name).mkdir(exist_ok=True)
    return {"ok": True}


@router.get("/journal/read")
def read_file(path: str = Query(...), user_id: int = Depends(get_current_user)):
    notes_dir = get_notes_dir(user_id)
    full = safe_path(notes_dir, path)
    if not full.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return {"content": full.read_text(), "path": path}


@router.post("/journal/write")
def write_file(body: JournalEntry, path: str = Query(...), user_id: int = Depends(get_current_user)):
    notes_dir = get_notes_dir(user_id)
    full = safe_path(notes_dir, path)
    full.parent.mkdir(parents=True, exist_ok=True)
    full.write_text(body.content)
    return {"ok": True}


@router.get("/journal/{date}")
def read_journal(date: str, user_id: int = Depends(get_current_user)):
    notes_dir = get_notes_dir(user_id)
    path = notes_dir / "daily" / f"{date}.typ"
    if not path.exists():
        raise HTTPException(status_code=404, detail="No entry for this date")
    return {"content": path.read_text()}


@router.post("/journal/{date}")
def write_journal(date: str, body: JournalEntry, user_id: int = Depends(get_current_user)):
    notes_dir = get_notes_dir(user_id)
    path = notes_dir / "daily" / f"{date}.typ"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body.content)
    return {"ok": True}


@router.post("/journal/{date}/extract")
async def extract_journal(date: str, user_id: int = Depends(get_current_user)):
    notes_dir = get_notes_dir(user_id)
    path = notes_dir / "daily" / f"{date}.typ"
    if not path.exists():
        raise HTTPException(status_code=404, detail="No entry for this date")

    text = path.read_text()
    prompt = f"""Extract structured data from this journal entry. Return ONLY valid JSON, no explanation.

Format:
{{
  "goals": [{{"title": "...", "description": "...", "priority": 2}}],
  "habits": ["habit1", "habit2"],
  "notes": [{{"content": "...", "category": "goal|health|work|personal"}}]
}}

Priority: 3 = urgent/important, 2 = medium, 1 = low.
Only extract things explicitly mentioned. Empty arrays if nothing found.

Journal:
{text}"""

    response = await chat_once([{"role": "user", "content": prompt}])

    try:
        if "```json" in response:
            json_str = response.split("```json")[1].split("```")[0].strip()
        elif "```" in response:
            json_str = response.split("```")[1].split("```")[0].strip()
        else:
            json_str = response.strip()
        data = json.loads(json_str)
    except Exception:
        raise HTTPException(status_code=500, detail="Could not parse model response")

    db = get_db()
    goals_added = notes_added = 0

    for g in data.get("goals", []):
        exists = db.execute(
            "SELECT id FROM goals WHERE user_id = ? AND title = ?", (user_id, g["title"])
        ).fetchone()
        if not exists:
            db.execute(
                "INSERT INTO goals (user_id, title, description, priority) VALUES (?, ?, ?, ?)",
                (user_id, g["title"], g.get("description", ""), g.get("priority", 1)),
            )
            goals_added += 1

    habits_before = db.execute("SELECT COUNT(*) as c FROM habits WHERE user_id = ?", (user_id,)).fetchone()["c"]
    for h in data.get("habits", []):
        db.execute("INSERT OR IGNORE INTO habits (user_id, name) VALUES (?, ?)", (user_id, h))
    habits_after = db.execute("SELECT COUNT(*) as c FROM habits WHERE user_id = ?", (user_id,)).fetchone()["c"]
    habits_added = habits_after - habits_before

    for n in data.get("notes", []):
        db.execute(
            "INSERT INTO notes (user_id, content, category) VALUES (?, ?, ?)",
            (user_id, n["content"], n.get("category", "general")),
        )
        notes_added += 1

    db.commit()
    db.close()
    return {"goals_added": goals_added, "habits_added": habits_added, "notes_added": notes_added}
