// Typora-style live editor: each line renders on blur, shows raw on focus.
// No CDN dependencies.

function authHeaders() {
  const token = localStorage.getItem("token");
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

let currentDate  = todayStr();
let currentPath  = null;
let notesRoot    = "";
let activeBlock  = null;   // the .jl div currently being edited

function todayStr() { return new Date().toISOString().slice(0, 10); }

// ── Typst renderer ────────────────────────────────────────────────────────────

function escHtml(s) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function inlineRender(raw) {
  let s = escHtml(raw);
  s = s.replace(/\*([^*\n]+)\*/g,    "<strong>$1</strong>");
  s = s.replace(/_([^_\n]+)_/g,      "<em>$1</em>");
  s = s.replace(/`([^`\n]+)`/g,      "<code>$1</code>");
  s = s.replace(/\$([^$\n]+)\$/g,    '<span class="t-math">$1</span>');
  s = s.replace(/#link\("([^"]+)"\)\[([^\]]+)\]/g, '<a href="$1" target="_blank">$2</a>');
  return s;
}

function renderLine(raw) {
  if (raw.trim() === "")        return "";                        // empty line
  if (raw.trim().startsWith("//")) return "";                    // comment → invisible

  const h = raw.match(/^(={1,6})\s+(.*)/);
  if (h) {
    const lvl = Math.min(h[1].length, 4);
    return `<h${lvl}>${inlineRender(h[2])}</h${lvl}>`;
  }
  const ul = raw.match(/^-\s+(.*)/);
  if (ul) return `<div class="t-li">• ${inlineRender(ul[1])}</div>`;

  const ol = raw.match(/^\+\s+(.*)/);
  if (ol) return `<div class="t-li t-ol">${inlineRender(ol[1])}</div>`;

  if (raw.trim().startsWith("```"))
    return `<div class="t-fence">${escHtml(raw)}</div>`;

  return `<div class="t-p">${inlineRender(raw)}</div>`;
}

// ── Block (line) management ───────────────────────────────────────────────────

function makeBlock(rawText) {
  const div = document.createElement("div");
  div.className = "jl";
  div.dataset.raw = rawText;
  renderBlock(div);

  div.addEventListener("focus", () => activateBlock(div));
  div.addEventListener("blur",  () => deactivateBlock(div));
  div.addEventListener("keydown", blockKeydown);
  div.addEventListener("paste", blockPaste);
  return div;
}

function renderBlock(div) {
  const raw = div.dataset.raw || "";
  const html = renderLine(raw);
  if (html) {
    div.innerHTML = html;
    div.removeAttribute("contenteditable");
  } else {
    div.innerHTML = "";
    div.contentEditable = "true";   // keep empty lines editable
    div.classList.add("empty");
  }
}

function activateBlock(div) {
  if (activeBlock && activeBlock !== div) deactivateBlock(activeBlock);
  activeBlock = div;
  const raw = div.dataset.raw || "";
  div.contentEditable = "true";
  div.classList.remove("empty");
  div.textContent = raw;
  div.classList.add("editing");
  moveCursorToEnd(div);
}

function deactivateBlock(div) {
  if (!div) return;
  div.dataset.raw = div.textContent;
  div.classList.remove("editing");
  div.contentEditable = "false";
  renderBlock(div);
  if (activeBlock === div) activeBlock = null;
}

function moveCursorToEnd(div) {
  const range = document.createRange();
  const sel   = window.getSelection();
  range.selectNodeContents(div);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

function moveCursorToStart(div) {
  const range = document.createRange();
  const sel   = window.getSelection();
  range.setStart(div, 0);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

function blockKeydown(e) {
  const div = e.currentTarget;

  if (e.key === "Enter") {
    e.preventDefault();
    const newBlock = makeBlock("");
    div.after(newBlock);
    div.blur();
    newBlock.contentEditable = "true";
    newBlock.focus();
    return;
  }

  if (e.key === "Backspace" && div.textContent === "") {
    e.preventDefault();
    const prev = div.previousElementSibling;
    div.remove();
    if (prev) { prev.contentEditable = "true"; prev.focus(); moveCursorToEnd(prev); }
    return;
  }

  if (e.key === "Tab") {
    e.preventDefault();
    document.execCommand("insertText", false, "  ");
    return;
  }

  if (e.key === "ArrowUp" && !e.shiftKey) {
    const prev = div.previousElementSibling;
    if (prev) { e.preventDefault(); div.blur(); prev.contentEditable = "true"; prev.focus(); moveCursorToEnd(prev); }
    return;
  }

  if (e.key === "ArrowDown" && !e.shiftKey) {
    const next = div.nextElementSibling;
    if (next) { e.preventDefault(); div.blur(); next.contentEditable = "true"; next.focus(); moveCursorToStart(next); }
    return;
  }
}

function blockPaste(e) {
  e.preventDefault();
  const text = e.clipboardData.getData("text/plain");
  const lines = text.split("\n");
  if (lines.length === 1) {
    document.execCommand("insertText", false, text);
    return;
  }
  // Multi-line paste: insert first line into current block, create new blocks for rest
  const div = e.currentTarget;
  document.execCommand("insertText", false, lines[0]);
  let ref = div;
  for (let i = 1; i < lines.length; i++) {
    const nb = makeBlock(lines[i]);
    ref.after(nb);
    ref = nb;
  }
  div.blur();
  ref.contentEditable = "true";
  ref.focus();
  moveCursorToEnd(ref);
}

// ── Editor container click — activate block under cursor ─────────────────────

function editorClick(e) {
  const block = e.target.closest(".jl");
  if (block) {
    activateBlock(block);
  } else {
    // Clicked below all content — create new block and focus it
    const editor = document.getElementById("journal-editor");
    const newBlock = makeBlock("");
    editor.appendChild(newBlock);
    newBlock.contentEditable = "true";
    newBlock.focus();
  }
}

// ── Load / Save ───────────────────────────────────────────────────────────────

function setContent(text) {
  const editor = document.getElementById("journal-editor");
  editor.innerHTML = "";
  activeBlock = null;
  const lines = text === "" ? [""] : text.split("\n");
  lines.forEach(line => editor.appendChild(makeBlock(line)));
}

function getContent() {
  if (activeBlock) activeBlock.dataset.raw = activeBlock.textContent;
  return [...document.querySelectorAll(".jl")]
    .map(div => div.dataset.raw || "")
    .join("\n");
}

async function loadByDate(date) {
  const res = await fetch(`/api/journal/${date}`, { headers: authHeaders() });
  if (res.status === 404) { setContent(""); return; }
  if (!res.ok) { const d = await res.json(); setContent(`// ${d.detail}`); return; }
  const { content } = await res.json();
  setContent(content);
}

async function loadByPath(path) {
  const res = await fetch(`/api/journal/read?path=${encodeURIComponent(path)}`, { headers: authHeaders() });
  if (res.status === 404) { setContent(""); return; }
  if (!res.ok) { const d = await res.json(); setContent(`// ${d.detail}`); return; }
  const { content } = await res.json();
  setContent(content);
}

function updateSaveBtn() {
  const isDaily = !currentPath || currentPath.startsWith("daily/");
  document.getElementById("journal-save").textContent = isDaily ? "Save & Extract" : "Save";
}

async function saveJournal() {
  const content  = getContent();
  const btn      = document.getElementById("journal-save");
  const statusEl = document.getElementById("journal-status");
  btn.disabled = true;
  statusEl.textContent = "";

  const isDaily = !currentPath || currentPath.startsWith("daily/");
  btn.textContent = "Saving...";

  const saveRes = currentPath
    ? await fetch(`/api/journal/write?path=${encodeURIComponent(currentPath)}`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ content }),
      })
    : await fetch(`/api/journal/${currentDate}`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ content }),
      });

  if (!saveRes.ok) {
    const d = await saveRes.json();
    statusEl.textContent = d.detail || "Save failed";
    btn.disabled = false; updateSaveBtn(); return;
  }

  if (isDaily) {
    btn.textContent = "Extracting...";
    const ext = await fetch(`/api/journal/${currentDate}/extract`, { method: "POST", headers: authHeaders() });
    if (ext.ok) {
      const d = await ext.json();
      const parts = [];
      if (d.goals_added)  parts.push(`${d.goals_added} goal(s)`);
      if (d.habits_added) parts.push(`${d.habits_added} habit(s)`);
      if (d.notes_added)  parts.push(`${d.notes_added} note(s)`);
      statusEl.textContent = parts.length ? `Added: ${parts.join(", ")}` : "Saved.";
    } else { statusEl.textContent = "Saved (extraction failed)"; }
  } else {
    statusEl.textContent = "Saved.";
    loadFileTree();
  }

  btn.disabled = false; updateSaveBtn();
  setTimeout(() => { statusEl.textContent = ""; }, 4000);
}

// ── File tree ─────────────────────────────────────────────────────────────────

async function loadFileTree() {
  const res = await fetch("/api/journal/files", { headers: authHeaders() });
  if (!res.ok) return;
  const { root, tree } = await res.json();
  notesRoot = root;
  document.getElementById("journal-path").textContent = root;
  renderFileTree(tree);
}

function renderFileTree(tree) {
  const body = document.getElementById("filetree-body");
  body.innerHTML = "";
  body.dataset.tree = JSON.stringify(tree);

  if (!Object.keys(tree).length) {
    body.innerHTML = `<div class="filetree-empty">No folders yet.</div>`;
    return;
  }

  for (const [folder, files] of Object.entries(tree)) {
    const section = document.createElement("div");
    section.className = "filetree-folder";

    const header = document.createElement("div");
    header.className = "filetree-folder-name";
    header.textContent = folder;
    header.addEventListener("click", () => section.classList.toggle("collapsed"));
    section.appendChild(header);

    if (!files.length) {
      const empty = document.createElement("div");
      empty.className = "filetree-file filetree-empty-folder";
      empty.textContent = "empty";
      section.appendChild(empty);
    }

    files.forEach(file => {
      const item = document.createElement("div");
      item.className = "filetree-file";
      item.dataset.path = `${folder}/${file}`;
      item.textContent = file.replace(/\.(typ|md|txt)$/, "");
      item.addEventListener("click", () => openFile(`${folder}/${file}`));
      section.appendChild(item);
    });

    body.appendChild(section);
  }

  if (currentPath) setActiveFile(currentPath);
}

function setActiveFile(path) {
  document.querySelectorAll(".filetree-file").forEach(el => {
    el.classList.toggle("active", el.dataset.path === path);
  });
}

async function openFile(path) {
  currentPath = path;
  setActiveFile(path);
  const dateMatch = path.match(/daily\/(\d{4}-\d{2}-\d{2})\.typ/);
  if (dateMatch) {
    currentDate = dateMatch[1];
    document.getElementById("journal-date").value = currentDate;
  }
  updateSaveBtn();
  await loadByPath(path);
}

function showInlineInput(placeholder, onConfirm) {
  const existing = document.getElementById("filetree-inline-input");
  if (existing) existing.remove();
  const wrap = document.createElement("div");
  wrap.id = "filetree-inline-input";
  wrap.className = "filetree-inline";
  const input = document.createElement("input");
  input.placeholder = placeholder; input.className = "filetree-inline-input";
  const ok = document.createElement("button"); ok.textContent = "✓"; ok.className = "filetree-inline-ok";
  const cancel = document.createElement("button"); cancel.textContent = "✕"; cancel.className = "filetree-inline-cancel";
  wrap.appendChild(input); wrap.appendChild(ok); wrap.appendChild(cancel);
  document.getElementById("filetree-body").prepend(wrap);
  input.focus();
  const confirm = () => { const v = input.value.trim(); wrap.remove(); if (v) onConfirm(v); };
  const abort   = () => wrap.remove();
  ok.addEventListener("click", confirm);
  cancel.addEventListener("click", abort);
  input.addEventListener("keydown", e => { if (e.key === "Enter") confirm(); if (e.key === "Escape") abort(); });
}

// ── Init ──────────────────────────────────────────────────────────────────────

function initJournal() {
  if (document.getElementById("journal-editor").dataset.init) return;
  document.getElementById("journal-editor").dataset.init = "1";

  document.getElementById("journal-editor").addEventListener("click", editorClick);
  document.getElementById("journal-date").value = currentDate;

  document.getElementById("journal-date").addEventListener("change", e => {
    currentDate = e.target.value; currentPath = null;
    setActiveFile(null); updateSaveBtn(); loadByDate(currentDate);
  });

  document.getElementById("journal-save").addEventListener("click", saveJournal);

  document.getElementById("sidebar-toggle").addEventListener("click", () => {
    document.getElementById("journal-sidebar").classList.toggle("hidden");
  });

  document.getElementById("files-toggle").addEventListener("click", () => {
    document.getElementById("journal-files").classList.toggle("hidden");
  });

  document.getElementById("filetree-refresh").addEventListener("click", loadFileTree);

  let journalLoaded = false;
  document.querySelector('[data-tab="journal"]').addEventListener("click", () => {
    if (!journalLoaded) { journalLoaded = true; loadFileTree(); }
    if (currentPath) loadByPath(currentPath); else loadByDate(currentDate);
  });

  document.getElementById("new-file-btn").addEventListener("click", () => {
    const tree = JSON.parse(document.getElementById("filetree-body").dataset.tree || "{}");
    const folders = Object.keys(tree);
    const def = folders.includes("daily") ? "daily" : (folders[0] || "daily");
    showInlineInput(`e.g. ${def}/my-note`, value => {
      const parts = value.includes("/") ? value.split("/") : [def, value];
      const [folder, ...rest] = parts;
      currentPath = `${folder}/${rest.join("/").replace(/\.(typ|md|txt)$/, "")}.typ`;
      setActiveFile(null); setContent(""); updateSaveBtn();
    });
  });

  document.getElementById("new-folder-btn").addEventListener("click", () => {
    showInlineInput("folder name", async name => {
      await fetch("/api/journal/folder", { method: "POST", headers: authHeaders(), body: JSON.stringify({ name }) });
      loadFileTree();
    });
  });

  // Don't auto-load — journal content loads only when tab is clicked
}

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener("quanta:login", initJournal);
if (window.__quantaLoggedIn) initJournal();
