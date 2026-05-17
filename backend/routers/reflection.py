import json
from datetime import datetime, timedelta
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from ..database import get_db
from ..auth import get_current_user
from ..ollama import chat_once
from .journal import DEFAULT_NOTES_DIR

router = APIRouter()

TEXT_SUFFIXES = {".typ", ".md", ".txt"}

REFLECTION_PROMPT = """You are Quanta — a personal strategist and second brain.

Generate a structured, honest, forward-looking reflection that helps this person become a high achiever. Be specific. Reference actual things from their notes and chat. No generic advice. No platitudes. Name real issues.

Write in second person. Be direct — like a trusted advisor who has read everything and will not let them off the hook.

{accountability_section}

{chat_section}

{notes_section}

---

Generate the reflection using EXACTLY these 6 section headers (copy them verbatim including the emoji):

## 🔍 Current Reality
What does the evidence actually show about where this person is right now? What are they doing vs. what are they saying? Be specific and honest.

## 🎯 What You're Reaching For
Their real goals and ambitions — not just the stated ones. What's the deeper drive? What would success actually look like in concrete terms?

## 🧱 What's In The Way
Specific blockers. Patterns of avoidance. Contradictions between goals and behavior. What keeps appearing that isn't getting resolved? Be precise — name the thing.

## ⚡ What's Working
Honest assessment of genuine strengths and momentum. What is actually moving? Don't invent positives — only name what the evidence supports.

## 🗺️ Path Forward
Concrete, prioritized actions at three horizons:
**This week:** (3 specific actions)
**This month:** (2-3 goals)
**This quarter:** (1 defining focus)

## 🌄 The Bigger Arc
Who is this person becoming? Is the current trajectory going to get them to where they want to be in 5-10 years? What needs to shift at the identity or systems level — not just the task level?

---

After the 6 sections, append this exact block with honest scores from 1-10:
```scores
{{"direction": 0, "execution": 0, "growth": 0, "focus": 0, "wellbeing": 0, "resilience": 0}}
```

Scoring definitions:
- direction: clarity of purpose and long-term vision (where they're going and why)
- execution: actual follow-through — converting intentions into completed actions
- growth: rate of active skill, knowledge, and capacity development
- focus: ability to prioritize ruthlessly and avoid spreading too thin
- wellbeing: health, energy levels, emotional and physical sustainability
- resilience: how well they handle blockers, setbacks, and patterns of avoidance

Calibration: 5 = average person, 7 = genuinely doing well (needs strong evidence), 9 = exceptional. Do not inflate scores to be encouraging.
"""


@router.get("/reflections")
def list_reflections(user_id: int = Depends(get_current_user)):
    db = get_db()
    rows = db.execute(
        "SELECT id, content, scores, created_at FROM reflections WHERE user_id = ? ORDER BY created_at DESC LIMIT 20",
        (user_id,),
    ).fetchall()
    db.close()
    return [dict(r) for r in rows]


@router.get("/reflections/chart")
def chart_data(user_id: int = Depends(get_current_user)):
    db = get_db()
    rows = db.execute(
        "SELECT created_at, scores FROM reflections "
        "WHERE user_id = ? AND scores IS NOT NULL ORDER BY created_at ASC",
        (user_id,),
    ).fetchall()
    db.close()
    result = []
    for r in rows:
        try:
            result.append({
                "date": r["created_at"][:10],
                "scores": json.loads(r["scores"]),
            })
        except Exception:
            pass
    return result


@router.post("/reflections/generate")
async def generate_reflection(user_id: int = Depends(get_current_user)):
    db = get_db()
    since = (datetime.utcnow() - timedelta(days=7)).isoformat()

    messages = db.execute(
        "SELECT role, content FROM messages WHERE user_id = ? AND created_at >= ? ORDER BY created_at",
        (user_id, since),
    ).fetchall()

    prev_reflections = db.execute(
        "SELECT content, created_at FROM reflections WHERE user_id = ? ORDER BY created_at DESC LIMIT 2",
        (user_id,),
    ).fetchall()

    row = db.execute("SELECT notes_dir FROM settings WHERE user_id = ?", (user_id,)).fetchone()
    db.close()

    accountability_section = ""
    if prev_reflections:
        parts = []
        for r in reversed(prev_reflections):
            # Strip scores block from previous reflections before including
            clean = r["content"].split("```scores")[0].strip()
            parts.append(f"[Reflection from {r['created_at'][:10]}]\n{clean}")
        accountability_section = (
            "## Previous Reflections (check: is anything changing? are same problems recurring? call out stagnation)\n"
            + "\n\n---\n\n".join(parts)
        )

    chat_section = ""
    if messages:
        lines = "\n".join(f"[{r['role']}] {r['content']}" for r in messages)
        chat_section = f"## Recent Conversations (last 7 days)\n{lines}"

    raw = (row["notes_dir"] or "").strip() if row else ""
    notes_dir = Path(raw) if raw else DEFAULT_NOTES_DIR

    notes_section = ""
    if notes_dir.exists():
        all_entries: list[tuple[str, str]] = []
        for folder in sorted(notes_dir.iterdir()):
            if not folder.is_dir() or folder.name.startswith("."):
                continue
            for file in sorted(folder.iterdir(), key=lambda f: f.stat().st_mtime, reverse=True):
                if file.suffix not in TEXT_SUFFIXES:
                    continue
                try:
                    content = file.read_text().strip()
                    if content:
                        all_entries.append((f"{folder.name}/{file.name}", content))
                except Exception:
                    continue
        if all_entries:
            parts = [f"--- {label} ---\n{content}" for label, content in all_entries]
            notes_section = "## Notes & Journal\n" + "\n\n".join(parts)

    if not chat_section and not notes_section:
        raise HTTPException(
            status_code=400,
            detail="No chat or notes found. Chat or write a journal entry first."
        )

    prompt = REFLECTION_PROMPT.format(
        accountability_section=accountability_section,
        chat_section=chat_section,
        notes_section=notes_section,
    )

    raw_content = await chat_once([{"role": "user", "content": prompt}])

    # Extract scores block
    scores = None
    content = raw_content
    if "```scores" in raw_content:
        try:
            score_block = raw_content.split("```scores")[1].split("```")[0].strip()
            scores = json.loads(score_block)
            content = raw_content.split("```scores")[0].strip()
        except Exception:
            content = raw_content

    conn = get_db()
    conn.execute(
        "INSERT INTO reflections (user_id, content, scores) VALUES (?, ?, ?)",
        (user_id, content, json.dumps(scores) if scores else None),
    )
    conn.commit()
    conn.close()

    return {
        "content": content,
        "scores": scores,
        "created_at": datetime.utcnow().isoformat(),
    }


@router.delete("/reflections/{reflection_id}")
def delete_reflection(reflection_id: int, user_id: int = Depends(get_current_user)):
    db = get_db()
    db.execute("DELETE FROM reflections WHERE id = ? AND user_id = ?", (reflection_id, user_id))
    db.commit()
    db.close()
    return {"ok": True}
