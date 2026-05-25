import asyncio
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .database import init_db
from .notifications import notification_loop
from .telegram_bot import telegram_polling_loop
from .routers import auth, chat, journal, notes, reflection, settings, items, voice

app = FastAPI(title="Quanta")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    init_db()
    asyncio.create_task(notification_loop())
    asyncio.create_task(telegram_polling_loop())


app.include_router(auth.router,        prefix="/api")
app.include_router(chat.router,        prefix="/api")
app.include_router(journal.router,     prefix="/api")
app.include_router(reflection.router,  prefix="/api")
app.include_router(items.router,       prefix="/api")
app.include_router(notes.router,       prefix="/api")
app.include_router(settings.router,    prefix="/api")
app.include_router(voice.router)       # /ws/voice — no /api prefix

webapp = Path(__file__).parent.parent / "webapp" / "dist"
app.mount("/", StaticFiles(directory=str(webapp), html=True), name="webapp")
