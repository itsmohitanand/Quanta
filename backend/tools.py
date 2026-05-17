import asyncio
from datetime import date as DateType, datetime
from pathlib import Path
from .database import get_db

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "create_item",
            "description": (
                "Create an item in the user's organiser.\n"
                "Types:\n"
                "  'action'     — a single concrete step (near-term). Ask for deadline if not given.\n"
                "  'project'    — a multi-step outcome with child actions.\n"
                "  'commitment' — a long-term pursuit (horizon: year or life). Deadline optional.\n"
                "Triggered by: '@task …', '@aim …', 'create a task', 'add a reminder', etc.\n"
                "For actions: ask for deadline if none provided.\n"
                "For commitments/projects: no deadline needed unless user specifies."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "type": {
                        "type": "string",
                        "enum": ["action", "project", "commitment"],
                        "description": "Item type",
                    },
                    "title": {"type": "string", "description": "Clear, specific title"},
                    "description": {"type": "string", "description": "Extra context or notes"},
                    "parent_id": {
                        "type": "integer",
                        "description": "Parent item id — use when this action belongs under a project or commitment",
                    },
                    "status": {
                        "type": "string",
                        "enum": ["backlog", "todo", "in_progress", "waiting", "done", "someday"],
                        "description": "Default: todo",
                    },
                    "horizon": {
                        "type": "string",
                        "enum": ["today", "week", "month", "quarter", "year", "life", "anytime"],
                    },
                    "deadline": {
                        "type": "string",
                        "description": "Deadline as YYYY-MM-DDTHH:MM (optional for commitments)",
                    },
                    "notify_whatsapp": {
                        "type": "boolean",
                        "description": "Send WhatsApp reminder at deadline",
                    },
                },
                "required": ["type", "title", "horizon"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_items",
            "description": "List the user's items. Filter by type, status, or horizon.",
            "parameters": {
                "type": "object",
                "properties": {
                    "type": {
                        "type": "string",
                        "description": "action | project | commitment",
                    },
                    "status": {
                        "type": "string",
                        "description": "backlog | todo | in_progress | waiting | done | someday",
                    },
                    "horizon": {
                        "type": "string",
                        "description": "today | week | month | quarter | year | life | anytime",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": (
                "Search the web for current information. Use when the user asks about "
                "recent events, facts, prices, news, or anything needing up-to-date data."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query — be specific"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_journal_files",
            "description": "List all journal and note files available",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_journal",
            "description": "Read a journal or note file by date",
            "parameters": {
                "type": "object",
                "properties": {
                    "date": {"type": "string", "description": "Date as YYYY-MM-DD"},
                },
                "required": ["date"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "save_note",
            "description": "Save something important to memory",
            "parameters": {
                "type": "object",
                "properties": {
                    "content":  {"type": "string"},
                    "category": {"type": "string", "description": "goal | health | work | personal | general"},
                },
                "required": ["content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "schedule_item",
            "description": (
                "Block time for an item on the calendar by setting its scheduled start and end. "
                "Use when planning a day or week. "
                "Prefer 90–120 min blocks for deep work, 25–45 min for lighter tasks. "
                "Don't schedule before 07:00 or after 22:00 unless the user asks. "
                "Always call list_items first to get item IDs before scheduling."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "item_id":         {"type": "integer", "description": "ID of the item to schedule"},
                    "scheduled_start": {"type": "string",  "description": "Start as YYYY-MM-DDTHH:MM"},
                    "scheduled_end":   {"type": "string",  "description": "End as YYYY-MM-DDTHH:MM"},
                },
                "required": ["item_id", "scheduled_start", "scheduled_end"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "log_to_journal",
            "description": (
                "Write a timestamped entry to the user's auto journal. "
                "Use when the user says something worth logging — a reflection, "
                "what they did, how they feel."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "The entry text to log"},
                },
                "required": ["text"],
            },
        },
    },
]


async def _ddg_search(query: str, max_results: int = 5) -> list[dict]:
    def _run():
        from duckduckgo_search import DDGS
        with DDGS() as ddgs:
            return list(ddgs.text(query, max_results=max_results))
    try:
        return await asyncio.to_thread(_run)
    except Exception as e:
        return [{"error": str(e)}]


def _user_notes_dir(user_id: int) -> Path:
    db = get_db()
    user = db.execute("SELECT username FROM users WHERE id = ?", (user_id,)).fetchone()
    db.close()
    username = user["username"] if user else "default"
    return Path.home() / "Documents" / "engram" / f"engram-{username}-default"


async def execute_tool(name: str, args: dict, user_id: int, notes_dir: Path = None) -> dict:

    if name == "create_item":
        db = get_db()
        db.execute(
            """INSERT INTO items
               (user_id, type, title, description, parent_id, status, horizon, deadline, notify_whatsapp)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                user_id,
                args.get("type", "action"),
                args["title"],
                args.get("description", ""),
                args.get("parent_id"),
                args.get("status", "todo"),
                args.get("horizon", "week"),
                args.get("deadline"),
                int(args.get("notify_whatsapp", False)),
            ),
        )
        db.commit()
        db.close()
        return {
            "created": args["title"],
            "type": args.get("type", "action"),
            "horizon": args.get("horizon"),
            "deadline": args.get("deadline"),
        }

    if name == "list_items":
        db = get_db()
        query = (
            "SELECT title, type, horizon, deadline, status, description "
            "FROM items WHERE user_id = ? AND status NOT IN ('done','someday')"
        )
        params: list = [user_id]
        if args.get("type"):
            query += " AND type = ?"
            params.append(args["type"])
        if args.get("status"):
            query = query.replace("status NOT IN ('done','someday')", "status = ?")
            params.append(args["status"])
        if args.get("horizon"):
            query += " AND horizon = ?"
            params.append(args["horizon"])
        rows = db.execute(query + " ORDER BY deadline ASC NULLS LAST", params).fetchall()
        db.close()
        return {"items": [dict(r) for r in rows]}

    if name == "web_search":
        query = args.get("query", "")
        raw = await _ddg_search(query)
        if raw and "error" in raw[0]:
            return {"error": raw[0]["error"], "query": query}
        results = [
            {"title": r.get("title", ""), "url": r.get("href", ""), "snippet": r.get("body", "")[:400]}
            for r in raw if r.get("title")
        ]
        return {"query": query, "results": results}

    if name == "list_journal_files":
        nd = notes_dir or _user_notes_dir(user_id)
        if not nd.exists():
            return {"files": []}
        files = []
        for folder in sorted(nd.iterdir()):
            if not folder.is_dir() or folder.name.startswith("."):
                continue
            for f in sorted(folder.iterdir(), reverse=True):
                if f.suffix in {".typ", ".md", ".txt"}:
                    files.append(f"{folder.name}/{f.name}")
        return {"files": files}

    if name == "read_journal":
        date_str = args.get("date", str(DateType.today()))
        nd = notes_dir or _user_notes_dir(user_id)
        path = nd / "daily" / f"{date_str}.typ"
        if path.exists():
            return {"date": date_str, "content": path.read_text()}
        return {"error": f"No journal entry for {date_str}"}

    if name == "save_note":
        db = get_db()
        db.execute(
            "INSERT INTO notes (user_id, content, category) VALUES (?, ?, ?)",
            (user_id, args["content"], args.get("category", "general")),
        )
        db.commit()
        db.close()
        return {"saved": args["content"]}

    if name == "log_to_journal":
        nd = notes_dir or _user_notes_dir(user_id)
        now      = datetime.now()
        today    = now.strftime("%Y-%m-%d")
        time_str = now.strftime("%H:%M")
        path = nd / "auto" / f"{today}.typ"
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            path.write_text(
                f"= Auto Log — {today}\n\n"
                f"#set text(font: \"New Computer Modern\", size: 11pt)\n\n"
            )
        with path.open("a") as f:
            f.write(f"+ [{time_str} · Chat] {args['text']}\n")
        return {"logged": True, "file": f"auto/{today}.typ", "time": time_str}

    if name == "schedule_item":
        item_id = args.get("item_id")
        start   = args.get("scheduled_start")
        end     = args.get("scheduled_end")
        if not item_id or not start:
            return {"error": "item_id and scheduled_start required"}
        db = get_db()
        db.execute(
            "UPDATE items SET scheduled_start = ?, scheduled_end = ? WHERE id = ? AND user_id = ?",
            (start, end, item_id, user_id),
        )
        db.execute(
            "INSERT INTO item_events (user_id, item_id, event, detail) VALUES (?, ?, 'scheduled', ?)",
            (user_id, item_id, f"{start} – {end or '?'}"),
        )
        db.commit()
        row = db.execute("SELECT title FROM items WHERE id = ?", (item_id,)).fetchone()
        db.close()
        return {"scheduled": row["title"] if row else item_id, "start": start, "end": end}

    return {"error": f"Unknown tool: {name}"}
