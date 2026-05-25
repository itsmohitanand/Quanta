import React, { useState, useEffect, useRef, useCallback } from "react";
import { fetchHistory, clearHistory, streamChat } from "../api.js";

export default function ChatView() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    fetchHistory().then(hist => {
      setMessages(hist.map(m => ({ id: crypto.randomUUID(), role: m.role, content: m.content, tools: [] })));
      setTimeout(scrollToBottom, 50);
    });
  }, [scrollToBottom]);

  useEffect(() => { scrollToBottom(); }, [messages.length, scrollToBottom]);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");

    const userMsg = { id: crypto.randomUUID(), role: "user", content: text, tools: [] };
    const assistantMsg = { id: crypto.randomUUID(), role: "assistant", content: "", tools: [], streaming: true };
    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setStreaming(true);

    const assistantId = assistantMsg.id;
    try {
      for await (const event of streamChat(text)) {
        if (event.token) {
          setMessages(prev => prev.map(m =>
            m.id === assistantId ? { ...m, content: m.content + event.token } : m
          ));
          scrollToBottom();
        } else if (event.tool) {
          setMessages(prev => prev.map(m =>
            m.id === assistantId
              ? { ...m, tools: [...m.tools, { id: crypto.randomUUID(), name: event.tool, result: JSON.stringify(event.result) }] }
              : m
          ));
        }
      }
    } catch {}

    setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, streaming: false } : m));
    setStreaming(false);
  }

  async function handleClear() {
    await clearHistory();
    setMessages([]);
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="flex flex-col h-full bg-neutral-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800"
           style={{ paddingTop: `calc(env(safe-area-inset-top) + 12px)` }}>
        <h1 className="text-lg font-semibold">Chat</h1>
        <button
          onClick={handleClear}
          disabled={messages.length === 0 || streaming}
          className="btn-ghost text-xs px-3 py-1.5 disabled:opacity-30"
        >
          Clear
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2 pb-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-neutral-600 text-sm">
            Start a conversation
          </div>
        )}
        {messages.map(msg => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-neutral-800 px-4 py-3 flex items-end gap-3 bg-neutral-950"
           style={{ paddingBottom: `calc(env(safe-area-inset-bottom) + 12px)` }}>
        <textarea
          ref={textareaRef}
          className="flex-1 bg-neutral-800 rounded-2xl px-4 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-500 outline-none resize-none max-h-32 focus:ring-2 focus:ring-indigo-500/50 transition-all"
          placeholder="Message…"
          rows={1}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={streaming}
          style={{ fieldSizing: "content" }}
        />
        <button
          onClick={send}
          disabled={!input.trim() && !streaming}
          className="w-9 h-9 rounded-full bg-indigo-500 flex items-center justify-center text-white disabled:opacity-30 disabled:bg-neutral-700 active:scale-95 transition-all flex-shrink-0"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="19" x2="12" y2="5" />
            <polyline points="5 12 12 5 19 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function MessageBubble({ message }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}>
      {message.tools?.map(tool => (
        <ToolPill key={tool.id} tool={tool} />
      ))}
      <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
        isUser
          ? "bg-indigo-500 text-white rounded-br-sm"
          : "bg-neutral-800 text-neutral-100 rounded-bl-sm"
      }`}>
        {message.streaming && !message.content ? (
          <TypingDots />
        ) : (
          <span className="whitespace-pre-wrap">{message.content}</span>
        )}
      </div>
    </div>
  );
}

function ToolPill({ tool }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <button
      onClick={() => setExpanded(e => !e)}
      className="text-left bg-neutral-800/60 rounded-xl px-3 py-2 text-xs text-neutral-400 max-w-[80%] transition-all"
    >
      <div className="flex items-center gap-1.5">
        <span>⚙</span>
        <span className="font-medium">{tool.name}</span>
        <span className="ml-auto">{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && (
        <p className="mt-1.5 text-neutral-500 line-clamp-5 break-all">{tool.result}</p>
      )}
    </button>
  );
}

function TypingDots() {
  return (
    <span className="flex items-center gap-1 h-4">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s`, animationDuration: "0.8s" }}
        />
      ))}
    </span>
  );
}
