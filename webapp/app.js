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
  // Always open on journal/write — chat no longer has its own tab
  localStorage.removeItem("lastTab");
  switchTab("journal");
  setJournalMode("write");
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
}

// Sidebar nav
document.querySelectorAll(".tab[data-tab]").forEach((btn) => {
  btn.addEventListener("click", () => {
    switchTab(btn.dataset.tab);
    if (btn.dataset.tab === "reflection") loadCharts();
    if (btn.dataset.tab === "journal") {
      setJournalMode("write"); // always return to write mode
    }
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

  document.querySelectorAll(".mt-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.mode === mode)
  );
  localStorage.setItem("journalMode", mode);
}

document.querySelectorAll(".mt-btn").forEach(btn => {
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

// ── Chat ──────────────────────────────────────────────────────────────────────

const messagesEl = document.getElementById("messages");
const chatInput = document.getElementById("chat-input");

function appendMessage(role, content, streaming = false) {
  const wrap = document.createElement("div");
  wrap.className = `msg-wrap msg-wrap--${role}`;

  const el = document.createElement("div");
  el.className = `msg ${role}`;

  if (streaming && !content) {
    // Show typing indicator until first token arrives
    el.classList.add("typing");
    el.innerHTML = `<div class="typing-dots"><span></span><span></span><span></span></div>`;
  } else {
    el.textContent = content;
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
  messages.forEach((m) => appendMessage(m.role, m.content));
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
  create_task:        { icon: "pin",         label: "Committed" },
  list_tasks:         { icon: "list-checks", label: "Checked tasks" },
  read_journal:       { icon: "book-open",   label: "Read journal" },
  list_journal_files: { icon: "folder",      label: "Browsed notes" },
  save_note:          { icon: "bookmark-plus", label: "Remembered" },
  web_search:         { icon: "search",      label: "Searched" },
};

function appendToolCard(name, args, result) {
  const meta = TOOL_LABELS[name] || { icon: "🔧", label: name };
  const el = document.createElement("div");
  el.className = "tool-card";

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
    if (name === "create_task")  detail = `<strong>${escHtml(args.title || "")}</strong>${args.deadline ? " · " + args.deadline.replace("T"," ") : ""}`;
    if (name === "read_journal") detail = args.date || "";
    if (name === "save_note")    detail = escHtml(args.content || "");
    if (name === "list_tasks")   detail = `${(result.tasks || []).length} item(s)`;
    if (name === "list_journal_files") detail = `${(result.files || []).length} file(s)`;
    el.innerHTML = `
      <i data-lucide="${meta.icon}" class="tool-icon"></i>
      <span class="tool-label">${meta.label}</span>
      ${detail ? `<span class="tool-detail">${detail}</span>` : ""}`;
    refreshIcons(el);
  }

  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function sendChat() {
  const text = chatInput.value.trim();
  if (!text) return;
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
        if (botEl.classList.contains("typing")) botEl.textContent = "…";
        break;
      }
      try {
        const data = JSON.parse(payload);
        if (data.tool) {
          appendToolCard(data.tool, data.args || {}, data.result || {});
          if (data.tool === "create_task") loadTasks();
        } else if (data.token) {
          // First token — swap typing dots for streaming text
          if (botEl.classList.contains("typing")) {
            botEl.classList.remove("typing");
            botEl.innerHTML = "";
            botEl.classList.add("streaming");
          }
          fullText += data.token;
          botEl.textContent = fullText.replace(/```memory[\s\S]*?```/g, "").trim();
          messagesEl.scrollTop = messagesEl.scrollHeight;
        }
      } catch (_) {}
    }
  }
}

chatInput.addEventListener("input", () => {
  chatInput.style.height = "auto";
  chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + "px";
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

// ── Tasks ─────────────────────────────────────────────────────────────────────

let taskWAEnabled = false;
let whatsappConfigured = false;
let taskType = "task"; // "task" | "goal"

function escHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Type toggle
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

async function loadTasks() {
  await checkWhatsappConfig();
  const res = await apiFetch("/api/tasks");
  if (!res) return;
  renderTasks(await res.json());
}

const HORIZON_LABEL = {
  today: "Today", week: "This week", month: "This month",
  quarter: "This quarter", year: "This year", life: "Long-term",
};

const GOAL_HORIZONS = new Set(["year", "life"]);

function deadlineToHorizon(dl) {
  const days = (new Date(dl) - new Date()) / 864e5;
  if (days <= 1) return "today";
  if (days <= 7) return "week";
  if (days <= 30) return "month";
  return "quarter";
}

function renderTasks(tasks) {
  const list = document.getElementById("task-list");
  list.innerHTML = "";

  const goals = tasks.filter(t => GOAL_HORIZONS.has(t.horizon || "") && !t.done);
  const active = tasks.filter(t => !GOAL_HORIZONS.has(t.horizon || "") && !t.done);
  const done   = tasks.filter(t => t.done);

  if (!tasks.length) {
    list.innerHTML = `<div class="empty-state">Nothing here yet.<br><br>Add a <strong>Commitment</strong> for something you're building long-term,<br>or an <strong>Action</strong> for something to do now.<br><br>Or just tell Quanta in chat — it will create them for you.</div>`;
    return;
  }

  // ── Commitments section ──────────────────────────────────────────
  if (goals.length) {
    const sec = document.createElement("div");
    sec.className = "goals-section";
    sec.innerHTML = `<div class="goals-section-label">Commitments</div>`;
    goals.forEach(g => sec.appendChild(renderGoalCard(g)));
    list.appendChild(sec);
  }

  // ── Actions section ──────────────────────────────────────────────
  if (active.length || done.length) {
    const sec = document.createElement("div");
    sec.className = "tasks-section";
    sec.innerHTML = `<div class="tasks-section-label">Actions</div>`;

    const now = new Date();
    const groups = { overdue: [], today: [], week: [], month: [], quarter: [], none: [] };

    active.forEach(t => {
      const h = t.deadline ? deadlineToHorizon(t.deadline) : (t.horizon || "none");
      const dl = t.deadline ? new Date(t.deadline) : null;
      if (dl && dl < now) groups.overdue.push(t);
      else if (groups[h]) groups[h].push(t);
      else groups.none.push(t);
    });

    const order = [
      ["overdue", "Overdue"], ["today", "Today"], ["week", "This week"],
      ["month", "This month"], ["quarter", "This quarter"], ["none", "Anytime"],
    ];
    order.forEach(([key, label]) => {
      if (!groups[key].length) return;
      const grp = document.createElement("div");
      grp.className = "task-group";
      grp.innerHTML = `<div class="task-group-label ${key}">${label}</div>`;
      groups[key].forEach(t => grp.appendChild(renderTaskItem(t)));
      sec.appendChild(grp);
    });

    if (done.length) {
      const grp = document.createElement("div");
      grp.className = "task-group";
      grp.innerHTML = `<div class="task-group-label done">Done</div>`;
      done.slice(0, 10).forEach(t => grp.appendChild(renderTaskItem(t)));
      sec.appendChild(grp);
    }

    list.appendChild(sec);
  }
}

function renderGoalCard(g) {
  const el = document.createElement("div");
  el.className = "goal-card";
  el.innerHTML = `
    <div class="goal-card-header">
      <div class="goal-card-title">${escHtml(g.title)}</div>
      <div class="goal-horizon-badge ${g.horizon}">${HORIZON_LABEL[g.horizon] || g.horizon}</div>
    </div>
    ${g.notes ? `<div class="goal-card-notes">${escHtml(g.notes)}</div>` : ""}
    <div class="goal-card-actions">
      <button class="goal-achieve-btn" data-id="${g.id}"><i data-lucide="check-circle-2"></i> Achieved</button>
      <button class="task-edit icon-btn" data-id="${g.id}" title="Edit"><i data-lucide="pencil"></i></button>
      <button class="del" data-id="${g.id}"><i data-lucide="x"></i></button>
    </div>`;
  refreshIcons(el);
  el.querySelector(".goal-achieve-btn").addEventListener("click", () => toggleTask(g.id, true));

  el.querySelector(".task-edit").addEventListener("click", () => openEditTask(g));
  el.querySelector(".del").addEventListener("click", () => deleteTask(g.id));
  return el;
}

function renderTaskItem(t) {
  const el = document.createElement("div");
  el.className = `task-item${t.done ? " done" : ""}`;
  const dl = t.deadline ? new Date(t.deadline).toLocaleString("en-GB", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
  }) : "";
  el.innerHTML = `
    <div class="task-check${t.done ? " done" : ""}"></div>
    <div class="task-body">
      <div class="task-title">${escHtml(t.title)}</div>
      ${t.notes ? `<div class="task-notes">${escHtml(t.notes)}</div>` : ""}
      ${dl ? `<div class="task-deadline"><i data-lucide="clock-3"></i>${dl}${t.notify_whatsapp ? ' <i data-lucide="phone-incoming"></i>' : ""}</div>` : ""}
    </div>
    <div class="task-actions">
      <button class="task-edit icon-btn" title="Edit"><i data-lucide="pencil"></i></button>
      <button class="del" title="Delete"><i data-lucide="x"></i></button>
    </div>`;
  refreshIcons(el);
  el.querySelector(".task-check").addEventListener("click", () => toggleTask(t.id, !t.done));
  el.querySelector(".del").addEventListener("click", () => deleteTask(t.id));
  el.querySelector(".task-edit").addEventListener("click", () => openEditTask(t));
  return el;
}

document.getElementById("task-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = document.getElementById("task-title").value.trim();
  if (!title) return;

  const isGoal = taskType === "goal";
  const deadline = isGoal ? null : (document.getElementById("task-deadline").value || null);
  const horizon  = isGoal
    ? document.getElementById("goal-horizon").value
    : (deadline ? deadlineToHorizon(deadline) : "week");
  const notes = document.getElementById("task-notes").value.trim();

  await apiFetch("/api/tasks", {
    method: "POST",
    body: JSON.stringify({ title, notes, deadline, horizon, notify_whatsapp: taskWAEnabled }),
  });

  document.getElementById("task-title").value = "";
  document.getElementById("task-deadline").value = "";
  document.getElementById("task-notes").value = "";
  taskWAEnabled = false;
  updateWAToggle();
  loadTasks();
});

async function toggleTask(id, done) {
  await apiFetch(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ done }) });
  loadTasks();
}

async function deleteTask(id) {
  await apiFetch(`/api/tasks/${id}`, { method: "DELETE" });
  loadTasks();
}

function openEditTask(t) {
  const existing = document.getElementById("edit-task-modal");
  if (existing) existing.remove();
  const isGoal = GOAL_HORIZONS.has(t.horizon || "");
  const modal = document.createElement("div");
  modal.id = "edit-task-modal";
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-box">
      <div class="modal-header"><span>Edit ${isGoal ? "Commitment" : "Action"}</span><button class="modal-close" id="edit-close">×</button></div>
      <form id="edit-task-form">
        <label>Title</label>
        <input id="edit-title" value="${escHtml(t.title)}" required />
        <label>Notes</label>
        <input id="edit-notes" value="${escHtml(t.notes || "")}" placeholder="Optional" />
        ${isGoal ? `
        <label>Horizon</label>
        <select id="edit-horizon">
          <option value="month" ${t.horizon==="month"?"selected":""}>This month</option>
          <option value="quarter" ${t.horizon==="quarter"?"selected":""}>This quarter</option>
          <option value="year" ${t.horizon==="year"?"selected":""}>This year</option>
          <option value="life" ${t.horizon==="life"?"selected":""}>Long-term</option>
        </select>` : `
        <label>Deadline</label>
        <input id="edit-deadline" type="datetime-local" value="${t.deadline ? t.deadline.slice(0,16) : ""}" />
        <label class="toggle-row"><span>WhatsApp</span><input type="checkbox" id="edit-wa" ${t.notify_whatsapp?"checked":""} /></label>`}
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
      title: document.getElementById("edit-title").value.trim(),
      notes: document.getElementById("edit-notes").value.trim(),
    };
    if (isGoal) {
      update.horizon = document.getElementById("edit-horizon").value;
    } else {
      update.deadline = document.getElementById("edit-deadline").value || null;
      update.notify_whatsapp = document.getElementById("edit-wa").checked;
      update.horizon = update.deadline ? deadlineToHorizon(update.deadline) : "week";
    }
    await apiFetch(`/api/tasks/${t.id}`, { method: "PATCH", body: JSON.stringify(update) });
    modal.remove();
    loadTasks();
  });
}

// ── Settings ──────────────────────────────────────────────────────────────────

document.getElementById("settings-btn").addEventListener("click", async () => {
  document.getElementById("settings-modal").style.display = "flex";
  refreshIcons(document.getElementById("settings-modal"));
  const res = await apiFetch("/api/settings");
  if (!res) return;
  const d = await res.json();
  document.getElementById("settings-notes-dir").value = d.notes_dir || "";
  document.getElementById("settings-whatsapp").value = d.whatsapp_number || "";
  document.getElementById("settings-apikey").value = d.callmebot_apikey || "";
  document.getElementById("settings-error").textContent = "";
  document.getElementById("settings-success").textContent = "";
});

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
  document.documentElement.dataset.theme = name || "dark";
  document.querySelectorAll(".theme-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.theme === (name || "dark"));
  });
  localStorage.setItem("theme", name || "dark");
}

document.querySelectorAll(".theme-btn").forEach(btn => {
  btn.addEventListener("click", () => applyTheme(btn.dataset.theme));
});

// Apply on load
applyTheme(localStorage.getItem("theme") || "dark");

// ── Boot ──────────────────────────────────────────────────────────────────────

if (token) { showApp(); } else { showAuth(); }
