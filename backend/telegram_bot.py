"""
Engram — Quanta's Telegram bot.

Admin sets ONE bot token via env var ENGRAM_TOKEN (or in .env).
No restart needed — the loop runs continuously.

Users link their account by messaging the bot privately:
  /link <quanta-username> <password>

In a group chat (mention @engram or use /commands):
  @engram log: <text>             → today's journal
  @engram remind <task> at <t>   → create a task
  @engram tasks                  → list open tasks
  @engram help                   → command list
"""
import asyncio
import json
import os
from datetime import datetime
from pathlib import Path

import httpx

from .database import get_db
from .auth import verify_password
from .ollama import chat_once


# ── Config ────────────────────────────────────────────────────────────────────

def get_token() -> str | None:
    """Global bot token from env var — set once by admin."""
    return os.environ.get("ENGRAM_TOKEN", "").strip() or None


# ── Telegram API ──────────────────────────────────────────────────────────────

async def tg_get(token: str, method: str, **params):
    async with httpx.AsyncClient(timeout=35) as client:
        r = await client.get(
            f"https://api.telegram.org/bot{token}/{method}", params=params
        )
        return r.json()


async def tg_post(token: str, method: str, **data):
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.post(
            f"https://api.telegram.org/bot{token}/{method}", json=data
        )
        return r.json()


async def send(token: str, chat_id, text: str):
    await tg_post(token, "sendMessage",
                  chat_id=chat_id, text=text, parse_mode="Markdown")


# ── User mapping ──────────────────────────────────────────────────────────────

def get_user_id_for_tg(telegram_id: str) -> int | None:
    db = get_db()
    row = db.execute(
        "SELECT user_id FROM telegram_contacts WHERE telegram_id = ? AND user_id IS NOT NULL",
        (str(telegram_id),)
    ).fetchone()
    db.close()
    return row["user_id"] if row else None


def link_account(telegram_id: str, username: str, telegram_username: str | None) -> bool:
    """Link a Telegram user_id to a Quanta user after verifying credentials."""
    db = get_db()
    row = db.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if not row:
        db.close()
        return False
    user_id = row["id"]
    db.execute(
        "INSERT INTO telegram_contacts (telegram_id, username, user_id) VALUES (?, ?, ?) "
        "ON CONFLICT(telegram_id) DO UPDATE SET user_id = excluded.user_id, username = excluded.username",
        (str(telegram_id), telegram_username or username, user_id)
    )
    db.commit()
    db.close()
    return True


def get_username(user_id: int) -> str:
    db = get_db()
    row = db.execute("SELECT username FROM users WHERE id = ?", (user_id,)).fetchone()
    db.close()
    return row["username"] if row else "unknown"


def get_notes_dir(user_id: int) -> Path:
    db = get_db()
    row = db.execute("SELECT notes_dir FROM settings WHERE user_id = ?", (user_id,)).fetchone()
    user = db.execute("SELECT username FROM users WHERE id = ?", (user_id,)).fetchone()
    db.close()
    raw = (row["notes_dir"] or "").strip() if row else ""
    if raw:
        return Path(raw)
    uname = user["username"] if user else "default"
    return Path.home() / "Documents" / f"quanta-{uname}-default"


# ── Handlers ──────────────────────────────────────────────────────────────────

async def handle_link(token, chat_id, telegram_id: str, tg_username: str | None, args: str):
    """Link Telegram account to Quanta. Usage: /link username password"""
    parts = args.strip().split(None, 1)
    if len(parts) < 2:
        await send(token, chat_id,
                   "Usage: `/link <quanta-username> <password>`\n\nExample:\n`/link mohit.anand mypassword`")
        return
    username, password = parts
    db = get_db()
    row = db.execute("SELECT id, password_hash FROM users WHERE username = ?", (username,)).fetchone()
    db.close()
    if not row or not verify_password(password, row["password_hash"]):
        await send(token, chat_id, "❌ Invalid username or password.")
        return
    link_account(str(telegram_id), username, tg_username)
    await send(token, chat_id,
               f"✅ Linked to *{username}*.\n\nYou can now use Engram in your group chat.")


def _append_auto(notes_dir: Path, source: str, line: str):
    """Append a timestamped entry to auto/YYYY-MM-DD.typ."""
    today    = datetime.now().strftime("%Y-%m-%d")
    time_str = datetime.now().strftime("%H:%M")
    path = notes_dir / "auto" / f"{today}.typ"
    path.parent.mkdir(parents=True, exist_ok=True)

    # Create file with date header if new
    if not path.exists():
        path.write_text(f"= Auto Log — {today}\n\n")

    with path.open("a") as f:
        f.write(f"+ [{time_str} · {source}] {line}\n")

    return today, time_str


async def handle_log(token, chat_id, user_id: int, entry: str):
    notes_dir = get_notes_dir(user_id)
    today, time_str = _append_auto(notes_dir, "Telegram", entry)
    await send(token, chat_id, f"📓 Logged to `auto/{today}` at {time_str}")


async def handle_remind(token, chat_id, user_id: int, text: str):
    prompt = (
        'Extract a task from this message. Return ONLY JSON: {"title": "...", "deadline": "YYYY-MM-DDTHH:MM or null"}\n\n'
        f"Message: {text}"
    )
    raw = await chat_once([{"role": "user", "content": prompt}])
    try:
        data = json.loads(raw[raw.index("{"):raw.rindex("}")+1])
        db = get_db()
        db.execute(
            "INSERT INTO tasks (user_id, title, deadline, horizon) VALUES (?, ?, ?, ?)",
            (user_id, data["title"], data.get("deadline"), "week"),
        )
        db.commit()
        db.close()
        dl_str = data['deadline'][:16].replace('T',' ') if data.get("deadline") else "no deadline"
        notes_dir = get_notes_dir(user_id)
        _append_auto(notes_dir, "Telegram", f"Task created: \"{data['title']}\" — {dl_str}")
        dl = f"\nDue: `{dl_str}`" if data.get("deadline") else ""
        await send(token, chat_id, f"📌 *{data['title']}*{dl}")
    except Exception:
        await send(token, chat_id, "❌ Couldn't parse that. Try: `remind call doctor tomorrow 9am`")


async def handle_tasks(token, chat_id, user_id: int):
    db = get_db()
    rows = db.execute(
        "SELECT title, deadline FROM tasks WHERE user_id = ? AND done = 0 "
        "ORDER BY deadline ASC NULLS LAST LIMIT 10", (user_id,)
    ).fetchall()
    db.close()
    if not rows:
        await send(token, chat_id, "✅ No open tasks.")
        return
    lines = ["*Open tasks:*"]
    for t in rows:
        dl = f" — `{t['deadline'][:16].replace('T',' ')}`" if t["deadline"] else ""
        lines.append(f"• {t['title']}{dl}")
    await send(token, chat_id, "\n".join(lines))


async def handle_general(token, chat_id, user_id: int, text: str):
    db = get_db()
    history = db.execute(
        "SELECT role, content FROM messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 10",
        (user_id,)
    ).fetchall()
    db.close()
    msgs = [{"role": r["role"], "content": r["content"]} for r in reversed(history)]
    msgs.append({"role": "user", "content": text})
    reply = await chat_once(msgs)
    db = get_db()
    db.execute("INSERT INTO messages (user_id, role, content) VALUES (?, ?, ?)", (user_id, "user", text))
    db.execute("INSERT INTO messages (user_id, role, content) VALUES (?, ?, ?)", (user_id, "assistant", reply))
    db.commit()
    db.close()
    await send(token, chat_id, reply[:4000])


async def handle_help(token, chat_id, linked: bool):
    if not linked:
        await send(token, chat_id,
                   "*Engram — Quanta's second brain*\n\n"
                   "First, link your account:\n"
                   "`/link <quanta-username> <password>`\n\n"
                   "Then use these commands in the group:")
        return
    await send(token, chat_id,
               "*Engram commands:*\n"
               "`log: <text>` — add to today's journal\n"
               "`remind <task> at <time>` — create a reminder\n"
               "`tasks` — list open tasks\n"
               "Or just ask anything.")


# ── Router ────────────────────────────────────────────────────────────────────

async def route(token, chat_id, telegram_id: str, tg_username: str | None, text: str):
    t  = text.strip()
    tl = t.lower()

    # /link works without being linked
    if tl.startswith("/link"):
        await handle_link(token, chat_id, telegram_id, tg_username, t[5:].strip())
        return

    user_id = get_user_id_for_tg(telegram_id)

    if not user_id:
        await send(token, chat_id,
                   "I don't know who you are yet.\n"
                   "Message me privately: `/link <username> <password>`")
        return

    if tl.startswith("log:"):
        await handle_log(token, chat_id, user_id, t[4:].strip())
    elif tl.startswith("/log"):
        await handle_log(token, chat_id, user_id, t[4:].strip())
    elif tl.startswith("remind") or tl.startswith("/remind"):
        await handle_remind(token, chat_id, user_id, t)
    elif tl in ("tasks", "/tasks"):
        await handle_tasks(token, chat_id, user_id)
    elif tl in ("help", "/help", "/start"):
        await handle_help(token, chat_id, linked=True)
    else:
        await handle_general(token, chat_id, user_id, t)


# ── Polling loop ──────────────────────────────────────────────────────────────

async def telegram_polling_loop():
    offset = 0
    last_token: str | None = None
    bot_username: str | None = None

    while True:
        await asyncio.sleep(3)
        token = get_token()
        if not token:
            await asyncio.sleep(30)
            continue

        # Reset if token changed
        if token != last_token:
            last_token = token
            bot_username = None
            offset = 0

        try:
            if not bot_username:
                me = await tg_get(token, "getMe")
                bot_username = "@" + (me.get("result", {}).get("username") or "")

            data   = await tg_get(token, "getUpdates", offset=offset, timeout=28)
            updates = data.get("result", [])

            for upd in updates:
                offset = upd["update_id"] + 1
                msg    = upd.get("message") or {}
                if not msg:
                    continue

                text     = msg.get("text", "").strip()
                chat_id  = str(msg.get("chat", {}).get("id", ""))
                is_group = msg.get("chat", {}).get("type") in ("group", "supergroup")
                sender   = msg.get("from", {})
                tg_id    = str(sender.get("id", ""))
                tg_user  = sender.get("username")

                # Auto-record contact
                if tg_id and tg_user:
                    db = get_db()
                    try:
                        db.execute(
                            "INSERT INTO telegram_contacts (telegram_id, username) VALUES (?, ?) "
                            "ON CONFLICT(telegram_id) DO UPDATE SET username = excluded.username",
                            (tg_id, tg_user)
                        )
                        db.commit()
                    except Exception:
                        pass
                    db.close()

                # Groups: only respond to @mentions or /commands
                if is_group:
                    if bot_username and bot_username.lower() in text.lower():
                        text = text.replace(bot_username, "").replace(
                               bot_username.lower(), "").strip()
                    elif not text.startswith("/"):
                        continue

                if text and tg_id:
                    await route(token, chat_id, tg_id, tg_user, text)

        except Exception as e:
            print(f"[Engram] {e}")
            await asyncio.sleep(10)
