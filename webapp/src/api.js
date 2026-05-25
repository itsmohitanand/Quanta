const BASE = "";

function getToken() { return localStorage.getItem("token"); }

function headers(extra = {}) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getToken()}`,
    ...extra,
  };
}

async function apiFetch(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { ...headers(), ...(opts.headers || {}) },
  });
  if (res.status === 401) {
    localStorage.removeItem("token");
    window.location.reload();
    return null;
  }
  return res;
}

// Auth
export async function login(username, password) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) { const d = await res.json(); throw new Error(d.detail || "Login failed"); }
  return res.json();
}

export async function register(username, password) {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) { const d = await res.json(); throw new Error(d.detail || "Register failed"); }
  return res.json();
}

// Items (tasks/commitments)
export async function fetchItems() {
  const res = await apiFetch("/api/tasks");
  return res?.json() ?? [];
}

export async function createItem(data) {
  const res = await apiFetch("/api/tasks", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res?.json();
}

export async function patchItem(id, data) {
  const res = await apiFetch(`/api/tasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return res?.json();
}

export async function deleteItem(id) {
  await apiFetch(`/api/tasks/${id}`, { method: "DELETE" });
}

// Chat history
export async function fetchHistory() {
  const res = await apiFetch("/api/chat/history");
  return res?.json() ?? [];
}

export async function clearHistory() {
  await apiFetch("/api/chat/history", { method: "DELETE" });
}

export async function* streamChat(message) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ message }),
  });
  if (!res.ok || !res.body) return;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6);
      if (payload === "[DONE]") return;
      try {
        const data = JSON.parse(payload);
        yield data;
      } catch {}
    }
  }
}

// Journal
export async function readDailyJournal(date) {
  const res = await apiFetch(`/api/journal/${date}`);
  const d = await res?.json();
  return d?.content ?? "";
}

export async function writeDailyJournal(date, content) {
  await apiFetch(`/api/journal/${date}`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

export async function fetchJournalFiles() {
  const res = await apiFetch("/api/journal/files");
  return res?.json() ?? { tree: {} };
}

export async function readFile(path) {
  const res = await apiFetch(`/api/journal/read?path=${encodeURIComponent(path)}`);
  const d = await res?.json();
  return d?.content ?? "";
}

export async function writeFile(path, content) {
  await apiFetch("/api/journal/write", {
    method: "POST",
    body: JSON.stringify({ path, content }),
  });
}

export async function extractJournal(date) {
  const res = await apiFetch(`/api/journal/${date}/extract`, { method: "POST" });
  return res?.json();
}

// Settings
export async function fetchSettings() {
  const res = await apiFetch("/api/settings");
  return res?.json() ?? {};
}

export async function saveSettings(data) {
  const res = await apiFetch("/api/settings", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res?.json();
}
