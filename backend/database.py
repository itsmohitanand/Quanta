import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "quanta.db"


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            content TEXT NOT NULL,
            category TEXT DEFAULT 'general',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS reflections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            title TEXT NOT NULL,
            notes TEXT DEFAULT '',
            deadline TEXT,
            done INTEGER DEFAULT 0,
            notify_whatsapp INTEGER DEFAULT 0,
            notified INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS settings (
            user_id INTEGER PRIMARY KEY REFERENCES users(id),
            notes_dir TEXT DEFAULT '',
            whatsapp_number TEXT DEFAULT '',
            callmebot_apikey TEXT DEFAULT '',
            telegram_token TEXT DEFAULT '',
            telegram_chat_id TEXT DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS telegram_contacts (
            telegram_id TEXT PRIMARY KEY,
            username TEXT,
            user_id INTEGER REFERENCES users(id),
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    # Migrations: add columns that may not exist in older DBs
    for migration in [
        "ALTER TABLE settings ADD COLUMN whatsapp_number TEXT DEFAULT ''",
        "ALTER TABLE settings ADD COLUMN callmebot_apikey TEXT DEFAULT ''",
        "ALTER TABLE tasks ADD COLUMN notified INTEGER DEFAULT 0",
        "ALTER TABLE tasks ADD COLUMN horizon TEXT DEFAULT 'week'",
        "ALTER TABLE reflections ADD COLUMN scores TEXT DEFAULT NULL",
        "ALTER TABLE settings ADD COLUMN telegram_token TEXT DEFAULT ''",
        "ALTER TABLE settings ADD COLUMN telegram_chat_id TEXT DEFAULT ''",
    ]:
        try:
            conn.execute(migration)
        except Exception:
            pass  # column already exists

    conn.commit()
    conn.close()
