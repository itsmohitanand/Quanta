import secrets
import bcrypt
from fastapi import HTTPException, Header
from .database import get_db


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def create_session(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    db = get_db()
    db.execute("INSERT INTO sessions (token, user_id) VALUES (?, ?)", (token, user_id))
    db.commit()
    db.close()
    return token


async def get_current_user(authorization: str = Header(...)) -> int:
    token = authorization.removeprefix("Bearer ").strip()
    db = get_db()
    row = db.execute("SELECT user_id FROM sessions WHERE token = ?", (token,)).fetchone()
    db.close()
    if not row:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return row["user_id"]
