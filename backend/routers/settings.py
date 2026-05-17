from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from ..database import get_db
from ..auth import get_current_user
from ..notifications import send_whatsapp

router = APIRouter()


class SettingsIn(BaseModel):
    notes_dir: str = ""
    whatsapp_number: str = ""
    callmebot_apikey: str = ""


@router.get("/settings")
def get_settings(user_id: int = Depends(get_current_user)):
    db = get_db()
    row = db.execute("SELECT * FROM settings WHERE user_id = ?", (user_id,)).fetchone()
    db.close()
    if not row:
        return {"notes_dir": "", "whatsapp_number": "", "callmebot_apikey": ""}
    return dict(row)


@router.post("/settings")
def save_settings(body: SettingsIn, user_id: int = Depends(get_current_user)):
    if body.notes_dir:
        path = Path(body.notes_dir.strip())
        if not path.exists():
            raise HTTPException(status_code=400, detail=f"Path does not exist: {path}")
    db = get_db()
    db.execute(
        "INSERT INTO settings (user_id, notes_dir, whatsapp_number, callmebot_apikey) VALUES (?, ?, ?, ?) "
        "ON CONFLICT(user_id) DO UPDATE SET "
        "notes_dir = excluded.notes_dir, "
        "whatsapp_number = excluded.whatsapp_number, "
        "callmebot_apikey = excluded.callmebot_apikey",
        (user_id, body.notes_dir.strip(), body.whatsapp_number.strip(), body.callmebot_apikey.strip()),
    )
    db.commit()
    db.close()
    return {"ok": True}


@router.post("/settings/test-whatsapp")
async def test_whatsapp(user_id: int = Depends(get_current_user)):
    db = get_db()
    row = db.execute("SELECT whatsapp_number, callmebot_apikey FROM settings WHERE user_id = ?", (user_id,)).fetchone()
    db.close()
    if not row or not row["whatsapp_number"] or not row["callmebot_apikey"]:
        raise HTTPException(status_code=400, detail="WhatsApp number and API key required in settings")
    try:
        await send_whatsapp(row["whatsapp_number"], row["callmebot_apikey"], "Quanta: WhatsApp test message ✓")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"ok": True}
