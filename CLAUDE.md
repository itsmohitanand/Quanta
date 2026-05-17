# Quanta — Agent Guide

## Scope

**Work only in `backend/` and `webapp/`.** Never read, edit, or reason about `swiftapp/` unless explicitly asked. The Swift wrapper is out of scope.

---

## Knowledge Graph

### Entry Points

```
run.sh → uvicorn backend.main:app
backend/main.py
  ├── startup: init_db() + notification_loop() + telegram_polling_loop()
  ├── routers: auth, chat, journal, reflection, tasks, notes, settings
  └── static mount: /  → webapp/
```

### Backend Modules

```
backend/
├── main.py           — FastAPI app, startup tasks, router registration
├── database.py       — get_db() / init_db() — SQLite at quanta.db
├── auth.py           — hash_password, verify_password, create_session, get_current_user (Bearer dep)
├── ollama.py         — Ollama HTTP client (localhost:11434, model: gemma4)
│                         chat_with_tools()  — single call, returns tool_calls
│                         chat_once()        — single non-streaming call
│                         stream_chat()      — async token stream
├── tools.py          — TOOLS list (Ollama function schema) + execute_tool() dispatcher
│                         tools: create_task, list_tasks, web_search,
│                                list_journal_files, read_journal, save_note, log_to_journal
├── notifications.py  — WhatsApp via CallMeBot API; polls every 5 min for overdue tasks
└── telegram_bot.py   — Engram bot; long-poll loop; commands: /link, log:, remind, tasks, help
```

### Routers → Endpoints

```
routers/auth.py        POST /api/auth/register   POST /api/auth/login
routers/chat.py        POST /api/chat (SSE)       GET/DELETE /api/chat/history
routers/journal.py     GET/POST /api/journal/{date}
                       GET /api/journal/files     POST /api/journal/folder
                       GET /api/journal/read      POST /api/journal/write
                       POST /api/journal/log      POST /api/journal/{date}/extract
routers/reflection.py  GET /api/reflections       POST /api/reflections/generate
                       GET /api/reflections/chart DELETE /api/reflections/{id}
routers/tasks.py       CRUD /api/tasks
routers/notes.py       CRUD /api/notes
routers/settings.py    GET/POST /api/settings
routers/goals.py       CRUD /api/goals
routers/habits.py      CRUD /api/habits
```

### Chat Request Flow

```
POST /api/chat
  → build_system_prompt()  (injects tasks, notes, today's journal)
  → tool loop (max 5 rounds):
      chat_with_tools() → if tool_calls → execute_tool() → append result → repeat
  → stream_chat() → SSE token stream to browser
  → save assistant reply; parse ```memory``` block → notes table
```

### Data Stores

```
quanta.db (SQLite)
  users            id, username, password_hash
  sessions         token → user_id
  messages         user_id, role (user/assistant/log), content
  notes            user_id, content, category
  reflections      user_id, content, scores (JSON)
  tasks            user_id, title, notes, deadline, horizon, done, notify_whatsapp, notified
  settings         user_id, notes_dir, whatsapp_number, callmebot_apikey, telegram_token, telegram_chat_id
  telegram_contacts telegram_id, username, user_id
  goals            user_id, title, description, priority
  habits           user_id, name

Filesystem journals  ~/Documents/engram/engram-{username}-default/
  daily/YYYY-MM-DD.typ   — daily journal entries
  auto/YYYY-MM-DD.typ    — auto-log (chat + Telegram)
  topics/, inbox/        — freeform notes
  (format: Typst .typ, also supports .md / .txt)
```

### Webapp

```
webapp/
├── index.html   — SPA shell; views: journal, tasks, reflections, settings, chat (slide-in panel)
├── app.js       — auth flow, tab switching, chat SSE consumer, task CRUD, reflection display
├── journal.js   — journal file tree, editor, date picker, extract button
└── style.css    — light theme default, CSS variables for theming
```

### Key Relationships

- `chat.py` imports `ollama.py`, `tools.py`, `auth.py`, `database.py`
- `telegram_bot.py` imports `auth.py`, `ollama.py`, `database.py` — mirrors chat logic
- `tools.py` and `telegram_bot.py` both write to `auto/YYYY-MM-DD.typ`
- Journal path resolved: `settings.notes_dir` (if set) else `~/Documents/engram/engram-{username}-default`
- All routers use `get_current_user` (Bearer token dep) except auth endpoints
