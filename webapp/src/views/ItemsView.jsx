import React, { useState, useEffect, useCallback } from "react";
import { fetchItems, createItem, patchItem, deleteItem } from "../api.js";

const HORIZONS = ["today", "week", "month", "quarter", "year", "life", "anytime"];
const FILTERS = ["active", "all", "done"];

function horizonLabel(h) {
  const map = { today: "Today", week: "Week", month: "Month", quarter: "Q", year: "Year", life: "Life", anytime: "Any" };
  return map[h] ?? h;
}

function fmtDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isOverdue(deadlineStr, isDone) {
  if (!deadlineStr || isDone) return false;
  return new Date(deadlineStr) < new Date();
}

export default function ItemsView() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("active");
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState(null);

  const load = useCallback(async () => {
    const data = await fetchItems();
    setItems(data ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  function visible(item) {
    if (filter === "active") return !item.isDone && item.status !== "someday";
    if (filter === "done") return item.isDone;
    return true;
  }

  const commitments = items.filter(i => i.type === "commitment" && visible(i)).sort((a, b) => b.id - a.id);
  const actions = items.filter(i => i.type !== "commitment" && visible(i)).sort((a, b) => {
    if (a.deadline && b.deadline) return new Date(a.deadline) - new Date(b.deadline);
    if (a.deadline) return -1;
    return b.id - a.id;
  });

  async function toggle(item) {
    const newStatus = item.isDone ? "todo" : "done";
    const updated = await patchItem(item.id, { status: newStatus });
    if (updated) setItems(prev => prev.map(i => i.id === updated.id ? updated : i));
  }

  async function remove(item) {
    await deleteItem(item.id);
    setItems(prev => prev.filter(i => i.id !== item.id));
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-safe-top py-3 border-b border-neutral-800 bg-neutral-950"
           style={{ paddingTop: `calc(env(safe-area-inset-top) + 12px)` }}>
        <h1 className="text-lg font-semibold">Items</h1>
        <div className="flex items-center gap-2">
          <div className="flex bg-neutral-800 rounded-lg p-0.5 text-xs">
            {FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 rounded-md transition-all capitalize ${filter === f ? "bg-neutral-600 text-white" : "text-neutral-400"}`}
              >
                {f}
              </button>
            ))}
          </div>
          <button onClick={() => setShowAdd(true)} className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white active:scale-95 transition-transform">
            <span className="text-xl leading-none mb-0.5">+</span>
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 pb-24">
        {commitments.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Commitments</h2>
            <div className="space-y-1">
              {commitments.map(item => (
                <ItemRow key={item.id} item={item} onToggle={toggle} onDelete={remove} onEdit={setEditItem} />
              ))}
            </div>
          </section>
        )}

        {actions.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Actions</h2>
            <div className="space-y-1">
              {actions.map(item => (
                <ItemRow key={item.id} item={item} onToggle={toggle} onDelete={remove} onEdit={setEditItem} />
              ))}
            </div>
          </section>
        )}

        {commitments.length === 0 && actions.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-neutral-600">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="mb-2">
              <path d="M20 13V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v14l4-4h10a2 2 0 0 0 2-2z" />
            </svg>
            <span className="text-sm">{filter === "active" ? "Nothing active" : "No items"}</span>
          </div>
        )}
      </div>

      {(showAdd || editItem) && (
        <ItemModal
          item={editItem}
          onClose={() => { setShowAdd(false); setEditItem(null); }}
          onSave={async (data) => {
            if (editItem) {
              const updated = await patchItem(editItem.id, data);
              if (updated) setItems(prev => prev.map(i => i.id === updated.id ? updated : i));
            } else {
              await load();
            }
            setShowAdd(false);
            setEditItem(null);
          }}
        />
      )}
    </div>
  );
}

function ItemRow({ item, onToggle, onDelete, onEdit }) {
  const done = item.isDone || item.status === "done";
  const overdue = isOverdue(item.deadline, done);

  return (
    <div
      className="flex items-start gap-3 p-3 rounded-xl bg-neutral-900 active:bg-neutral-800 transition-colors cursor-pointer"
      onClick={() => onEdit(item)}
    >
      <button
        className="mt-0.5 flex-shrink-0"
        onClick={e => { e.stopPropagation(); onToggle(item); }}
      >
        {done
          ? <CheckCircle className="text-green-400" />
          : <EmptyCircle className="text-neutral-600" />
        }
      </button>

      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${done ? "line-through text-neutral-500" : "text-neutral-100"}`}>
          {item.title}
        </p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {item.deadline && (
            <span className={`text-xs ${overdue ? "text-red-400" : "text-neutral-500"}`}>
              {fmtDate(item.deadline)}
            </span>
          )}
          <span className="text-xs text-neutral-600 bg-neutral-800 px-1.5 py-0.5 rounded-md">
            {horizonLabel(item.horizon)}
          </span>
        </div>
      </div>

      <button
        className="text-neutral-700 hover:text-red-400 transition-colors p-1"
        onClick={e => { e.stopPropagation(); onDelete(item); }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" />
        </svg>
      </button>
    </div>
  );
}

function ItemModal({ item, onClose, onSave }) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [type, setType] = useState(item?.type ?? "action");
  const [horizon, setHorizon] = useState(item?.horizon ?? "today");
  const [deadline, setDeadline] = useState(item?.deadline?.slice(0, 10) ?? "");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    const data = { title: title.trim(), type, horizon, deadline: deadline || null };
    if (!item) {
      await createItem(data);
    }
    await onSave(data);
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="w-full bg-neutral-900 rounded-t-2xl p-5 pb-8 space-y-4"
        style={{ paddingBottom: `calc(env(safe-area-inset-bottom) + 20px)` }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{item ? "Edit Item" : "New Item"}</h3>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-300">✕</button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            className="input"
            placeholder="Title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            autoFocus
            required
          />

          <div className="flex gap-2">
            {["action", "commitment"].map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all capitalize ${type === t ? "bg-indigo-500 text-white" : "bg-neutral-800 text-neutral-400"}`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {HORIZONS.map(h => (
              <button
                key={h}
                type="button"
                onClick={() => setHorizon(h)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${horizon === h ? "bg-indigo-500 text-white" : "bg-neutral-800 text-neutral-400"}`}
              >
                {horizonLabel(h)}
              </button>
            ))}
          </div>

          <input
            className="input"
            type="date"
            value={deadline}
            onChange={e => setDeadline(e.target.value)}
          />

          <button type="submit" disabled={loading || !title.trim()} className="btn-primary w-full py-3">
            {loading ? "Saving…" : item ? "Save Changes" : "Add Item"}
          </button>
        </form>
      </div>
    </div>
  );
}

function CheckCircle({ className = "" }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm4.3 7.6-5 5a1 1 0 0 1-1.4 0l-2-2a1 1 0 1 1 1.4-1.4l1.3 1.3 4.3-4.3a1 1 0 0 1 1.4 1.4z" />
    </svg>
  );
}

function EmptyCircle({ className = "" }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
