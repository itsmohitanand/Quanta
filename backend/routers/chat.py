import json
from datetime import date
from pathlib import Path
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..database import get_db
from ..ollama import chat_with_tools, stream_chat
from ..auth import get_current_user
from ..tools import TOOLS, execute_tool

router = APIRouter()


class ChatRequest(BaseModel):
    message: str


def get_notes_dir_for_user(user_id: int) -> Path:
    db = get_db()
    row = db.execute(
        "SELECT s.notes_dir, u.username FROM settings s JOIN users u ON u.id = s.user_id WHERE s.user_id = ?",
        (user_id,),
    ).fetchone()
    if not row:
        user = db.execute("SELECT username FROM users WHERE id = ?", (user_id,)).fetchone()
        db.close()
        username = user["username"] if user else "default"
    else:
        db.close()
        if (row["notes_dir"] or "").strip():
            return Path(row["notes_dir"].strip())
        username = row["username"]
    return Path.home() / "Documents" / "engram" / f"engram-{username}-default"


def build_system_prompt(user_id: int) -> str:
    db = get_db()
    today = str(date.today())

    commitments = db.execute(
        "SELECT title FROM items WHERE user_id = ? AND type IN ('commitment','project') AND status != 'done' ORDER BY created_at DESC LIMIT 8",
        (user_id,),
    ).fetchall()
    actions = db.execute(
        "SELECT title, deadline FROM items WHERE user_id = ? AND type = 'action' AND status NOT IN ('done','someday') "
        "ORDER BY deadline ASC NULLS LAST LIMIT 10",
        (user_id,),
    ).fetchall()
    notes = db.execute(
        "SELECT content FROM notes WHERE user_id = ? ORDER BY created_at DESC LIMIT 15",
        (user_id,),
    ).fetchall()
    db.close()

    notes_dir = get_notes_dir_for_user(user_id)
    journal_today = ""
    for folder in ("daily",):
        p = notes_dir / folder / f"{today}.typ"
        if p.exists():
            try: journal_today = p.read_text().strip()
            except Exception: pass

    parts = [
        f"You are Quanta, a helpful life organiser and second brain. Today is {today}.",
        "You know this person through their journal, notes, commitments, and memory.",
        "Be friendly, conversational, and genuinely helpful. Keep responses concise unless detail is asked for.",
        "",
        "Tools — use them when relevant, without asking first:",
        "- Journal/notes mentioned → call list_journal_files or read_journal.",
        "- User wants to log something → call log_to_journal.",
        "- Current events, facts, prices → call web_search.",
        "- '@task …' or 'create a task/action/reminder' → call create_item (type='action'). Ask for deadline if none given.",
        "- '@aim …' or 'add an aim/goal/commitment' → call create_item (type='commitment', horizon='year' or 'life').",
        "- 'What are my tasks/items' → call list_items.",
        "- 'Plan my day/week', 'block time for X', 'schedule …' → call list_items to get IDs, then schedule_item for each block.",
        "",
        "Tone: warm, direct, supportive. Mention issues once — never lecture.",
        "",
    ]

    if commitments:
        parts.append("## Commitments")
        for c in commitments:
            parts.append(f"- {c['title']}")
        parts.append("")

    if actions:
        parts.append("## Open Actions")
        for t in actions:
            dl = f" — due {t['deadline'][:10]}" if t["deadline"] else ""
            parts.append(f"- {t['title']}{dl}")
        parts.append("")

    if notes:
        parts.append("## Memory")
        for n in notes:
            parts.append(f"- {n['content']}")
        parts.append("")

    if journal_today:
        parts.append("## Today's Journal")
        parts.append(journal_today)
        parts.append("")

    return "\n".join(parts)


@router.delete("/chat/history")
def clear_history(user_id: int = Depends(get_current_user)):
    db = get_db()
    db.execute("DELETE FROM messages WHERE user_id = ?", (user_id,))
    db.commit()
    db.close()
    return {"ok": True}


@router.get("/chat/history")
def get_history(user_id: int = Depends(get_current_user)):
    db = get_db()
    rows = db.execute(
        "SELECT role, content FROM messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 60",
        (user_id,),
    ).fetchall()
    db.close()
    return list(reversed([dict(r) for r in rows]))


@router.post("/chat")
async def chat(req: ChatRequest, user_id: int = Depends(get_current_user)):
    db = get_db()
    db.execute("INSERT INTO messages (user_id, role, content) VALUES (?, ?, ?)", (user_id, "user", req.message))
    db.commit()
    history = db.execute(
        "SELECT role, content FROM messages WHERE user_id = ? AND role != 'log' ORDER BY created_at DESC LIMIT 40",
        (user_id,),
    ).fetchall()
    db.close()

    system_prompt = build_system_prompt(user_id)
    notes_dir = get_notes_dir_for_user(user_id)

    messages = [{"role": "system", "content": system_prompt}]
    messages += [{"role": r["role"], "content": r["content"]} for r in reversed(history)]

    async def generate():
        working = messages.copy()

        # ── Tool loop (max 5 rounds) ───────────────────────────────────────────
        for _ in range(5):
            try:
                resp = await chat_with_tools(working, TOOLS)
            except Exception as e:
                yield f"data: {json.dumps({'tool': '__error__', 'error': str(e)})}\n\n"
                break

            msg = resp.get("message", {})
            tool_calls = msg.get("tool_calls") or []

            if not tool_calls:
                # No tool calls — proceed to streaming final response
                # Append assistant message to working context
                if msg.get("content"):
                    working.append({"role": "assistant", "content": msg["content"]})
                break

            # Append assistant's tool-call message
            working.append({
                "role": "assistant",
                "content": msg.get("content", ""),
                "tool_calls": tool_calls,
            })

            for tc in tool_calls:
                fn   = tc.get("function", {})
                name = fn.get("name", "")
                args = fn.get("arguments", {})
                if isinstance(args, str):
                    try: args = json.loads(args)
                    except Exception: args = {}

                result = await execute_tool(name, args, user_id, notes_dir)

                # Emit tool card to frontend
                yield f"data: {json.dumps({'tool': name, 'args': args, 'result': result})}\n\n"

                working.append({"role": "tool", "content": json.dumps(result)})

        # ── Stream final text response ─────────────────────────────────────────
        tokens: list[str] = []
        async for token in stream_chat(working):
            tokens.append(token)
            yield f"data: {json.dumps({'token': token})}\n\n"

        reply = "".join(tokens)

        # Save assistant reply
        conn = get_db()
        conn.execute("INSERT INTO messages (user_id, role, content) VALUES (?, ?, ?)", (user_id, "assistant", reply))

        # Extract memory block if present
        if "```memory" in reply:
            try:
                block = reply.split("```memory")[1].split("```")[0].strip()
                mem = json.loads(block)
                conn.execute(
                    "INSERT INTO notes (user_id, content, category) VALUES (?, ?, ?)",
                    (user_id, mem["note"], mem.get("category", "general")),
                )
            except Exception:
                pass

        conn.commit()
        conn.close()
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
