import asyncio
from datetime import date as DateType
from pathlib import Path
from .database import get_db

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "create_task",
            "description": (
                "Create a commitment (horizon: year or life — long-term pursuits) "
                "or an action (horizon: today/week/month/quarter — concrete near-term steps). "
                "For actions: ask for deadline if not provided. "
                "For commitments: deadline is optional. "
                "When extracting from journal/notes, infer horizon from context."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "title":   {"type": "string",  "description": "Clear, specific title"},
                    "notes":   {"type": "string",  "description": "Extra context or details"},
                    "deadline":{"type": "string",  "description": "Deadline as YYYY-MM-DDTHH:MM (optional for commitments)"},
                    "horizon": {
                        "type": "string",
                        "description": "Time horizon",
                        "enum": ["today", "week", "month", "quarter", "year", "life"],
                    },
                    "notify_whatsapp": {"type": "boolean", "description": "Send WhatsApp reminder at deadline"},
                },
                "required": ["title", "horizon"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_tasks",
            "description": "List the user's current open commitments and actions",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": (
                "Search the web for current information. Use when the user asks about "
                "recent events, facts, prices, news, or anything needing up-to-date data. "
                "Returns top results with title, URL, and snippet."
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
            "description": "Read a journal or note file by path",
            "parameters": {
                "type": "object",
                "properties": {
                    "date": {"type": "string", "description": "Date as YYYY-MM-DD for daily entries"},
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
                    "content":  {"type": "string", "description": "What to remember"},
                    "category": {"type": "string", "description": "goal | health | work | personal | general"},
                },
                "required": ["content"],
            },
        },
    },
]


async def _ddg_search(query: str, max_results: int = 5) -> list[dict]:
    """Run DuckDuckGo search in a thread (it's sync)."""
    def _run():
        from duckduckgo_search import DDGS
        with DDGS() as ddgs:
            return list(ddgs.text(query, max_results=max_results))
    try:
        return await asyncio.to_thread(_run)
    except Exception as e:
        return [{"error": str(e)}]


async def execute_tool(name: str, args: dict, user_id: int, notes_dir: Path = None) -> dict:

    if name == "create_task":
        db = get_db()
        db.execute(
            "INSERT INTO tasks (user_id, title, notes, deadline, horizon, notify_whatsapp) VALUES (?, ?, ?, ?, ?, ?)",
            (user_id, args["title"], args.get("notes", ""),
             args.get("deadline"), args.get("horizon", "week"),
             int(args.get("notify_whatsapp", False))),
        )
        db.commit()
        db.close()
        return {"created": args["title"], "horizon": args.get("horizon"), "deadline": args.get("deadline")}

    if name == "list_tasks":
        db = get_db()
        rows = db.execute(
            "SELECT title, horizon, deadline, notes FROM tasks WHERE user_id = ? AND done = 0 ORDER BY deadline ASC NULLS LAST",
            (user_id,),
        ).fetchall()
        db.close()
        return {"tasks": [dict(r) for r in rows]}

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
        nd = notes_dir or (Path.home() / "quanta-notes")
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
        nd = notes_dir or (Path.home() / "quanta-notes")
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

    return {"error": f"Unknown tool: {name}"}
