import base64
import httpx
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from ..database import get_db
from ..ollama import OLLAMA_URL, MODEL

router = APIRouter()


def _user_from_token(token: str) -> int | None:
    db = get_db()
    row = db.execute(
        "SELECT user_id FROM sessions WHERE token = ?", (token,)
    ).fetchone()
    db.close()
    return row["user_id"] if row else None


@router.websocket("/ws/voice")
async def voice_ws(websocket: WebSocket, token: str = Query(...)):
    user_id = _user_from_token(token)
    if not user_id:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await websocket.accept()
    chunks: list[bytes] = []

    # ── Receive audio chunks until client sends "stop" ────────────────────
    try:
        while True:
            msg = await websocket.receive()
            if msg.get("bytes"):
                chunks.append(msg["bytes"])
            elif msg.get("text") == "stop":
                break
    except WebSocketDisconnect:
        return

    if not chunks:
        await websocket.send_json({"error": "No audio received"})
        try:
            await websocket.close()
        except Exception:
            pass
        return

    # ── Signal to client that we're now transcribing ──────────────────────
    await websocket.send_json({"status": "transcribing"})

    audio_b64 = base64.b64encode(b"".join(chunks)).decode()

    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            resp = await client.post(
                f"{OLLAMA_URL}/api/chat",
                json={
                    "model": MODEL,
                    "messages": [{
                        "role": "user",
                        "content": [
                            {"type": "audio", "audio": audio_b64},
                            {
                                "type": "text",
                                "text": (
                                    "Transcribe this audio exactly as spoken. "
                                    "Return only the spoken words — no explanation, "
                                    "no punctuation changes, nothing added."
                                ),
                            },
                        ],
                    }],
                    "stream": False,
                },
            )
            resp.raise_for_status()
            text = resp.json()["message"]["content"].strip()
        await websocket.send_json({"text": text})

    except Exception as exc:
        await websocket.send_json({"error": str(exc)})

    finally:
        try:
            await websocket.close()
        except Exception:
            pass
