from datetime import datetime
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from ..database import get_db
from ..auth import get_current_user

router = APIRouter()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _log(db, user_id: int, item_id: int, event: str, detail: str = ""):
    db.execute(
        "INSERT INTO item_events (user_id, item_id, event, detail) VALUES (?, ?, ?, ?)",
        (user_id, item_id, event, detail),
    )


# ── Models ────────────────────────────────────────────────────────────────────

class ItemIn(BaseModel):
    type: str = "action"            # action | commitment | reference
    title: str
    description: str = ""
    parent_id: Optional[int] = None
    status: str = "todo"            # backlog | todo | in_progress | waiting | done | someday
    horizon: str = "week"           # today | week | month | quarter | year | life | anytime
    scheduled_start: Optional[str] = None
    scheduled_end: Optional[str] = None
    deadline: Optional[str] = None
    source_ref: Optional[str] = None
    notify_whatsapp: bool = False


class ItemUpdate(BaseModel):
    type: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    parent_id: Optional[int] = None
    status: Optional[str] = None
    horizon: Optional[str] = None
    scheduled_start: Optional[str] = None
    scheduled_end: Optional[str] = None
    deadline: Optional[str] = None
    notify_whatsapp: Optional[bool] = None


# ── Items CRUD ────────────────────────────────────────────────────────────────

@router.get("/items")
def list_items(
    type: Optional[str] = None,
    status: Optional[str] = None,
    horizon: Optional[str] = None,
    parent_id: Optional[int] = None,
    user_id: int = Depends(get_current_user),
):
    db = get_db()
    query = "SELECT * FROM items WHERE user_id = ?"
    params: list = [user_id]
    if type:
        query += " AND type = ?"
        params.append(type)
    if status:
        query += " AND status = ?"
        params.append(status)
    if horizon:
        query += " AND horizon = ?"
        params.append(horizon)
    if parent_id is not None:
        query += " AND parent_id = ?"
        params.append(parent_id)
    query += " ORDER BY status ASC, deadline ASC NULLS LAST, created_at DESC"
    rows = db.execute(query, params).fetchall()
    db.close()
    return [dict(r) for r in rows]


@router.post("/items")
def create_item(item: ItemIn, user_id: int = Depends(get_current_user)):
    db = get_db()
    cur = db.execute(
        """INSERT INTO items
           (user_id, type, title, description, parent_id, status, horizon,
            scheduled_start, scheduled_end, deadline, source_ref, notify_whatsapp)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (user_id, item.type, item.title, item.description, item.parent_id,
         item.status, item.horizon, item.scheduled_start, item.scheduled_end,
         item.deadline, item.source_ref, int(item.notify_whatsapp)),
    )
    item_id = cur.lastrowid
    _log(db, user_id, item_id, "created", item.title)
    db.commit()
    row = db.execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()
    db.close()
    return dict(row)


@router.patch("/items/{item_id}")
def update_item(item_id: int, update: ItemUpdate, user_id: int = Depends(get_current_user)):
    db = get_db()
    old = db.execute(
        "SELECT * FROM items WHERE id = ? AND user_id = ?", (item_id, user_id)
    ).fetchone()
    if not old:
        db.close()
        return {"ok": True}

    fields: dict = {}

    # Simple scalar fields
    for field in ["type", "title", "description", "horizon",
                  "scheduled_start", "scheduled_end"]:
        val = getattr(update, field)
        if val is not None:
            fields[field] = val

    # Parent link
    if update.parent_id is not None and update.parent_id != old["parent_id"]:
        fields["parent_id"] = update.parent_id
        _log(db, user_id, item_id, "linked", f"parent → {update.parent_id}")

    # Status — drives event type and completed_at
    if update.status is not None and update.status != old["status"]:
        fields["status"] = update.status
        if update.status == "done":
            fields["completed_at"] = datetime.utcnow().isoformat()
            _log(db, user_id, item_id, "completed", old["title"])
        elif update.status == "someday":
            _log(db, user_id, item_id, "abandoned", old["title"])
        else:
            _log(db, user_id, item_id, "status_changed",
                 f"{old['status']} → {update.status}")

    # Deadline — log only if it actually changed from an existing value
    if update.deadline is not None:
        old_dl = old["deadline"] or ""
        if update.deadline != old_dl:
            fields["deadline"] = update.deadline or None
            if old["deadline"]:
                old_s = old["deadline"][:10]
                new_s = update.deadline[:10] if update.deadline else "removed"
                _log(db, user_id, item_id, "deadline_changed", f"{old_s} → {new_s}")
    elif update.deadline == "" and old["deadline"]:
        # Explicit clear
        fields["deadline"] = None
        _log(db, user_id, item_id, "deadline_changed",
             f"{old['deadline'][:10]} → removed")

    # WhatsApp
    if update.notify_whatsapp is not None:
        fields["notify_whatsapp"] = int(update.notify_whatsapp)
        if update.notify_whatsapp:
            fields["notified"] = 0

    if fields:
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        db.execute(
            f"UPDATE items SET {set_clause} WHERE id = ? AND user_id = ?",
            (*fields.values(), item_id, user_id),
        )
        db.commit()

    row = db.execute(
        "SELECT * FROM items WHERE id = ? AND user_id = ?", (item_id, user_id)
    ).fetchone()
    db.close()
    return dict(row) if row else {"ok": True}


@router.delete("/items/{item_id}")
def delete_item(item_id: int, user_id: int = Depends(get_current_user)):
    db = get_db()
    db.execute("DELETE FROM items WHERE id = ? AND user_id = ?", (item_id, user_id))
    db.commit()
    db.close()
    return {"ok": True}


# ── Events (Trail / Wake) ─────────────────────────────────────────────────────

@router.get("/events")
def list_events(limit: int = 200, user_id: int = Depends(get_current_user)):
    db = get_db()
    rows = db.execute(
        """SELECT e.id, e.event, e.detail, e.created_at,
                  i.title  AS item_title,
                  i.type   AS item_type,
                  i.status AS item_status,
                  p.title  AS parent_title
           FROM item_events e
           JOIN items i ON i.id = e.item_id
           LEFT JOIN items p ON p.id = i.parent_id
           WHERE e.user_id = ?
           ORDER BY e.created_at DESC
           LIMIT ?""",
        (user_id, limit),
    ).fetchall()
    db.close()
    return [dict(r) for r in rows]


# ── Contexts ──────────────────────────────────────────────────────────────────

class ContextIn(BaseModel):
    name: str


@router.get("/contexts")
def list_contexts(user_id: int = Depends(get_current_user)):
    db = get_db()
    rows = db.execute("SELECT * FROM contexts WHERE user_id = ?", (user_id,)).fetchall()
    db.close()
    return [dict(r) for r in rows]


@router.post("/contexts")
def create_context(ctx: ContextIn, user_id: int = Depends(get_current_user)):
    db = get_db()
    cur = db.execute(
        "INSERT INTO contexts (user_id, name) VALUES (?, ?)", (user_id, ctx.name)
    )
    ctx_id = cur.lastrowid
    db.commit()
    db.close()
    return {"id": ctx_id, "user_id": user_id, "name": ctx.name}


@router.delete("/contexts/{ctx_id}")
def delete_context(ctx_id: int, user_id: int = Depends(get_current_user)):
    db = get_db()
    db.execute("DELETE FROM contexts WHERE id = ? AND user_id = ?", (ctx_id, user_id))
    db.commit()
    db.close()
    return {"ok": True}


@router.post("/items/{item_id}/contexts/{ctx_id}")
def tag_item(item_id: int, ctx_id: int, user_id: int = Depends(get_current_user)):
    db = get_db()
    db.execute(
        "INSERT OR IGNORE INTO item_contexts (item_id, context_id) VALUES (?, ?)",
        (item_id, ctx_id),
    )
    db.commit()
    db.close()
    return {"ok": True}


@router.delete("/items/{item_id}/contexts/{ctx_id}")
def untag_item(item_id: int, ctx_id: int, user_id: int = Depends(get_current_user)):
    db = get_db()
    db.execute(
        "DELETE FROM item_contexts WHERE item_id = ? AND context_id = ?",
        (item_id, ctx_id),
    )
    db.commit()
    db.close()
    return {"ok": True}
