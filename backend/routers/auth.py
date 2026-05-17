from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ..database import get_db
from ..auth import hash_password, verify_password, create_session


def _bootstrap_user_dir(username: str) -> None:
    """Create ~/Documents/quanta-{username}-default with standard subfolders."""
    base = Path.home() / "Documents" / f"quanta-{username}-default"
    for sub in ("daily", "auto", "topics", "inbox"):
        (base / sub).mkdir(parents=True, exist_ok=True)

router = APIRouter()


class Credentials(BaseModel):
    username: str
    password: str


@router.post("/auth/register")
def register(creds: Credentials):
    db = get_db()
    if db.execute("SELECT id FROM users WHERE username = ?", (creds.username,)).fetchone():
        raise HTTPException(status_code=400, detail="Username already taken")
    db.execute(
        "INSERT INTO users (username, password_hash) VALUES (?, ?)",
        (creds.username, hash_password(creds.password)),
    )
    db.commit()
    user_id = db.execute("SELECT id FROM users WHERE username = ?", (creds.username,)).fetchone()["id"]
    db.close()
    _bootstrap_user_dir(creds.username)
    token = create_session(user_id)
    return {"token": token, "username": creds.username}


@router.post("/auth/login")
def login(creds: Credentials):
    db = get_db()
    row = db.execute("SELECT id, password_hash FROM users WHERE username = ?", (creds.username,)).fetchone()
    db.close()
    if not row or not verify_password(creds.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    _bootstrap_user_dir(creds.username)
    token = create_session(row["id"])
    return {"token": token, "username": creds.username}
