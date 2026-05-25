import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  readDailyJournal, writeDailyJournal,
  fetchJournalFiles, readFile, writeFile,
  extractJournal,
} from "../api.js";

function fmtDate(d) {
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}
function isoDate(d) {
  return d.toISOString().slice(0, 10);
}
function isToday(d) {
  return isoDate(d) === isoDate(new Date());
}

export default function JournalView() {
  const [date, setDate] = useState(new Date());
  const [content, setContent] = useState("");
  const [currentPath, setCurrentPath] = useState(null);
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [toast, setToast] = useState(null);
  const [showBrowser, setShowBrowser] = useState(false);
  const saveTimer = useRef(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadDate = useCallback(async (d) => {
    setDisplayName(fmtDate(d));
    setLoading(true);
    const text = await readDailyJournal(isoDate(d));
    setContent(text ?? "");
    setLoading(false);
  }, []);

  useEffect(() => { loadDate(date); }, [date, loadDate]);

  function scheduleSave(text) {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (currentPath) {
        await writeFile(currentPath, text);
      } else {
        await writeDailyJournal(isoDate(date), text);
      }
    }, 1500);
  }

  function onChange(e) {
    const text = e.target.value;
    setContent(text);
    scheduleSave(text);
  }

  function shiftDay(delta) {
    const next = new Date(date);
    next.setDate(next.getDate() + delta);
    if (next > new Date()) return;
    setCurrentPath(null);
    setDate(next);
  }

  async function extract() {
    setExtracting(true);
    try {
      const r = await extractJournal(isoDate(date));
      showToast(`${r.commitments_added ?? 0} commitments, ${r.notes_added ?? 0} notes added`);
    } catch {
      showToast("Extract failed — is Ollama running?");
    }
    setExtracting(false);
  }

  async function openFile(path, name) {
    setCurrentPath(path);
    setDisplayName(name);
    setShowBrowser(false);
    setLoading(true);
    const text = await readFile(path);
    setContent(text ?? "");
    setLoading(false);
  }

  return (
    <div className="flex flex-col h-full bg-neutral-950">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-800"
           style={{ paddingTop: `calc(env(safe-area-inset-top) + 12px)` }}>
        {/* Nav arrows */}
        <button onClick={() => shiftDay(-1)} className="text-neutral-400 hover:text-white p-1 transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>

        <div className="flex-1 flex flex-col items-center">
          <span className="text-sm font-medium truncate max-w-[180px]">{displayName}</span>
        </div>

        <button
          onClick={() => shiftDay(1)}
          disabled={isToday(date) && !currentPath}
          className="text-neutral-400 hover:text-white disabled:opacity-30 p-1 transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
        </button>

        <div className="flex items-center gap-2 ml-1">
          {!currentPath && (
            <button
              onClick={() => { setCurrentPath(null); setDate(new Date()); }}
              className="text-xs text-indigo-400 px-2 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 transition-colors"
            >
              Today
            </button>
          )}
          <button onClick={() => setShowBrowser(true)} className="text-neutral-400 hover:text-white transition-colors p-1">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </button>
          <button
            onClick={extract}
            disabled={extracting || !!currentPath || !content.trim()}
            className="text-neutral-400 hover:text-white disabled:opacity-30 transition-colors p-1"
          >
            {extracting
              ? <span className="text-xs animate-spin inline-block">⟳</span>
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}><path d="M12 2l2 7h7l-5.5 4 2 7L12 16l-5.5 4 2-7L3 9h7z" /></svg>
            }
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 relative overflow-hidden">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-950/80 z-10">
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <textarea
          className="w-full h-full bg-transparent px-5 py-4 text-sm text-neutral-100 leading-relaxed outline-none resize-none pb-24 font-mono"
          value={content}
          onChange={onChange}
          disabled={loading}
          placeholder="Start writing…"
          spellCheck={false}
        />
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-neutral-700 text-sm text-white px-4 py-2 rounded-full shadow-lg z-50 pointer-events-none">
          {toast}
        </div>
      )}

      {/* File browser */}
      {showBrowser && (
        <FileBrowser onSelect={openFile} onClose={() => setShowBrowser(false)} />
      )}
    </div>
  );
}

function FileBrowser({ onSelect, onClose }) {
  const [tree, setTree] = useState({});
  const [expanded, setExpanded] = useState(new Set(["daily"]));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchJournalFiles().then(d => {
      setTree(d.tree ?? {});
      setLoading(false);
    });
  }, []);

  function toggle(folder) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(folder) ? next.delete(folder) : next.add(folder);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-neutral-950"
         style={{ paddingTop: `env(safe-area-inset-top)` }}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
        <h2 className="font-semibold">Files</h2>
        <button onClick={onClose} className="text-neutral-400 hover:text-white transition-colors">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto pb-24">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-neutral-500 text-sm">Loading…</div>
        ) : Object.keys(tree).length === 0 ? (
          <div className="flex items-center justify-center h-32 text-neutral-500 text-sm">No files</div>
        ) : (
          Object.keys(tree).sort().map(folder => (
            <div key={folder}>
              <button
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-neutral-800/50 transition-colors"
                onClick={() => toggle(folder)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="text-indigo-400">
                  {expanded.has(folder)
                    ? <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    : <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  }
                </svg>
                <span className="text-sm font-medium text-neutral-200">{folder}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={`ml-auto text-neutral-500 transition-transform ${expanded.has(folder) ? "rotate-90" : ""}`}>
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>

              {expanded.has(folder) && (tree[folder] ?? []).map(file => (
                <button
                  key={file}
                  className="w-full flex items-center gap-3 px-4 py-2.5 pl-10 text-left hover:bg-neutral-800/50 transition-colors"
                  onClick={() => onSelect(`${folder}/${file}`, file)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="text-neutral-500">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span className="text-sm text-neutral-300">{file}</span>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
