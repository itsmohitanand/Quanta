import asyncio
from datetime import datetime, timedelta
import httpx
from .database import get_db


async def send_whatsapp(phone: str, apikey: str, message: str):
    url = "https://api.callmebot.com/whatsapp.php"
    params = {"phone": phone, "text": message, "apikey": apikey}
    async with httpx.AsyncClient(timeout=15.0) as client:
        await client.get(url, params=params)


async def check_and_notify():
    window = (datetime.utcnow() + timedelta(minutes=10)).isoformat()
    db = get_db()
    tasks = db.execute(
        "SELECT t.id, t.title, t.deadline, s.whatsapp_number, s.callmebot_apikey "
        "FROM tasks t LEFT JOIN settings s ON t.user_id = s.user_id "
        "WHERE t.done = 0 AND t.notify_whatsapp = 1 AND t.notified = 0 "
        "AND t.deadline IS NOT NULL AND t.deadline <= ?",
        (window,),
    ).fetchall()

    for task in tasks:
        phone = task["whatsapp_number"] or ""
        apikey = task["callmebot_apikey"] or ""
        if phone and apikey:
            try:
                await send_whatsapp(phone, apikey, f"Quanta reminder: {task['title']}")
                db.execute("UPDATE tasks SET notified = 1 WHERE id = ?", (task["id"],))
            except Exception as e:
                print(f"WhatsApp send failed for task {task['id']}: {e}")

    db.commit()
    db.close()


async def notification_loop():
    while True:
        await asyncio.sleep(300)  # every 5 minutes
        try:
            await check_and_notify()
        except Exception as e:
            print(f"Notification loop error: {e}")
