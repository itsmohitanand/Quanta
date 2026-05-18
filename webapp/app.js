const API = "";
let token = localStorage.getItem("token") || null;
let username = localStorage.getItem("username") || null;

// ── Auth ──────────────────────────────────────────────────────────────────────

function authHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

async function apiFetch(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: { ...authHeaders(), ...(opts.headers || {}) },
  });
  if (res.status === 401) { logout(); return null; }
  return res;
}

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("username");
  token = null; username = null;
  showAuth();
}

function showAuth() {
  document.getElementById("app").style.display = "none";
  document.getElementById("auth-screen").style.display = "flex";
}

async function showApp() {
  document.getElementById("auth-screen").style.display = "none";
  document.getElementById("app").style.display = "flex";
  document.querySelectorAll(".username-label").forEach(el => el.textContent = username);
  window.__quantaLoggedIn = true;
  document.dispatchEvent(new CustomEvent("quanta:login"));
  await loadHistory();
  loadReflections();
  loadTasks();
  switchTab("journal");
  setJournalMode("write");
  switchBuildView(localStorage.getItem("buildView") || "now");
}

document.getElementById("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const uname = document.getElementById("auth-username").value.trim();
  const pass = document.getElementById("auth-password").value;
  const mode = document.getElementById("auth-mode").value;
  const errEl = document.getElementById("auth-error");
  errEl.textContent = "";

  const res = await fetch(`${API}/api/auth/${mode}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: uname, password: pass }),
  });
  if (!res.ok) { const d = await res.json(); errEl.textContent = d.detail || "Error"; return; }
  const data = await res.json();
  token = data.token; username = data.username;
  localStorage.setItem("token", token);
  localStorage.setItem("username", username);
  showApp();
});

// ── Tabs ──────────────────────────────────────────────────────────────────────

function switchTab(tabName) {
  document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  const btn = document.querySelector(`[data-tab="${tabName}"]`);
  if (btn) { btn.classList.add("active"); document.getElementById(tabName)?.classList.add("active"); }
  localStorage.setItem("lastTab", tabName);
  setTimeout(updateFab, 50);
}

// Sidebar nav
document.querySelectorAll(".tab[data-tab]").forEach((btn) => {
  btn.addEventListener("click", () => {
    switchTab(btn.dataset.tab);
    if (btn.dataset.tab === "reflection") loadCharts();
    if (btn.dataset.tab === "journal")    setJournalMode("write");
    if (btn.dataset.tab === "tasks")      switchBuildView(currentBuildView || "now");
  });
});

// ── Journal / Chat mode toggle ────────────────────────────────────────────────

let journalMode = "write";

function setJournalMode(mode) {
  journalMode = mode;
  const isChat = mode === "chat";

  const chatPane   = document.getElementById("chat-pane");
  const jLayout    = document.getElementById("journal-layout");
  const wCtrl      = document.getElementById("write-controls");
  const cCtrl      = document.getElementById("chat-controls");

  chatPane.style.display  = isChat ? "flex" : "none";
  jLayout.style.display   = isChat ? "none"  : "flex";
  wCtrl.style.display     = isChat ? "none"  : "contents";
  cCtrl.style.display     = isChat ? "flex"  : "none";

  if (isChat) requestAnimationFrame(() => { messagesEl.scrollTop = messagesEl.scrollHeight; });

  document.querySelectorAll(".mt-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.mode === mode)
  );
  localStorage.setItem("journalMode", mode);
  updateFab();
}

// Journal Write/Chat toggle — scoped to journal section only
document.querySelectorAll("#journal .mt-btn[data-mode]").forEach(btn => {
  btn.addEventListener("click", () => {
    setJournalMode(btn.dataset.mode);
    refreshIcons();
  });
});

// Sidebar collapse
const sidebar = document.getElementById("sidebar");
const SIDEBAR_KEY = "sidebarCollapsed";
if (localStorage.getItem(SIDEBAR_KEY) === "1") sidebar.classList.add("collapsed");

document.getElementById("sidebar-collapse").addEventListener("click", () => {
  const collapsed = sidebar.classList.toggle("collapsed");
  localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0");
});

document.getElementById("logout-btn").addEventListener("click", logout);
document.getElementById("logout-modal-btn").addEventListener("click", logout);

// ── Chat ──────────────────────────────────────────────────────────────────────

const messagesEl = document.getElementById("messages");
const chatInput = document.getElementById("chat-input");

// Safely render message text as HTML paragraphs
function renderMsgText(text) {
  const safe = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return safe
    .replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code.trim()}</code></pre>`)
    .replace(/`([^`\n]+)`/g,  "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g,   "<em>$1</em>")
    .split(/\n\n+/)
    .map(p => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function appendMessage(role, content, streaming = false) {
  const wrap = document.createElement("div");
  wrap.className = `msg-wrap msg-wrap--${role}`;

  const el = document.createElement("div");
  el.className = `msg ${role}`;

  if (streaming && !content) {
    el.classList.add("typing");
    el.innerHTML = `<div class="typing-dots"><span></span><span></span><span></span></div>`;
  } else if (content) {
    el.innerHTML = role === "assistant" ? renderMsgText(content) : `<p>${escHtml(content)}</p>`;
    if (streaming) el.classList.add("streaming");
  }

  const actions = document.createElement("div");
  actions.className = "msg-actions";
  const replyBtn = document.createElement("button");
  replyBtn.className = "msg-reply-btn";
  replyBtn.innerHTML = `<i data-lucide="corner-up-left"></i>`;
  replyBtn.title = "Quote and reply";
  refreshIcons(replyBtn);
  replyBtn.addEventListener("click", () => {
    const quote = el.textContent.trim().slice(0, 120);
    const prefix = `> ${quote}${quote.length === 120 ? "…" : ""}\n\n`;
    chatInput.value = prefix;
    chatInput.style.height = "auto";
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + "px";
    chatInput.focus();
    chatInput.selectionStart = chatInput.selectionEnd = chatInput.value.length;
  });
  actions.appendChild(replyBtn);

  wrap.appendChild(el);
  wrap.appendChild(actions);
  messagesEl.appendChild(wrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return el;
}

async function loadHistory() {
  const res = await apiFetch("/api/chat/history");
  if (!res || !res.ok) return;
  const messages = await res.json();
  messagesEl.innerHTML = "";
  if (!messages.length) return;
  const divider = document.createElement("div");
  divider.className = "history-divider";
  divider.textContent = "── previous messages ──";
  messagesEl.appendChild(divider);
  messages.forEach((m) => {
    if (m.role === "log") {
      appendToolCard("log_to_journal", {}, { text: m.content });
    } else {
      appendMessage(m.role, m.content);
    }
  });
  const sep = document.createElement("div");
  sep.className = "history-divider";
  sep.textContent = "── today ──";
  messagesEl.appendChild(sep);
}

document.getElementById("clear-chat-btn").addEventListener("click", async () => {
  if (!confirm("Start a new conversation? This clears the message history so Quanta starts fresh.")) return;
  await apiFetch("/api/chat/history", { method: "DELETE" });
  document.getElementById("messages").innerHTML = "";
  const notice = document.createElement("div");
  notice.className = "history-divider";
  notice.textContent = "── new conversation ──";
  document.getElementById("messages").appendChild(notice);
});

chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); }
});
document.getElementById("chat-send-btn").addEventListener("click", sendChat);

// keep old form submit as fallback if form still exists
document.getElementById("chat-form")?.addEventListener("submit", (e) => { e.preventDefault(); sendChat(); });

const TOOL_LABELS = {
  create_item:        { icon: "pin",           label: "Added to Build" },
  list_items:         { icon: "list-checks",   label: "Checked items" },
  schedule_item:      { icon: "calendar-plus", label: "Scheduled" },
  read_journal:       { icon: "book-open",     label: "Read journal" },
  list_journal_files: { icon: "folder",        label: "Browsed notes" },
  save_note:          { icon: "bookmark-plus", label: "Remembered" },
  web_search:         { icon: "search",        label: "Searched" },
  log_to_journal:     { icon: "pencil-line",   label: "Logged to journal" },
};

function appendToolCard(name, args, result) {
  const meta = TOOL_LABELS[name] || { icon: "🔧", label: name };
  const el = document.createElement("div");
  el.className = `tool-card tool-${name.replace(/_/g, '-')}`;

  if (name === "web_search") {
    // Richer card for search results
    const results = result.results || [];
    const rows = results.slice(0, 4).map(r =>
      `<a class="search-result" href="${r.url}" target="_blank" rel="noopener">
        <span class="sr-title">${escHtml(r.title)}</span>
        <span class="sr-snippet">${escHtml(r.snippet)}</span>
      </a>`
    ).join("");
    el.innerHTML = `
      <div class="tool-card-head">
        <i data-lucide="${meta.icon}" class="tool-icon"></i>
        <span class="tool-label">${meta.label}</span>
        <span class="tool-detail">"${escHtml(args.query || "")}"</span>
      </div>
      ${rows ? `<div class="search-results">${rows}</div>` : ""}`;
    refreshIcons(el);
  } else {
    let detail = "";
    if (name === "create_item")   detail = `<strong>${escHtml(args.title || "")}</strong>${args.deadline ? " · " + args.deadline.replace("T"," ") : ""} <em>${args.type || "action"}</em>`;
    if (name === "schedule_item") detail = `<strong>${escHtml(String(args.item_id))}</strong> · ${(args.scheduled_start||"").slice(11,16)} – ${(args.scheduled_end||"").slice(11,16)}`;
    if (name === "read_journal") detail = args.date || "";
    if (name === "save_note")    detail = escHtml(args.content || "");
    if (name === "list_items")   detail = `${(result.items || []).length} item(s)`;
    if (name === "list_journal_files") detail = `${(result.files || []).length} file(s)`;
    if (name === "log_to_journal") detail = result.text ? escHtml(result.text) : (result.file ? `${result.file} · ${result.time}` : "");
    el.innerHTML = `
      <i data-lucide="${meta.icon}" class="tool-icon"></i>
      <span class="tool-label">${meta.label}</span>
      ${detail ? `<span class="tool-detail">${detail}</span>` : ""}`;
    refreshIcons(el);
  }

  messagesEl.appendChild(el);
  requestAnimationFrame(() => { messagesEl.scrollTop = messagesEl.scrollHeight; });
}

async function sendChat() {
  const text = chatInput.value.trim();
  if (!text) return;

  // @task / @aim → switch to chat mode then fall through to AI
  if (text.toLowerCase().startsWith("@task ") || text.toLowerCase().startsWith("@aim ")) {
    setJournalMode("chat");
    chatCmdHint.style.display = "none";
    chatInput.classList.remove("cmd-active");
  }

  if (text.toLowerCase().startsWith("@log ")) {
    const entry = text.slice(5).trim();
    if (!entry) return;
    chatInput.value = "";
    chatInput.style.height = "auto";
    const res = await apiFetch("/api/journal/log", {
      method: "POST",
      body: JSON.stringify({ text: entry }),
    });
    chatCmdHint.style.display = "none";
    chatInput.classList.remove("cmd-log");
    if (res && res.ok) {
      const d = await res.json();
      appendToolCard("log_to_journal", {}, { text: entry, file: d.file, time: d.time });
    }
    return;
  }
  chatInput.value = "";
  chatInput.style.height = "auto";

  appendMessage("user", text);
  const botEl = appendMessage("assistant", "", true);

  const res = await fetch(`${API}/api/chat`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ message: text }),
  });
  if (!res.ok) { botEl.textContent = "Error."; botEl.classList.remove("streaming"); return; }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6);
      if (payload === "[DONE]") {
        botEl.classList.remove("streaming", "typing");
        // Render final text as proper HTML
        const clean = fullText.replace(/```memory[\s\S]*?```/g, "").trim();
        if (clean) botEl.innerHTML = renderMsgText(clean);
        break;
      }
      try {
        const data = JSON.parse(payload);
        if (data.tool) {
          appendToolCard(data.tool, data.args || {}, data.result || {});
          if (data.tool === "create_item")   loadTasks();
          if (data.tool === "schedule_item") { loadTasks(); loadSchedule(); }
        } else if (data.token) {
          if (botEl.classList.contains("typing")) {
            botEl.classList.remove("typing");
            botEl.textContent = "";
            botEl.classList.add("streaming");
          }
          fullText += data.token;
          // While streaming: plain text + cursor (fast, no re-parsing)
          botEl.textContent = fullText.replace(/```memory[\s\S]*?```/g, "").trim();
          messagesEl.scrollTop = messagesEl.scrollHeight;
        }
      } catch (_) {}
    }
  }
}

const chatCmdHint = document.getElementById("chat-cmd-hint");

chatInput.addEventListener("input", () => {
  chatInput.style.height = "auto";
  chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + "px";
  const val = chatInput.value.toLowerCase();
  const isLog  = val.startsWith("@log");
  const isTask = val.startsWith("@task");
  const isAim  = val.startsWith("@aim");
  const isCmd  = isLog || isTask || isAim;
  if (isLog)  chatCmdHint.innerHTML = `<i data-lucide="pencil-line"></i> Logging to journal`;
  if (isTask) chatCmdHint.innerHTML = `<i data-lucide="pin"></i> Adding task — include a deadline or Quanta will ask`;
  if (isAim)  chatCmdHint.innerHTML = `<i data-lucide="target"></i> Adding aim`;
  chatCmdHint.style.display = isCmd ? "flex" : "none";
  chatInput.classList.toggle("cmd-log", isLog);
  if (isCmd) refreshIcons(chatCmdHint);
});

// ── Reflection ────────────────────────────────────────────────────────────────

// ── Reflection charts ─────────────────────────────────────────────────────────

const DIMS = [
  { key: "direction",  label: "Direction",  color: "#4f8ef7" },
  { key: "execution",  label: "Execution",  color: "#f74f6a" },
  { key: "growth",     label: "Growth",     color: "#4fcf8e" },
  { key: "focus",      label: "Focus",      color: "#f7a84f" },
  { key: "wellbeing",  label: "Wellbeing",  color: "#bf6af7" },
  { key: "resilience", label: "Resilience", color: "#f7d44f" },
];

let radarChart = null;
let trendChart = null;

const CHART_DEFAULTS = {
  color: "#6070a0",
  borderColor: "#1c2030",
};

function chartGridColor() { return "rgba(255,255,255,0.06)"; }
function chartTickColor() { return "#404860"; }

async function loadCharts() {
  const res = await apiFetch("/api/reflections/chart");
  if (!res || !res.ok) return;
  const data = await res.json();
  if (!data.length) return;

  // Defer rendering until next frame so the reflection tab's canvas is visible
  requestAnimationFrame(() => {
    const latest = data[data.length - 1].scores;
    renderRadar(latest);
    renderTrend(data);
    renderScoreRow(latest, data.length > 1 ? data[data.length - 2].scores : null);
  });
}

function renderRadar(scores) {
  const ctx = document.getElementById("radar-chart").getContext("2d");
  if (radarChart) radarChart.destroy();

  radarChart = new Chart(ctx, {
    type: "radar",
    data: {
      labels: DIMS.map(d => d.label),
      datasets: [{
        data: DIMS.map(d => scores[d.key] || 0),
        borderColor: "#4f8ef7",
        backgroundColor: "rgba(79,142,247,0.1)",
        borderWidth: 2,
        pointBackgroundColor: DIMS.map(d => d.color),
        pointBorderColor: "transparent",
        pointRadius: 4,
        pointHoverRadius: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      animation: { duration: 500 },
      plugins: { legend: { display: false } },
      scales: {
        r: {
          min: 0, max: 10,
          ticks: {
            stepSize: 2, color: "#364060",
            backdropColor: "transparent", font: { size: 9 },
          },
          grid:       { color: "rgba(255,255,255,0.05)" },
          angleLines: { color: "rgba(255,255,255,0.05)" },
          pointLabels: { color: "#6070a0", font: { size: 11, weight: "700" } },
        },
      },
    },
  });
}

function renderTrend(data) {
  const ctx = document.getElementById("trend-chart").getContext("2d");
  if (trendChart) trendChart.destroy();

  const labels = data.map(d =>
    new Date(d.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
  );

  trendChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: DIMS.map(d => ({
        label: d.label,
        data: data.map(r => r.scores[d.key] || 0),
        borderColor: d.color,
        backgroundColor: "transparent",
        borderWidth: 2,
        pointRadius: 4,
        pointBackgroundColor: d.color,
        pointBorderColor: "transparent",
        tension: 0.4,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500 },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: "#6070a0", usePointStyle: true,
            pointStyleWidth: 8, font: { size: 10 },
            boxHeight: 5, padding: 12,
          },
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(255,255,255,0.04)" },
          ticks: { color: "#364060", font: { size: 10 } },
          border: { color: "#1a1d26" },
        },
        y: {
          min: 0, max: 10,
          grid: { color: "rgba(255,255,255,0.04)" },
          ticks: { color: "#364060", stepSize: 2, font: { size: 10 } },
          border: { color: "#1a1d26" },
        },
      },
    },
  });
}

function renderScoreRow(latest, prev) {
  const row = document.getElementById("rfl-scores-row");
  row.innerHTML = "";
  DIMS.forEach(d => {
    const val  = latest[d.key] || 0;
    const old  = prev ? (prev[d.key] || 0) : null;
    const delta = old !== null ? (val - old) : null;
    const pill = document.createElement("div");
    pill.className = "score-pill";
    pill.style.borderTopColor = d.color;
    pill.style.borderTopWidth = "2px";
    const deltaStr = delta === null ? "" :
      `<span class="score-pill-delta ${delta > 0 ? "up" : delta < 0 ? "down" : "flat"}">${delta > 0 ? "+" : ""}${delta !== 0 ? delta : "—"}</span>`;
    pill.innerHTML = `
      <span class="score-pill-label" style="color:${d.color}">${d.label}</span>
      <div class="score-pill-bottom">
        <span class="score-pill-val">${val}</span><span class="score-pill-max">/10</span>
        ${deltaStr}
      </div>`;
    row.appendChild(pill);
  });
}

// ── Reflection rendering ──────────────────────────────────────────────────────

const RSEC = [
  { emoji: "🔍", color: "#4f8ef7", bg: "rgba(79,142,247,0.06)"  },
  { emoji: "🎯", color: "#f7a84f", bg: "rgba(247,168,79,0.06)"  },
  { emoji: "🧱", color: "#f74f6a", bg: "rgba(247,79,106,0.06)"  },
  { emoji: "⚡", color: "#4fcf8e", bg: "rgba(79,207,142,0.06)"  },
  { emoji: "🗺", color: "#bf6af7", bg: "rgba(191,106,247,0.06)" },  // matches 🗺️ too
  { emoji: "🌄", color: "#f7d44f", bg: "rgba(247,212,79,0.06)"  },
];

function findRsec(heading) {
  return RSEC.find(s => heading.includes(s.emoji)) || null;
}

function renderReflection(markdown) {
  const wrap = document.createElement("div");
  wrap.className = "rfl-sections";

  // Split on "## " at start of line
  const raw = markdown.split(/\n(?=## )/);

  raw.forEach(chunk => {
    chunk = chunk.trim();
    if (!chunk) return;

    // Strip leading "## "
    const isH2 = chunk.startsWith("## ");
    const content = isH2 ? chunk.slice(3) : chunk;
    const nl = content.indexOf("\n");
    const heading = nl > 0 ? content.slice(0, nl).trim() : content.trim();
    const body    = nl > 0 ? content.slice(nl + 1).trim() : "";

    const sec = findRsec(heading);
    const card = document.createElement("div");
    card.className = "rsc";
    if (sec) {
      card.style.borderTopColor = sec.color;
      card.style.background = sec.bg;
    }

    // Header
    const head = document.createElement("div");
    head.className = "rsc-head";
    if (sec) {
      head.innerHTML = `
        <span class="rsc-emoji">${sec.emoji}</span>
        <span class="rsc-title" style="color:${sec.color}">${heading.replace(sec.emoji, "").replace(/️/g, "").trim()}</span>`;
    } else {
      head.innerHTML = `<span class="rsc-title">${heading}</span>`;
    }
    card.appendChild(head);

    // Body
    if (body) {
      const bodyEl = document.createElement("div");
      bodyEl.className = "rsc-body";
      bodyEl.innerHTML = marked.parse(body);
      card.appendChild(bodyEl);
    }

    wrap.appendChild(card);
  });

  return wrap;
}

async function loadReflections() {
  loadCharts();
  const res = await apiFetch("/api/reflections");
  if (!res) return;
  const items = await res.json();
  const list = document.getElementById("reflection-list");

  if (!items.length) {
    list.innerHTML = `
      <div class="empty-state">
        No reflections yet.<br><br>
        Chat with Quanta or write in your journal for a few days,<br>
        then click <strong>Generate</strong> — it reads everything and synthesises.
      </div>`;
    return;
  }

  list.innerHTML = "";
  items.forEach((r, idx) => {
    const card = document.createElement("div");
    card.className = "reflection-card";

    const date = new Date(r.created_at + "Z").toLocaleDateString("en-GB", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });

    const meta = document.createElement("div");
    meta.className = "reflection-meta";
    // Collapse all but the most recent
    const collapsed = idx > 0;
    meta.innerHTML = `
      <span class="reflection-date">${date}</span>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="rfl-toggle icon-btn" title="${collapsed ? "Expand" : "Collapse"}">${collapsed ? "▸" : "▾"}</button>
        <button class="del" title="Delete">×</button>
      </div>`;
    meta.querySelector(".del").addEventListener("click", () => deleteReflection(r.id));

    const body = document.createElement("div");
    body.className = "reflection-body";
    if (collapsed) body.style.display = "none";
    body.appendChild(renderReflection(r.content));

    meta.querySelector(".rfl-toggle").addEventListener("click", (e) => {
      const open = body.style.display !== "none";
      body.style.display = open ? "none" : "block";
      e.target.textContent = open ? "▸" : "▾";
    });

    card.appendChild(meta);
    card.appendChild(body);
    list.appendChild(card);
    refreshIcons(card);
  });
}

document.getElementById("generate-reflection").addEventListener("click", async () => {
  const btn = document.getElementById("generate-reflection");
  btn.textContent = "Thinking...";
  btn.disabled = true;

  const res = await apiFetch("/api/reflections/generate", { method: "POST" });
  btn.textContent = "Generate";
  btn.disabled = false;

  if (!res) return;
  if (!res.ok) {
    const d = await res.json();
    alert(d.detail || "Generation failed");
    return;
  }
  await loadReflections();
});

async function deleteReflection(id) {
  await apiFetch(`/api/reflections/${id}`, { method: "DELETE" });
  loadReflections();
}

// ── Build — North · Now · Wake ────────────────────────────────────────────────

let taskWAEnabled = false;
let whatsappConfigured = false;
let taskType = "task"; // "task" | "goal"
let currentBuildView = "now";
let allItems = [];

function escHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Action / Commitment toggle
document.querySelectorAll(".tt-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tt-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    taskType = btn.dataset.type;
    document.getElementById("task-opts").style.display = taskType === "task" ? "flex" : "none";
    document.getElementById("goal-opts").style.display = taskType === "goal" ? "flex" : "none";
  });
});

async function checkWhatsappConfig() {
  const res = await apiFetch("/api/settings");
  if (!res) return;
  const d = await res.json();
  whatsappConfigured = !!(d.whatsapp_number && d.callmebot_apikey);
  updateWAToggle();
}

function updateWAToggle() {
  const btn = document.getElementById("task-whatsapp-toggle");
  btn.innerHTML = taskWAEnabled
    ? `<i data-lucide="phone-incoming"></i>`
    : `<i data-lucide="phone-off"></i>`;
  btn.classList.toggle("wa-on", taskWAEnabled);
  refreshIcons(btn);
}

document.getElementById("task-whatsapp-toggle").addEventListener("click", () => {
  if (!whatsappConfigured) { alert("Set up WhatsApp in ⚙ Settings first."); return; }
  taskWAEnabled = !taskWAEnabled;
  updateWAToggle();
});

// ── Build tab switching ───────────────────────────────────────────────────────

function switchBuildView(view) {
  currentBuildView = view;
  localStorage.setItem("buildView", view);
  document.querySelectorAll(".mt-btn[data-view]").forEach(b =>
    b.classList.toggle("active", b.dataset.view === view)
  );
  document.querySelectorAll(".build-view").forEach(v => v.classList.remove("active"));
  document.getElementById(`build-${view}`)?.classList.add("active");
  document.getElementById("task-form").style.display = view === "wake" ? "none" : "";
  if (view === "wake") loadWake();
  else loadTasks();
}

document.querySelectorAll(".mt-btn[data-view]").forEach(btn =>
  btn.addEventListener("click", () => switchBuildView(btn.dataset.view))
);

// Build ↔ Schedule top-level switch
function switchSectionMode(section) {
  document.querySelectorAll(".sm-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.section === section)
  );
  document.getElementById("pane-build").classList.toggle("active", section === "build");
  document.getElementById("pane-schedule").classList.toggle("active", section === "schedule");
  // Show Now/North/Wake controls only in Build mode
  const vc = document.getElementById("build-view-controls");
  if (vc) vc.style.display = section === "build" ? "flex" : "none";
  if (section === "schedule") { if (!allItems.length) loadTasks(); loadSchedule(); }
  else switchBuildView(currentBuildView || "now");
}

document.querySelectorAll(".sm-btn").forEach(btn =>
  btn.addEventListener("click", () => switchSectionMode(btn.dataset.section))
);

async function loadTasks() {
  await checkWhatsappConfig();
  const res = await apiFetch("/api/items");
  if (!res) return;
  allItems = await res.json();
  populateParentSelector(allItems);
  if (currentBuildView === "north") renderNorth(allItems);
  else renderNow(allItems);
}

const HORIZON_LABEL = {
  today: "Today", week: "This week", month: "This month",
  quarter: "This quarter", year: "This year", life: "Long-term", anytime: "Anytime",
};

const COMMITMENT_TYPES = new Set(["commitment", "project"]);

function deadlineToHorizon(dl) {
  const days = (new Date(dl) - new Date()) / 864e5;
  if (days <= 1) return "today";
  if (days <= 7) return "week";
  if (days <= 30) return "month";
  return "quarter";
}

// ── Now view ──────────────────────────────────────────────────────────────────

function renderNow(items) {
  const list = document.getElementById("task-list");
  list.innerHTML = "";

  const byId = Object.fromEntries(items.map(i => [i.id, i]));
  const todayStr = new Date().toISOString().slice(0, 10);
  const weekEnd  = new Date(); weekEnd.setDate(weekEnd.getDate() + 7);

  const active = items.filter(t => t.status !== "done" && t.status !== "someday");

  const todayItems = active.filter(t => {
    if (t.horizon === "today") return true;
    if (t.deadline && t.deadline.slice(0, 10) === todayStr) return true;
    if (t.scheduled_start && t.scheduled_start.slice(0, 10) === todayStr) return true;
    return false;
  });

  const weekItems = active.filter(t => {
    if (todayItems.includes(t)) return false;
    if (t.horizon === "week") return true;
    if (t.deadline) {
      const dl = new Date(t.deadline);
      return dl > new Date() && dl <= weekEnd;
    }
    return false;
  });

  const doneToday = items.filter(t =>
    t.status === "done" && t.completed_at && t.completed_at.slice(0, 10) === todayStr
  );

  if (!todayItems.length && !weekItems.length) {
    list.innerHTML = `<div class="empty-state">Nothing due today.<br><br>Add something for today or check <strong>North</strong> to plan ahead.</div>`;
    return;
  }

  const renderNowItem = (t) => {
    const parent = t.parent_id && byId[t.parent_id];
    const isDone = t.status === "done";
    const el = document.createElement("div");
    el.className = `task-item${isDone ? " done" : ""}`;
    const dl = t.deadline ? new Date(t.deadline).toLocaleString("en-GB", {
      hour: "2-digit", minute: "2-digit",
    }) : "";
    el.innerHTML = `
      <div class="task-check${isDone ? " done" : ""}"></div>
      <div class="task-body">
        <div class="task-title">${escHtml(t.title)}${dl ? `<span class="now-time">${dl}</span>` : ""}</div>
        ${parent ? `<div class="parent-hint">↑ ${escHtml(parent.title)}</div>` : ""}
      </div>
      <div class="task-actions">
        <button class="task-edit icon-btn" title="Edit"><i data-lucide="pencil"></i></button>
        <button class="del" title="Delete"><i data-lucide="x"></i></button>
      </div>`;
    refreshIcons(el);
    el.querySelector(".task-check").addEventListener("click", () =>
      isDone ? updateItemStatus(t.id, "todo") : markItemDone(t.id)
    );
    el.querySelector(".task-edit").addEventListener("click", () => openEditItem(t));
    el.querySelector(".del").addEventListener("click", () => deleteItem(t.id));
    return el;
  };

  if (todayItems.length) {
    const sec = document.createElement("div");
    sec.className = "task-group";
    sec.innerHTML = `<div class="task-group-label today">Today</div>`;
    todayItems.forEach(t => sec.appendChild(renderNowItem(t)));
    list.appendChild(sec);
  }

  if (weekItems.length) {
    const sec = document.createElement("div");
    sec.className = "task-group";
    sec.innerHTML = `<div class="task-group-label week">This week</div>`;
    weekItems.forEach(t => sec.appendChild(renderNowItem(t)));
    list.appendChild(sec);
  }

  if (doneToday.length) {
    const sec = document.createElement("div");
    sec.className = "task-group";
    sec.innerHTML = `<div class="task-group-label done">Done today</div>`;
    doneToday.forEach(t => sec.appendChild(renderNowItem(t)));
    list.appendChild(sec);
  }
}

// ── North view ────────────────────────────────────────────────────────────────

function renderNorth(items) {
  const tree = document.getElementById("north-tree");
  tree.innerHTML = "";

  const byId = Object.fromEntries(items.map(i => [i.id, i]));
  const children = {};
  items.forEach(i => { children[i.id] = []; });
  items.forEach(i => {
    if (i.parent_id && byId[i.parent_id]) children[i.parent_id].push(i);
  });

  const roots = items.filter(i => !i.parent_id || !byId[i.parent_id]);
  roots.sort((a, b) => {
    const ac = COMMITMENT_TYPES.has(a.type) ? 0 : 1;
    const bc = COMMITMENT_TYPES.has(b.type) ? 0 : 1;
    return ac - bc;
  });

  const active = roots.filter(i => i.status !== "done" && i.status !== "someday");
  const someday = items.filter(i => i.status === "someday");

  if (!active.length && !someday.length) {
    tree.innerHTML = `<div class="empty-state">Nothing here yet.<br><br>Add an <strong>Aim</strong> to start building your north.</div>`;
    return;
  }

  active.forEach(item => tree.appendChild(renderNorthNode(item, children, byId, 0)));

  if (someday.length) {
    const sec = document.createElement("div");
    sec.className = "someday-section";
    sec.innerHTML = `<div class="someday-label">Maybe one day</div>`;
    someday.forEach(i => {
      const chip = document.createElement("button");
      chip.className = "someday-chip";
      chip.textContent = i.title;
      chip.addEventListener("click", () => openEditItem(i));
      sec.appendChild(chip);
    });
    tree.appendChild(sec);
  }
}

function renderNorthNode(item, children, byId, depth) {
  const kids = (children[item.id] || []).filter(k => k.status !== "someday");
  const doneKids = kids.filter(k => k.status === "done");
  const activeKids = kids.filter(k => k.status !== "done");
  const isDone = item.status === "done";
  const isRoot = depth === 0;

  const el = document.createElement("div");
  el.className = `north-node${isRoot ? " north-root" : ""}${isDone ? " north-done" : ""}`;

  const header = document.createElement("div");
  header.className = "north-header";

  const check = document.createElement("div");
  check.className = `task-check${isDone ? " done" : ""}`;
  check.addEventListener("click", () =>
    isDone ? updateItemStatus(item.id, "todo") : markItemDone(item.id)
  );

  const body = document.createElement("div");
  body.className = "north-body";
  body.innerHTML = `<div class="north-title">${escHtml(item.title)}</div>`;
  if (item.description)
    body.innerHTML += `<div class="north-desc">${escHtml(item.description)}</div>`;

  if (isRoot && kids.length) {
    const pct = Math.round((doneKids.length / kids.length) * 100);
    body.innerHTML += `
      <div class="aim-progress-wrap">
        <div class="aim-progress-bar"><div class="aim-progress-fill" style="width:${pct}%"></div></div>
        <span class="aim-progress-label">${doneKids.length} / ${kids.length}</span>
      </div>`;
  }

  const meta = document.createElement("div");
  meta.className = "north-meta";
  if (item.horizon && HORIZON_LABEL[item.horizon]) {
    const badge = document.createElement("span");
    badge.className = `north-badge ${item.horizon}`;
    badge.textContent = HORIZON_LABEL[item.horizon];
    meta.appendChild(badge);
  }

  const acts = document.createElement("div");
  acts.className = "north-actions";
  acts.innerHTML = `
    <button class="icon-btn" title="Edit"><i data-lucide="pencil"></i></button>
    <button class="icon-btn" title="Delete"><i data-lucide="x"></i></button>`;
  refreshIcons(acts);
  acts.children[0].addEventListener("click", () => openEditItem(item));
  acts.children[1].addEventListener("click", () => deleteItem(item.id));

  header.append(check, body, meta, acts);
  el.appendChild(header);

  if (activeKids.length || doneKids.length) {
    const wrap = document.createElement("div");
    wrap.className = "north-children";
    activeKids.forEach(kid => wrap.appendChild(renderNorthNode(kid, children, byId, depth + 1)));
    if (doneKids.length) {
      doneKids.forEach(kid => wrap.appendChild(renderNorthNode(kid, children, byId, depth + 1)));
    }
    el.appendChild(wrap);
  }

  return el;
}

// ── Wake view ─────────────────────────────────────────────────────────────────

async function loadWake() {
  const res = await apiFetch("/api/events?limit=300");
  if (!res || !res.ok) return;
  renderWake(await res.json());
}

function renderWake(events) {
  const feed = document.getElementById("wake-feed");
  feed.innerHTML = "";

  if (!events.length) {
    feed.innerHTML = `<div class="empty-state">Your trail is empty.<br><br>Complete items and they'll appear here — a record of what you've actually done.</div>`;
    return;
  }

  const weeks = groupEventsByWeek(events);
  weeks.forEach(({ label, items: wEvents }) => {
    const sec = document.createElement("div");
    sec.className = "wake-week";
    sec.innerHTML = `<div class="wake-week-label">${label}</div>`;
    wEvents.forEach(e => {
      const row = document.createElement("div");
      row.className = `wake-event wake-${e.event}`;
      const icons = { completed: "✓", created: "+", status_changed: "→",
                      deadline_changed: "~", linked: "⌥", abandoned: "↓" };
      const dateStr = new Date(e.created_at + "Z").toLocaleDateString("en-GB",
        { day: "numeric", month: "short" });
      row.innerHTML = `
        <span class="wake-icon">${icons[e.event] || "·"}</span>
        <div class="wake-body">
          <span class="wake-title">${escHtml(e.item_title)}</span>
          ${e.parent_title ? `<span class="wake-parent">↑ ${escHtml(e.parent_title)}</span>` : ""}
          ${e.detail && e.event !== "created" && e.event !== "completed"
            ? `<span class="wake-detail">${escHtml(e.detail)}</span>` : ""}
        </div>
        <span class="wake-date">${dateStr}</span>`;
      sec.appendChild(row);
    });
    feed.appendChild(sec);
  });
}

function groupEventsByWeek(events) {
  const weeks = {};
  const now = new Date();
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  thisMonday.setHours(0, 0, 0, 0);

  events.forEach(e => {
    const d = new Date(e.created_at + "Z");
    const mon = new Date(d);
    mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    mon.setHours(0, 0, 0, 0);
    const key = mon.toISOString().slice(0, 10);
    if (!weeks[key]) {
      const diffWeeks = Math.round((thisMonday - mon) / (7 * 864e5));
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      const fmt = d => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      const label = diffWeeks === 0 ? "This week"
                  : diffWeeks === 1 ? "Last week"
                  : `${fmt(mon)} – ${fmt(sun)}`;
      weeks[key] = { label, items: [] };
    }
    weeks[key].items.push(e);
  });

  return Object.entries(weeks)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([, v]) => v);
}

// ── Parent selector ───────────────────────────────────────────────────────────

function populateParentSelector(items) {
  const sel = document.getElementById("task-parent");
  if (!sel) return;
  while (sel.options.length > 1) sel.remove(1);
  const candidates = items.filter(i => i.status !== "done" && i.status !== "someday");
  const aims    = candidates.filter(i => COMMITMENT_TYPES.has(i.type));
  const actions = candidates.filter(i => !COMMITMENT_TYPES.has(i.type));
  [[aims, "Aims"], [actions, "Actions"]].forEach(([group, label]) => {
    if (!group.length) return;
    const grp = document.createElement("optgroup");
    grp.label = label;
    group.forEach(i => {
      const opt = document.createElement("option");
      opt.value = i.id;
      opt.textContent = i.title.length > 48 ? i.title.slice(0, 48) + "…" : i.title;
      grp.appendChild(opt);
    });
    sel.appendChild(grp);
  });
}

// ── Shared item rendering (used in Now) ───────────────────────────────────────

function renderActionItem(t) {
  return renderNowItem_standalone(t);
}

function renderNowItem_standalone(t) {
  const isDone = t.status === "done";
  const el = document.createElement("div");
  el.className = `task-item${isDone ? " done" : ""}`;
  const dl = t.deadline ? new Date(t.deadline).toLocaleString("en-GB", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  }) : "";
  el.innerHTML = `
    <div class="task-check${isDone ? " done" : ""}"></div>
    <div class="task-body">
      <div class="task-title">${escHtml(t.title)}</div>
      ${t.description ? `<div class="task-notes">${escHtml(t.description)}</div>` : ""}
      ${dl ? `<div class="task-deadline"><i data-lucide="clock-3"></i>${dl}</div>` : ""}
    </div>
    <div class="task-actions">
      <button class="task-edit icon-btn" title="Edit"><i data-lucide="pencil"></i></button>
      <button class="del" title="Delete"><i data-lucide="x"></i></button>
    </div>`;
  refreshIcons(el);
  el.querySelector(".task-check").addEventListener("click", () =>
    isDone ? updateItemStatus(t.id, "todo") : markItemDone(t.id)
  );
  el.querySelector(".task-edit").addEventListener("click", () => openEditItem(t));
  el.querySelector(".del").addEventListener("click", () => deleteItem(t.id));
  return el;
}

document.getElementById("task-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = document.getElementById("task-title").value.trim();
  if (!title) return;

  const isCommitment = taskType === "goal";
  const deadline    = isCommitment ? null : (document.getElementById("task-deadline").value || null);
  const horizon     = isCommitment
    ? document.getElementById("goal-horizon").value
    : (deadline ? deadlineToHorizon(deadline) : "week");
  const description = document.getElementById("task-notes").value.trim();

  const parentVal = document.getElementById("task-parent").value;
  await apiFetch("/api/items", {
    method: "POST",
    body: JSON.stringify({
      type: isCommitment ? "commitment" : "action",
      title, description, deadline, horizon,
      parent_id: parentVal ? parseInt(parentVal) : null,
      notify_whatsapp: taskWAEnabled,
    }),
  });

  document.getElementById("task-title").value = "";
  document.getElementById("task-deadline").value = "";
  document.getElementById("task-notes").value = "";
  document.getElementById("task-parent").value = "";
  taskWAEnabled = false;
  updateWAToggle();
  loadTasks();
});

async function markItemDone(id) {
  await apiFetch(`/api/items/${id}`, { method: "PATCH", body: JSON.stringify({ status: "done" }) });
  await loadTasks();
  if (currentBuildView === "wake") loadWake();
}

async function updateItemStatus(id, status) {
  await apiFetch(`/api/items/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
  loadTasks();
}

async function deleteItem(id) {
  await apiFetch(`/api/items/${id}`, { method: "DELETE" });
  loadTasks();
}

// Keep old names as aliases so any stray references still work
const toggleTask = (id, done) => done ? markItemDone(id) : updateItemStatus(id, "todo");
const deleteTask = deleteItem;

function openEditItem(t) {
  const existing = document.getElementById("edit-task-modal");
  if (existing) existing.remove();

  const isCommitment = COMMITMENT_TYPES.has(t.type);
  const modal = document.createElement("div");
  modal.id = "edit-task-modal";
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <span>Edit ${isCommitment ? (t.type === "project" ? "Project" : "Commitment") : "Action"}</span>
        <button class="modal-close" id="edit-close">×</button>
      </div>
      <form id="edit-task-form">
        <label>Title</label>
        <input id="edit-title" value="${escHtml(t.title)}" required />
        <label>Description</label>
        <input id="edit-notes" value="${escHtml(t.description || "")}" placeholder="Optional" />
        ${isCommitment ? `
        <label>Horizon</label>
        <select id="edit-horizon">
          <option value="month"   ${t.horizon==="month"   ?"selected":""}>This month</option>
          <option value="quarter" ${t.horizon==="quarter" ?"selected":""}>This quarter</option>
          <option value="year"    ${t.horizon==="year"    ?"selected":""}>This year</option>
          <option value="life"    ${t.horizon==="life"    ?"selected":""}>Long-term</option>
        </select>` : `
        <label>Status</label>
        <select id="edit-status">
          <option value="todo"        ${t.status==="todo"        ?"selected":""}>To do</option>
          <option value="in_progress" ${t.status==="in_progress" ?"selected":""}>In progress</option>
          <option value="waiting"     ${t.status==="waiting"     ?"selected":""}>Waiting</option>
          <option value="someday"     ${t.status==="someday"     ?"selected":""}>Someday / Maybe</option>
        </select>
        <label>Deadline</label>
        <input id="edit-deadline" type="datetime-local" value="${t.deadline ? t.deadline.slice(0,16) : ""}" />
        <label class="toggle-row"><span>WhatsApp reminder</span><input type="checkbox" id="edit-wa" ${t.notify_whatsapp?"checked":""} /></label>`}
        <button type="submit">Save</button>
      </form>
    </div>`;

  document.body.appendChild(modal);
  modal.style.display = "flex";
  modal.querySelector("#edit-close").addEventListener("click", () => modal.remove());
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });

  modal.querySelector("#edit-task-form").addEventListener("submit", async e => {
    e.preventDefault();
    const update = {
      title:       document.getElementById("edit-title").value.trim(),
      description: document.getElementById("edit-notes").value.trim(),
    };
    if (isCommitment) {
      update.horizon = document.getElementById("edit-horizon").value;
    } else {
      update.status   = document.getElementById("edit-status").value;
      update.deadline = document.getElementById("edit-deadline").value || null;
      update.notify_whatsapp = document.getElementById("edit-wa").checked;
      if (update.deadline) update.horizon = deadlineToHorizon(update.deadline);
    }
    await apiFetch(`/api/items/${t.id}`, { method: "PATCH", body: JSON.stringify(update) });
    modal.remove();
    loadTasks();
  });
}

// alias kept for any stale references
const openEditTask = openEditItem;

// ── Settings ──────────────────────────────────────────────────────────────────

async function openSettings() {
  document.getElementById("settings-modal").style.display = "flex";
  refreshIcons(document.getElementById("settings-modal"));
  const res = await apiFetch("/api/settings");
  if (!res) return;
  const d = await res.json();
  document.getElementById("settings-notes-dir").placeholder = `~/Documents/engram/engram-${username}-default`;
  document.getElementById("settings-notes-dir").value = d.notes_dir || "";
  document.getElementById("settings-whatsapp").value = d.whatsapp_number || "";
  document.getElementById("settings-apikey").value = d.callmebot_apikey || "";
  document.getElementById("settings-tg-token").value = d.telegram_token || "";
  document.getElementById("settings-tg-chat").value = d.telegram_chat_id || "";
  document.getElementById("settings-error").textContent = "";
  document.getElementById("settings-success").textContent = "";
}
document.getElementById("settings-btn").addEventListener("click", openSettings);
document.getElementById("topbar-settings-btn").addEventListener("click", openSettings);

document.getElementById("settings-close").addEventListener("click", () => {
  document.getElementById("settings-modal").style.display = "none";
});
document.getElementById("settings-modal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) e.currentTarget.style.display = "none";
});

document.getElementById("settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = document.getElementById("settings-error");
  const okEl  = document.getElementById("settings-success");
  errEl.textContent = ""; okEl.textContent = "";

  const res = await apiFetch("/api/settings", {
    method: "POST",
    body: JSON.stringify({
      notes_dir: document.getElementById("settings-notes-dir").value.trim(),
      whatsapp_number: document.getElementById("settings-whatsapp").value.trim(),
      callmebot_apikey: document.getElementById("settings-apikey").value.trim(),
      telegram_token: document.getElementById("settings-tg-token").value.trim(),
      telegram_chat_id: document.getElementById("settings-tg-chat").value.trim(),
    }),
  });
  if (!res) return;
  if (!res.ok) { const d = await res.json(); errEl.textContent = d.detail || "Error"; return; }
  okEl.textContent = "Saved.";
  whatsappConfigured = !!(
    document.getElementById("settings-whatsapp").value.trim() &&
    document.getElementById("settings-apikey").value.trim()
  );
  updateWAToggle();
});

document.getElementById("test-whatsapp-btn").addEventListener("click", async () => {
  const btn = document.getElementById("test-whatsapp-btn");
  const errEl = document.getElementById("settings-error");
  const okEl  = document.getElementById("settings-success");
  btn.textContent = "Sending..."; btn.disabled = true;
  errEl.textContent = ""; okEl.textContent = "";

  const res = await apiFetch("/api/settings/test-whatsapp", { method: "POST" });
  btn.textContent = "Test WhatsApp"; btn.disabled = false;
  if (!res) return;
  if (!res.ok) { const d = await res.json(); errEl.textContent = d.detail || "Failed"; return; }
  okEl.textContent = "Test message sent!";
});

// ── Icons (Lucide) ────────────────────────────────────────────────────────────

function refreshIcons(el) {
  if (window.lucide) lucide.createIcons({ nodes: el ? [el] : undefined });
}

// Init after DOM ready
document.addEventListener("DOMContentLoaded", () => refreshIcons());

// ── Theme ─────────────────────────────────────────────────────────────────────

function applyTheme(name) {
  const theme = name || "tokyonight";
  document.documentElement.dataset.theme = theme;
  document.querySelectorAll(".theme-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.theme === theme)
  );
  localStorage.setItem("theme", theme);
}

document.querySelectorAll(".theme-btn").forEach(btn => {
  btn.addEventListener("click", () => applyTheme(btn.dataset.theme));
});

// ── Mobile cheat sheet FAB ────────────────────────────────────────────────────

const csFab     = document.getElementById("cs-fab");
const csSheet   = document.getElementById("cs-sheet");
const csOverlay = document.getElementById("cs-overlay");

function openCheatSheet()  { csSheet.classList.add("open"); csOverlay.classList.add("open"); refreshIcons(csFab); }
function closeCheatSheet() { csSheet.classList.remove("open"); csOverlay.classList.remove("open"); }

csFab.addEventListener("click", openCheatSheet);
csOverlay.addEventListener("click", closeCheatSheet);

// Show FAB only when in journal write mode on mobile
function updateFab() {
  const isMobile   = window.innerWidth <= 680;
  const isJournal  = document.getElementById("journal")?.classList.contains("active");
  const isWrite    = journalMode === "write";
  csFab.style.display = (isMobile && isJournal && isWrite) ? "flex" : "none";
}
window.addEventListener("resize", updateFab);
// Called after mode/tab changes in setJournalMode and switchTab

// ── Schedule — Day & Week views ───────────────────────────────────────────────

const SCHED_START   = 6;          // 6 am
const SCHED_END     = 23;         // 11 pm
const PX_HR         = 72;         // pixels per hour
const SCHED_COLORS  = [
  { bg: "rgba(79,142,247,0.16)",  border: "#4f8ef7"  },
  { bg: "rgba(76,175,128,0.16)",  border: "#4caf80"  },
  { bg: "rgba(191,106,247,0.16)", border: "#bf6af7"  },
  { bg: "rgba(232,164,74,0.16)",  border: "#e8a44a"  },
  { bg: "rgba(93,228,199,0.16)",  border: "#5de4c7"  },
  { bg: "rgba(247,79,106,0.16)",  border: "#f74f6a"  },
];

let schedDate    = new Date();
let schedMode    = "day";   // "day" | "week"
let nowLineTimer = null;

function schedColor(item) {
  return SCHED_COLORS[(item.parent_id || item.id) % SCHED_COLORS.length];
}

function timeToTop(dtStr) {
  const t    = new Date(dtStr);
  const mins = (t.getHours() - SCHED_START) * 60 + t.getMinutes();
  return Math.max(0, mins * (PX_HR / 60));
}

function durationToHeight(startStr, endStr) {
  const s    = new Date(startStr);
  const e    = new Date(endStr);
  const mins = Math.max(15, (e - s) / 60000);
  return mins * (PX_HR / 60);
}

function dateKey(d) {
  return d.toISOString().slice(0, 10);
}

function isSameDay(dtStr, d) {
  return dtStr && dtStr.slice(0, 10) === dateKey(d);
}

function weekStart(d) {
  const m = new Date(d);
  m.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  m.setHours(0, 0, 0, 0);
  return m;
}

// ── Block picker (click on empty slot) ───────────────────────────────────────

let pickerEl = null;

function closePicker() {
  if (pickerEl) { pickerEl.remove(); pickerEl = null; }
}

function openBlockPicker(date, clickY, existingItem = null) {
  closePicker();

  const clickMins  = Math.floor((clickY / (PX_HR / 60)) / 15) * 15;
  const startHour  = Math.floor(clickMins / 60) + SCHED_START;
  const startMin   = clickMins % 60;
  const endHour    = startHour + (existingItem ? 0 : 1);
  const endMin     = startMin;
  const pad        = n => String(n).padStart(2, "0");
  const dateStr    = dateKey(date);
  const defStart   = `${dateStr}T${pad(startHour)}:${pad(startMin)}`;
  const defEnd     = existingItem
    ? (existingItem.scheduled_end || `${dateStr}T${pad(endHour)}:${pad(endMin)}`)
    : `${dateStr}T${pad(endHour)}:${pad(endMin)}`;

  const unscheduled = allItems.filter(i =>
    i.status !== "done" && i.status !== "someday" && !i.scheduled_start
  );

  pickerEl = document.createElement("div");
  pickerEl.className = "block-picker";

  if (existingItem) {
    pickerEl.innerHTML = `
      <div class="bp-title">${escHtml(existingItem.title)}</div>
      <div class="bp-row">
        <input class="bp-time" id="bp-start" type="time" value="${defStart.slice(11,16)}" />
        <span class="bp-sep">–</span>
        <input class="bp-time" id="bp-end" type="time" value="${defEnd.slice(11,16)}" />
      </div>
      <div class="bp-actions">
        <button class="bp-save">Save</button>
        <button class="bp-unschedule">Remove block</button>
        <button class="bp-cancel">Cancel</button>
      </div>`;
    pickerEl.querySelector(".bp-save").addEventListener("click", async () => {
      const s = `${dateStr}T${pickerEl.querySelector("#bp-start").value}`;
      const e = `${dateStr}T${pickerEl.querySelector("#bp-end").value}`;
      await apiFetch(`/api/items/${existingItem.id}`,
        { method: "PATCH", body: JSON.stringify({ scheduled_start: s, scheduled_end: e }) });
      closePicker(); loadSchedule();
    });
    pickerEl.querySelector(".bp-unschedule").addEventListener("click", async () => {
      await apiFetch(`/api/items/${existingItem.id}`,
        { method: "PATCH", body: JSON.stringify({ scheduled_start: "", scheduled_end: "" }) });
      closePicker(); loadSchedule();
    });
  } else {
    const opts = unscheduled.map(i =>
      `<option value="${i.id}">${escHtml(i.title.slice(0, 50))}</option>`
    ).join("");
    pickerEl.innerHTML = `
      <div class="bp-title">New block</div>
      <div class="bp-row">
        <input class="bp-time" id="bp-start" type="time" value="${defStart.slice(11,16)}" />
        <span class="bp-sep">–</span>
        <input class="bp-time" id="bp-end" type="time" value="${defEnd.slice(11,16)}" />
      </div>
      <select class="bp-select" id="bp-item">
        <option value="">— pick an item —</option>
        ${opts}
      </select>
      <div class="bp-actions">
        <button class="bp-save">Block it</button>
        <button class="bp-cancel">Cancel</button>
      </div>`;
    pickerEl.querySelector(".bp-save").addEventListener("click", async () => {
      const itemId = parseInt(pickerEl.querySelector("#bp-item").value);
      if (!itemId) return;
      const s = `${dateStr}T${pickerEl.querySelector("#bp-start").value}`;
      const e = `${dateStr}T${pickerEl.querySelector("#bp-end").value}`;
      await apiFetch(`/api/items/${itemId}`,
        { method: "PATCH", body: JSON.stringify({ scheduled_start: s, scheduled_end: e }) });
      closePicker(); loadSchedule();
    });
  }

  pickerEl.querySelector(".bp-cancel").addEventListener("click", closePicker);
  document.getElementById("schedule-root").appendChild(pickerEl);

  // Position near click but keep on screen
  const rootRect = document.getElementById("schedule-root").getBoundingClientRect();
  const pickerH  = 200;
  const top      = Math.min(clickY + rootRect.top - 80, window.innerHeight - pickerH - 20);
  pickerEl.style.top  = `${top}px`;
  pickerEl.style.left = `${rootRect.left + rootRect.width / 2 - 130}px`;

  // Close on outside click
  setTimeout(() => document.addEventListener("click", function handler(e) {
    if (pickerEl && !pickerEl.contains(e.target)) { closePicker(); document.removeEventListener("click", handler); }
  }), 10);
}

// ── Overlap resolver ──────────────────────────────────────────────────────────

function resolveOverlaps(blocks) {
  blocks.sort((a, b) => a.top - b.top);
  const cols = [];
  blocks.forEach(b => {
    let placed = false;
    for (let c = 0; c < cols.length; c++) {
      const last = cols[c][cols[c].length - 1];
      if (b.top >= last.top + last.height) { cols[c].push(b); b.col = c; placed = true; break; }
    }
    if (!placed) { b.col = cols.length; cols.push([b]); }
  });
  const total = cols.length;
  blocks.forEach(b => { b.colCount = total; });
  return blocks;
}

// ── Timeline builder (shared by day and each week-day column) ─────────────────

function buildTimeline(date, scheduled, unscheduled, compact = false) {
  const hours  = SCHED_END - SCHED_START;
  const totalH = hours * PX_HR;
  const pxMin  = PX_HR / 60;

  const wrap = document.createElement("div");
  wrap.className = compact ? "tl-wrap tl-compact" : "tl-wrap";
  wrap.style.height = `${totalH}px`;

  // Hour lines + labels
  for (let h = 0; h <= hours; h++) {
    const hr = h + SCHED_START;
    const line = document.createElement("div");
    line.className = "tl-hour-line";
    line.style.top = `${h * PX_HR}px`;
    if (!compact) {
      line.innerHTML = `<span class="tl-hour-label">${hr === 12 ? "12 pm" : hr > 12 ? `${hr-12} pm` : `${hr} am`}</span>`;
    }
    wrap.appendChild(line);

    // Half-hour tick
    if (h < hours) {
      const half = document.createElement("div");
      half.className = "tl-half-line";
      half.style.top = `${h * PX_HR + PX_HR / 2}px`;
      wrap.appendChild(half);
    }
  }

  // Current time indicator (today only)
  if (dateKey(date) === dateKey(new Date())) {
    const updateNowLine = () => {
      const old = wrap.querySelector(".tl-now");
      if (old) old.remove();
      const now = new Date();
      const mins = (now.getHours() - SCHED_START) * 60 + now.getMinutes();
      if (mins < 0 || mins > hours * 60) return;
      const top = mins * pxMin;
      const el = document.createElement("div");
      el.className = "tl-now";
      el.style.top = `${top}px`;
      el.innerHTML = `<div class="tl-now-dot"></div>`;
      wrap.appendChild(el);
    };
    updateNowLine();
    if (nowLineTimer) clearInterval(nowLineTimer);
    nowLineTimer = setInterval(updateNowLine, 60000);
  }

  // Blocks
  const blockData = scheduled.map(item => ({
    item,
    top:    timeToTop(item.scheduled_start),
    height: item.scheduled_end
      ? durationToHeight(item.scheduled_start, item.scheduled_end)
      : PX_HR,  // 1-hour default if no end
    col: 0, colCount: 1,
  }));
  resolveOverlaps(blockData);

  const LABEL_W = compact ? 0 : 56;

  blockData.forEach(({ item, top, height, col, colCount }) => {
    const color = schedColor(item);
    const availW = 100;
    const w = `calc(${availW / colCount}% - 4px)`;
    const l = `calc(${LABEL_W}px + ${(col / colCount) * (100 - (LABEL_W > 0 ? LABEL_W / wrap.offsetWidth * 100 : 0))}%)`;

    const startLabel = item.scheduled_start.slice(11, 16);
    const endLabel   = item.scheduled_end ? item.scheduled_end.slice(11, 16) : "";
    const parent     = item.parent_id && allItems.find(i => i.id === item.parent_id);

    const el = document.createElement("div");
    el.className = "sched-block";
    el.style.cssText = `
      top:${top}px; height:${Math.max(24, height)}px;
      left:${LABEL_W + 4 + col * 4}px;
      right:${(colCount - col - 1) * 4 + 4}px;
      background:${color.bg}; border-left-color:${color.border};`;
    el.innerHTML = `
      <div class="sb-time">${startLabel}${endLabel ? " – " + endLabel : ""}</div>
      <div class="sb-title">${escHtml(item.title)}</div>
      ${parent && height > 40 ? `<div class="sb-parent">↑ ${escHtml(parent.title)}</div>` : ""}`;
    el.addEventListener("click", e => {
      e.stopPropagation();
      openBlockPicker(date, top, item);
    });
    wrap.appendChild(el);
  });

  // Click empty area → picker
  wrap.addEventListener("click", e => {
    if (e.target.closest(".sched-block") || e.target.closest(".tl-hour-label")) return;
    const rect = wrap.getBoundingClientRect();
    const y    = e.clientY - rect.top;
    openBlockPicker(date, y);
  });

  return { wrap, unscheduled };
}

// ── Day view ─────────────────────────────────────────────────────────────────

function renderDayView() {
  const root = document.getElementById("schedule-root");
  root.innerHTML = "";

  const today  = dateKey(schedDate);
  const sched  = allItems.filter(i => i.scheduled_start && isSameDay(i.scheduled_start, schedDate));
  const unschd = allItems.filter(i =>
    !i.scheduled_start && i.status !== "done" && i.status !== "someday" &&
    (i.horizon === "today" || (i.deadline && i.deadline.slice(0, 10) === today))
  );

  // Header
  const header = document.createElement("div");
  header.className = "sched-header";
  const label = schedDate.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  header.innerHTML = `
    <div class="sched-nav">
      <button class="sched-nav-btn" id="sched-prev"><i data-lucide="chevron-left"></i></button>
      <span class="sched-date-label">${label}</span>
      <button class="sched-nav-btn" id="sched-next"><i data-lucide="chevron-right"></i></button>
      <button class="sched-today-btn" id="sched-today">Today</button>
    </div>
    <div class="sched-mode-toggle">
      <button class="sched-mode-btn active" data-mode="day">Day</button>
      <button class="sched-mode-btn" data-mode="week">Week</button>
    </div>
    <button class="sched-suggest-btn" id="sched-suggest">
      <i data-lucide="sparkles"></i> Suggest
    </button>`;
  root.appendChild(header);
  refreshIcons(header);
  wireSchedHeader();

  // Body: unscheduled sidebar + timeline
  const body = document.createElement("div");
  body.className = "sched-day-body";

  // Unscheduled sidebar
  const sidebar = document.createElement("div");
  sidebar.className = "sched-unscheduled";
  sidebar.innerHTML = `<div class="sched-unschd-label">Unscheduled</div>`;
  if (!unschd.length) {
    sidebar.innerHTML += `<div class="sched-unschd-empty">All clear</div>`;
  } else {
    unschd.forEach(item => {
      const chip = document.createElement("div");
      chip.className = "sched-unschd-chip";
      chip.textContent = item.title;
      chip.draggable = true;
      chip.dataset.id = item.id;
      sidebar.appendChild(chip);
    });
  }
  body.appendChild(sidebar);

  // Timeline scroll wrapper
  const scrollWrap = document.createElement("div");
  scrollWrap.className = "sched-scroll";
  const { wrap } = buildTimeline(schedDate, sched, unschd);
  scrollWrap.appendChild(wrap);
  body.appendChild(scrollWrap);
  root.appendChild(body);

  // Scroll to 8am on load
  requestAnimationFrame(() => {
    scrollWrap.scrollTop = (8 - SCHED_START) * PX_HR - 24;
  });
}

// ── Week view ─────────────────────────────────────────────────────────────────

function renderWeekView() {
  const root = document.getElementById("schedule-root");
  root.innerHTML = "";

  const ws    = weekStart(schedDate);
  const days  = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(ws); d.setDate(ws.getDate() + i); return d;
  });
  const todayStr = dateKey(new Date());

  // Header
  const header = document.createElement("div");
  header.className = "sched-header";
  const wEnd  = new Date(ws); wEnd.setDate(ws.getDate() + 6);
  const wLabel = `${ws.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${wEnd.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
  header.innerHTML = `
    <div class="sched-nav">
      <button class="sched-nav-btn" id="sched-prev"><i data-lucide="chevron-left"></i></button>
      <span class="sched-date-label">${wLabel}</span>
      <button class="sched-nav-btn" id="sched-next"><i data-lucide="chevron-right"></i></button>
      <button class="sched-today-btn" id="sched-today">Today</button>
    </div>
    <div class="sched-mode-toggle">
      <button class="sched-mode-btn" data-mode="day">Day</button>
      <button class="sched-mode-btn active" data-mode="week">Week</button>
    </div>
    <button class="sched-suggest-btn" id="sched-suggest">
      <i data-lucide="sparkles"></i> Suggest week
    </button>`;
  root.appendChild(header);
  refreshIcons(header);
  wireSchedHeader();

  // Grid
  const grid = document.createElement("div");
  grid.className = "sched-week-grid";

  // Time gutter
  const gutter = document.createElement("div");
  gutter.className = "sched-week-gutter";
  for (let h = SCHED_START; h <= SCHED_END; h++) {
    const lbl = document.createElement("div");
    lbl.className = "sched-week-hour-lbl";
    lbl.style.top = `${(h - SCHED_START) * PX_HR}px`;
    lbl.textContent = h === 12 ? "12p" : h > 12 ? `${h-12}p` : `${h}a`;
    gutter.appendChild(lbl);
  }
  grid.appendChild(gutter);

  // Day columns
  days.forEach(day => {
    const dk   = dateKey(day);
    const sched = allItems.filter(i => i.scheduled_start && isSameDay(i.scheduled_start, day));
    const isToday = dk === todayStr;

    const col = document.createElement("div");
    col.className = `sched-week-col${isToday ? " sched-today-col" : ""}`;

    const dayHdr = document.createElement("div");
    dayHdr.className = `sched-week-day-hdr${isToday ? " is-today" : ""}`;
    dayHdr.innerHTML = `
      <span class="sched-week-dow">${day.toLocaleDateString("en-GB", { weekday: "short" })}</span>
      <span class="sched-week-dom">${day.getDate()}</span>`;
    dayHdr.addEventListener("click", () => {
      schedDate = day; schedMode = "day"; renderDayView();
    });
    col.appendChild(dayHdr);

    const tlWrap = document.createElement("div");
    tlWrap.className = "sched-week-tl";
    const { wrap } = buildTimeline(day, sched, [], true);
    tlWrap.appendChild(wrap);
    col.appendChild(tlWrap);
    grid.appendChild(col);
  });

  const scrollWrap = document.createElement("div");
  scrollWrap.className = "sched-week-scroll";
  scrollWrap.appendChild(grid);
  root.appendChild(scrollWrap);

  requestAnimationFrame(() => {
    scrollWrap.scrollTop = (8 - SCHED_START) * PX_HR - 24;
  });
}

// ── Header wiring ─────────────────────────────────────────────────────────────

function wireSchedHeader() {
  document.getElementById("sched-prev")?.addEventListener("click", () => {
    if (schedMode === "day") {
      schedDate.setDate(schedDate.getDate() - 1);
    } else {
      schedDate.setDate(schedDate.getDate() - 7);
    }
    renderSchedule();
  });
  document.getElementById("sched-next")?.addEventListener("click", () => {
    if (schedMode === "day") {
      schedDate.setDate(schedDate.getDate() + 1);
    } else {
      schedDate.setDate(schedDate.getDate() + 7);
    }
    renderSchedule();
  });
  document.getElementById("sched-today")?.addEventListener("click", () => {
    schedDate = new Date(); renderSchedule();
  });
  document.querySelectorAll(".sched-mode-btn").forEach(btn =>
    btn.addEventListener("click", () => {
      schedMode = btn.dataset.mode; renderSchedule();
    })
  );
  document.getElementById("sched-suggest")?.addEventListener("click", () => {
    const d = schedDate.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
    const msg = schedMode === "day"
      ? `Plan my day for ${d}. List my open items, then schedule the most important ones with time blocks. Leave gaps between blocks for breaks.`
      : `Plan my week of ${d}. Look at all my open items and deadlines. Create time blocks across the week for my most important work.`;
    switchTab("journal");
    setJournalMode("chat");
    const ci = document.getElementById("chat-input");
    ci.value = msg;
    sendChat();
  });
}

// ── Entry point ───────────────────────────────────────────────────────────────

function loadSchedule() {
  if (!allItems.length) {
    apiFetch("/api/items").then(async r => {
      if (r) { allItems = await r.json(); populateParentSelector(allItems); }
      renderSchedule();
    });
  } else {
    renderSchedule();
  }
}

function renderSchedule() {
  if (schedMode === "day") renderDayView();
  else renderWeekView();
}

// Hook schedule_item tool card + reload schedule if active
const _origSwitchBuild = switchBuildView;

// Apply on load — Light is default
applyTheme(localStorage.getItem("theme") || "light");

// ── Boot ──────────────────────────────────────────────────────────────────────

if (token) { showApp(); } else { showAuth(); }
