import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "quanta.db"


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            username      TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS sessions (
            token      TEXT PRIMARY KEY,
            user_id    INTEGER NOT NULL REFERENCES users(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS messages (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER NOT NULL REFERENCES users(id),
            role       TEXT NOT NULL,
            content    TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS notes (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER NOT NULL REFERENCES users(id),
            content    TEXT NOT NULL,
            category   TEXT DEFAULT 'general',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS reflections (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER NOT NULL REFERENCES users(id),
            content    TEXT NOT NULL,
            scores     TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS settings (
            user_id          INTEGER PRIMARY KEY REFERENCES users(id),
            notes_dir        TEXT DEFAULT '',
            whatsapp_number  TEXT DEFAULT '',
            callmebot_apikey TEXT DEFAULT '',
            telegram_token   TEXT DEFAULT '',
            telegram_chat_id TEXT DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS telegram_contacts (
            telegram_id TEXT PRIMARY KEY,
            username    TEXT,
            user_id     INTEGER REFERENCES users(id),
            updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Unified items: actions, projects, commitments, references
        CREATE TABLE IF NOT EXISTS items (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id         INTEGER NOT NULL REFERENCES users(id),
            type            TEXT NOT NULL DEFAULT 'action',
            title           TEXT NOT NULL,
            description     TEXT DEFAULT '',
            parent_id       INTEGER REFERENCES items(id),
            status          TEXT NOT NULL DEFAULT 'todo',
            horizon         TEXT DEFAULT 'week',
            scheduled_start TIMESTAMP,
            scheduled_end   TIMESTAMP,
            deadline        TIMESTAMP,
            completed_at    TIMESTAMP,
            source_ref      TEXT,
            notify_whatsapp INTEGER DEFAULT 0,
            notified        INTEGER DEFAULT 0,
            created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Audit trail: every meaningful change gets a row
        CREATE TABLE IF NOT EXISTS item_events (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER NOT NULL REFERENCES users(id),
            item_id    INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
            event      TEXT NOT NULL,
            detail     TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- GTD contexts / energy labels  (@work, @phone, low-energy, …)
        CREATE TABLE IF NOT EXISTS contexts (
            id      INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            name    TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS item_contexts (
            item_id    INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
            context_id INTEGER NOT NULL REFERENCES contexts(id) ON DELETE CASCADE,
            PRIMARY KEY (item_id, context_id)
        );

        -- Drop legacy tables (clean slate)
        DROP TABLE IF EXISTS tasks;
        DROP TABLE IF EXISTS goals;
        DROP TABLE IF EXISTS habits;
        DROP TABLE IF EXISTS habit_logs;
    """)
    conn.commit()

    # Migrate existing items table — add columns if missing
    existing = {r[1] for r in conn.execute("PRAGMA table_info(items)").fetchall()}
    for col in ["completed_at TIMESTAMP", "source_ref TEXT"]:
        name = col.split()[0]
        if name not in existing:
            conn.execute(f"ALTER TABLE items ADD COLUMN {col}")
    conn.commit()
    conn.close()
