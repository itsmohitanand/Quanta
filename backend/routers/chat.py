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
    row = db.execute("SELECT notes_dir FROM settings WHERE user_id = ?", (user_id,)).fetchone()
    db.close()
    raw = (row["notes_dir"] or "").strip() if row else ""
    return Path(raw) if raw else Path.home() / "quanta-notes"


def build_system_prompt(user_id: int) -> str:
    db = get_db()
    today = str(date.today())

    goals   = db.execute("SELECT title, description FROM goals WHERE user_id = ? ORDER BY priority DESC", (user_id,)).fetchall()
    notes   = db.execute("SELECT content FROM notes WHERE user_id = ? ORDER BY created_at DESC LIMIT 15", (user_id,)).fetchall()
    habits  = db.execute("SELECT name FROM habits WHERE user_id = ?", (user_id,)).fetchall()
    logs    = db.execute("SELECT habit_name, done FROM habit_logs WHERE user_id = ? AND date = ?", (user_id, today)).fetchall()
    tasks   = db.execute(
        "SELECT title, deadline FROM tasks WHERE user_id = ? AND done = 0 ORDER BY deadline ASC NULLS LAST LIMIT 10",
        (user_id,),
    ).fetchall()
    db.close()

    log_map = {r["habit_name"]: bool(r["done"]) for r in logs}

    # Try to read today's journal
    notes_dir = get_notes_dir_for_user(user_id)
    journal_today = ""
    journal_path = notes_dir / "daily" / f"{today}.typ"
    if journal_path.exists():
        try:
            journal_today = journal_path.read_text().strip()
        except Exception:
            pass

    parts = [
        f"You are Quanta — this person's life organiser and second brain. Today is {today}.",
        "You are not an assistant. You are not a chatbot. You are Quanta — you know this person deeply.",
        "You have full context: their journal, notes, commitments, actions, habits, and memory.",
        "",
        "TOOLS — use them immediately without asking permission:",
        "- Notes/journal referenced → call list_journal_files then read_journal. Never ask user to paste.",
        "- User asks about current events, news, facts, prices → call web_search immediately.",
        "- User says 'search for X' or 'look up X' → call web_search.",
        "- User says 'create a task/commitment/reminder' → call create_task. Ask for deadline only for actions, not commitments.",
        "- User says 'what are my tasks' → call list_tasks.",
        "NEVER say 'I cannot access' or 'as an AI'. You have tools. Use them.",
        "",
        "TASK CREATION RULES:",
        "- Commitment (year/life horizon): deadline optional — create immediately when requested.",
        "- Action (today/week/month/quarter): ask for deadline if not given, then create.",
        "- Extract from journal/notes: read files first, then create_task for each item found.",
        "",
        "Tone: direct, honest, warm but firm. Name avoidance when you see it. Never give ultimatums, never threaten, never lecture repeatedly.",
        "If a pattern is clear (like procrastination), name it once clearly and move to practical next steps. Don't moralize.",
        "",
    ]

    if goals:
        parts.append("## Goals")
        for g in goals:
            parts.append(f"- {g['title']}: {g['description']}")
        parts.append("")

    if habits:
        parts.append("## Today's Habits")
        for h in habits:
            status = "✓" if log_map.get(h["name"]) else "✗"
            parts.append(f"- [{status}] {h['name']}")
        parts.append("")

    if tasks:
        parts.append("## Current Tasks")
        for t in tasks:
            dl = f" — due {t['deadline']}" if t["deadline"] else ""
            parts.append(f"- {t['title']}{dl}")
        parts.append("")

    if notes:
        parts.append("## Memory")
        for n in notes:
            parts.append(f"- {n['content']}")
        parts.append("")

    if journal_today:
        parts.append(f"## Today's Journal")
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
        "SELECT role, content FROM messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 40",
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
