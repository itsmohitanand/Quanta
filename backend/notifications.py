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
    due = db.execute(
        "SELECT i.id, i.title, i.deadline, s.whatsapp_number, s.callmebot_apikey "
        "FROM items i LEFT JOIN settings s ON i.user_id = s.user_id "
        "WHERE i.status NOT IN ('done','someday') AND i.notify_whatsapp = 1 AND i.notified = 0 "
        "AND i.deadline IS NOT NULL AND i.deadline <= ?",
        (window,),
    ).fetchall()

    for item in due:
        phone  = item["whatsapp_number"] or ""
        apikey = item["callmebot_apikey"] or ""
        if phone and apikey:
            try:
                await send_whatsapp(phone, apikey, f"Quanta reminder: {item['title']}")
                db.execute("UPDATE items SET notified = 1 WHERE id = ?", (item["id"],))
            except Exception as e:
                print(f"WhatsApp send failed for item {item['id']}: {e}")

    db.commit()
    db.close()


async def notification_loop():
    while True:
        await asyncio.sleep(300)
        try:
            await check_and_notify()
        except Exception as e:
            print(f"Notification loop error: {e}")
