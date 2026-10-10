const api = typeof browser !== "undefined" ? browser : chrome;
const MOCK = false; // set to false once the background script sends real messages

const $ = (s) => document.querySelector(s);
const state = { task: null, focus: "idle", reading: "ok", groups: [], activity: [], summaries: [], notes: [] };
const collapsed = new Set();
let sidebarStick;
let lastStickState = "";
let lastStickTask = null;
let editing = null;     // { id, draft } while a note is being edited
let lastDeleted = null; // { kind, item, index } for Undo
let toastTimer;

/* ---------- helpers (textContent only, so AI output can never inject HTML) ---------- */
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (v != null && v !== false) el.setAttribute(k, v);
  }
  el.append(...kids.flat().filter((x) => x != null && x !== false));
  return el;
}
const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };
const ago = (ts) => {
  const m = Math.round((Date.now() - ts) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
};
const empty = (title, hint) => h("div", { class: "empty" }, h("strong", {}, title), h("span", {}, hint));
const uid = () => crypto.randomUUID();
const autosize = (el) => { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; };

function copyBtn(text) {
  const b = h("button", { class: "ghost" }, "Copy");
  b.onclick = () => {
    navigator.clipboard.writeText(text);
    b.textContent = "Copied";
    setTimeout(() => (b.textContent = "Copy"), 1200);
  };
  return b;
}

/* ---------- persistence (notes and summaries survive closing the sidebar) ---------- */
let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    api.storage.local.set({
      stickSidebar: {
        activity: state.activity,
        summaries: state.summaries,
        notes: state.notes,
      },
    }).catch((error) => console.error("[stick/sidebar] save failed:", error));
  }, 200);
}
async function load() {
  try {
    const { stickSidebar } = await api.storage.local.get("stickSidebar");
    if (!stickSidebar) return false;
    state.activity = stickSidebar.activity || [];
    state.summaries = stickSidebar.summaries || [];
    state.notes = stickSidebar.notes || [];
    return true;
  } catch { return false; }
}

/* ---------- delete + undo ---------- */
const renderList = (kind) => (kind === "notes" ? renderNotes() : renderSummaries());

function remove(kind, id) {
  const index = state[kind].findIndex((x) => x.id === id);
  if (index < 0) return;
  const [item] = state[kind].splice(index, 1);
  lastDeleted = { kind, item, index };
  if (editing?.id === id) editing = null;
  renderList(kind);
  save();
  toast(kind === "notes" ? "Note deleted" : "Summary deleted");
}

function undo() {
  if (!lastDeleted) return;
  const { kind, item, index } = lastDeleted;
  state[kind].splice(Math.min(index, state[kind].length), 0, item);
  lastDeleted = null;
  renderList(kind);
  save();
  hideToast();
}

const toastEl = h("div", { id: "toast", hidden: "" });
document.body.append(toastEl);
function toast(msg) {
  toastEl.replaceChildren(h("span", {}, msg), h("button", { onclick: undo }, "Undo"));
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; lastDeleted = null; }, 6000);
}
function hideToast() { clearTimeout(toastTimer); toastEl.hidden = true; }

/* ---------- rendering ---------- */
const FOCUS = { idle: "Idle", flow: "In flow", drift: "Drifting", stuck: "Stuck" };

function renderHeader() {
  const confused = state.reading === "confused";
  const f = confused ? "stuck" : state.focus;
  const chip = $("#focus");
  chip.dataset.focus = f;
  chip.textContent = confused ? "Confused" : FOCUS[f] ?? "Idle";
  $("#task").textContent = state.task || "No task detected yet";
}

function tabRow(t) {
  const fav = t.favIconUrl
    ? h("img", { class: "fav", src: t.favIconUrl, alt: "" })
    : h("span", { class: "fav letter" }, (t.title || "?")[0].toUpperCase());
  return h("button", { class: "tab-row" + (t.sleeping ? " sleeping" : ""), title: t.url || "", onclick: () => activate(t) },
    fav,
    h("span", { class: "ttl" }, t.title || t.url),
    t.sleeping ? h("span", { class: "zzz" }, "zzz") : h("span", { class: "host" }, host(t.url)));
}

async function snoozeGroup(group, button) {
  const candidates = group.tabs.filter((tab) => !tab.active && !tab.sleeping);
  if (!candidates.length) return;
  if (typeof api.tabs.discard !== "function") {
    console.error("[stick/sidebar] this Firefox version does not support tab snoozing");
    button.textContent = "Snooze unavailable";
    button.title = "This Firefox version does not support tabs.discard().";
    return;
  }
  button.disabled = true;
  button.textContent = "Snoozing…";
  try {
    const discarded = await api.tabs.discard(candidates.map((tab) => tab.id));
    const count = Array.isArray(discarded) ? discarded.filter((tab) => tab.discarded).length : candidates.length;
    button.textContent = count ? `Snoozed ${count}` : "No tabs snoozed";
  } catch (error) {
    console.error("[stick/sidebar] tab snoozing failed:", error);
    button.textContent = "Snooze failed";
    button.title = error.message;
  }
}

function groupCard(g) {
  const asleep = g.tabs.filter((t) => t.sleeping).length;
  const snoozable = g.tabs.filter((t) => !t.active && !t.sleeping).length;
  const snoozeButton = h("button", {
    class: "ghost snooze",
    type: "button",
    disabled: snoozable === 0,
    title: "Unload inactive tabs in this task. Click a snoozed tab to restore it.",
    onclick: (event) => {
      event.stopPropagation();
      snoozeGroup(g, event.currentTarget);
    },
  }, asleep ? `Snooze inactive (${snoozable}) · ${asleep} snoozed` : `Snooze inactive (${snoozable})`);
  const el = h("details", { class: "group" },
    h("summary", {},
      h("span", { class: "dot" }),
      h("span", { class: "gname" }, g.name),
      h("span", { class: "meta" }, `${g.tabs.length} tabs` + (asleep ? ` · ${asleep} asleep` : ""))),
    h("div", { class: "group-tools" }, snoozeButton),
    h("div", { class: "tabs-list" }, g.tabs.map(tabRow)));
  el.style.setProperty("--c", `var(--${g.color || "grey"})`);
  el.open = !collapsed.has(g.id);
  el.addEventListener("toggle", () => (el.open ? collapsed.delete(g.id) : collapsed.add(g.id)));
  return el;
}

function renderGroups() {
  const box = $("#view-groups");
  box.replaceChildren();
  if (!state.groups.length) box.append(empty("No groups yet", "Stick will sort your tabs by task as you browse."));
  state.groups.forEach((g) => box.append(groupCard(g)));
  $("#count-groups").textContent = state.groups.length;
}

function renderActivity() {
  const box = $("#view-activity");
  box.replaceChildren();
  if (!state.activity.length) {
    box.append(empty("Nothing in your history yet", "Tab changes, reading help and saved work will appear here."));
  }
  state.activity.forEach((item) => {
    const source = item.url
      ? h("a", { class: "activity-source", href: item.url, target: "_blank", rel: "noopener noreferrer" }, host(item.url))
      : null;
    box.append(h("article", { class: "activity-card" },
      h("span", { class: `activity-mark ${item.kind || ""}` }, item.kind === "summary" ? "S" : item.kind === "note" ? "N" : "•"),
      h("div", { class: "activity-copy" },
        h("strong", {}, item.title || "Study update"),
        h("p", {}, item.text || ""),
        source,
        h("time", {}, ago(item.ts || Date.now())))));
  });
  $("#count-activity").textContent = state.activity.length;
}

function renderSummaries() {
  const box = $("#view-summaries");
  box.replaceChildren();
  if (!state.summaries.length) box.append(empty("No summaries yet", "Skim a long page and Stick will summarise it here."));
  state.summaries.forEach((s) => box.append(h("article", { class: "card" },
    h("h3", {}, s.title),
    h("p", { class: "src" }, `${host(s.url)} · ${ago(s.ts)}`),
    h("p", {}, s.text),
    h("div", { class: "actions" },
      copyBtn(s.text),
      h("button", { class: "ghost danger", onclick: () => remove("summaries", s.id) }, "Delete")))));
  $("#count-summaries").textContent = state.summaries.length;
}

function noteCard(n) {
  const meta = `${n.title} · ${ago(n.ts)}` + (n.edited ? " · edited" : "");

  if (editing?.id !== n.id) {
    return h("article", { class: "card" },
      h("blockquote", {}, n.text),
      h("p", { class: "src" }, meta),
      h("div", { class: "actions" },
        h("button", { class: "ghost", onclick: () => { editing = { id: n.id, draft: n.text }; renderNotes(); } }, "Edit"),
        copyBtn(n.text),
        h("button", { class: "ghost danger", onclick: () => remove("notes", n.id) }, "Delete")));
  }

  // edit mode
  const area = h("textarea", { class: "editor", rows: 3, "aria-label": "Edit note" });
  area.value = editing.draft;
  const saveBtn = h("button", { class: "ghost primary" }, "Save");
  const commit = () => {
    const text = area.value.trim();
    if (!text) return;
    if (text !== n.text) { n.text = text; n.edited = true; save(); }
    editing = null;
    renderNotes();
  };
  const cancel = () => { editing = null; renderNotes(); };
  saveBtn.onclick = commit;
  area.addEventListener("input", () => { editing.draft = area.value; saveBtn.disabled = !area.value.trim(); autosize(area); });
  area.addEventListener("keydown", (e) => {
    if (e.key === "Escape") cancel();
    else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) commit();
  });
  setTimeout(() => { autosize(area); area.focus(); area.setSelectionRange(area.value.length, area.value.length); }, 0);

  return h("article", { class: "card editing" },
    area,
    h("p", { class: "src" }, meta),
    h("div", { class: "actions" },
      saveBtn,
      h("button", { class: "ghost", onclick: cancel }, "Cancel"),
      h("span", { class: "hint" }, "Ctrl+Enter to save")));
}

function renderNotes() {
  const box = $("#view-notes");
  box.replaceChildren();
  if (!state.notes.length) box.append(empty("No notes yet", "Passages you re-read will be saved here automatically."));
  state.notes.forEach((n) => box.append(noteCard(n)));
  $("#count-notes").textContent = state.notes.length;
}

/* ---------- incoming messages (the contract with the backend) ---------- */
function handle(msg) {
  if (!msg) return;
  if (msg.type === "snapshot") {
    Object.assign(state, { task: msg.task ?? null, focus: msg.focus ?? "idle", reading: msg.reading ?? "ok" });
    state.groups = msg.groups || [];
    renderHeader();
    renderGroups();
  }
  else if (msg.type === "groups") { state.groups = msg.groups; renderGroups(); }
  else if (msg.type === "activity") {
    state.activity.unshift({ id: uid(), ...msg.item });
    state.activity = state.activity.slice(0, 100);
    renderActivity();
    save();
  }
  else if (msg.type === "summary") { state.summaries.unshift({ id: uid(), ...msg.item }); renderSummaries(); save(); }
  else if (msg.type === "note") { state.notes.unshift({ id: uid(), ...msg.item }); renderNotes(); save(); }
  else if (msg.task !== undefined || msg.focus || msg.reading) {
    Object.assign(state, { task: msg.task ?? state.task, focus: msg.focus ?? state.focus, reading: msg.reading ?? state.reading });
    renderHeader();
  }
  const stickState = `${state.task}|${state.focus}|${state.reading}`;
  if (sidebarStick && stickState !== lastStickState) {
    const taskChanged = lastStickTask !== state.task;
    lastStickState = stickState;
    lastStickTask = state.task;
    const message = state.reading === "confused"
      ? "A passage may need a second look."
      : state.focus === "drift"
        ? "Lots of tab switching? Your tasks are still here."
        : state.focus === "flow"
          ? "You seem settled in. I'll stay out of the way."
          : state.task
            ? `Keeping ${state.task} together.`
            : "Your tabs and saved work, together.";
    $("#stick-message").textContent = message;
    const action = state.reading === "confused"
      ? { action: "shrug", text: "Want a hand with this passage?" }
      : state.focus === "drift"
        ? { action: "tap", text: `Back to ${state.task || "your task"}?` }
        : state.focus === "stuck"
          ? { action: "shrug", text: "Let's try a different approach." }
          : state.focus === "flow"
            ? { action: "read" }
            : taskChanged && state.task
              ? { action: "wave", text: `On to ${state.task}!` }
              : { action: "idle" };
    sidebarStick.stop();
    sidebarStick.perform(action).catch((error) => {
      console.warn("[stick/sidebar] companion animation failed:", error);
    });
  }
}

function activate(t) { if (!MOCK) api.tabs.update(t.id, { active: true }); }

/* ---------- view switching ---------- */
document.querySelectorAll(".seg button").forEach((b) =>
  b.addEventListener("click", () => {
    document.querySelectorAll(".seg button").forEach((x) => x.setAttribute("aria-selected", x === b));
    document.querySelectorAll(".view").forEach((v) => (v.hidden = v.id !== "view-" + b.dataset.view));
  }));

/* ---------- start ---------- */
(async function init() {
  const hadSaved = await load();
  api.runtime.onMessage.addListener(handle);
  api.storage.onChanged.addListener((changes, area) => {
    const v = area === "local" && changes.stickSidebar?.newValue;
    if (!v) return;
    if (JSON.stringify([v.activity, v.summaries, v.notes]) === JSON.stringify([state.activity, state.summaries, state.notes])) return;
    state.activity = v.activity || [];
    state.summaries = v.summaries || [];
    state.notes = v.notes || [];
    renderActivity();
    renderSummaries();
    renderNotes();
  });
  if (MOCK) {
    const dev = $("#dev");
    dev.hidden = false;
    $("#dev-regroup").onclick = () => handle({ type: "groups", groups: demoGroups() });
    $("#dev-summary").onclick = () => { const [title, url, text] = SUMMARIES[si++ % SUMMARIES.length]; handle({ type: "summary", item: { title, url, text, ts: Date.now() } }); };
    $("#dev-note").onclick = () => { const [title, text] = NOTES[ni++ % NOTES.length]; handle({ type: "note", item: { title, text, ts: Date.now() } }); };
    $("#dev-focus").onclick = () => { const f = FOCUSES[fi++ % FOCUSES.length]; handle({ focus: f, reading: f === "stuck" ? "confused" : "ok" }); };
    dev.append(h("button", { onclick: async () => { await api.storage.local.remove("stickSidebar"); location.reload(); } }, "Reset"));

    handle({ task: "Revising: neural networks", focus: "flow", reading: "ok" });
    $("#dev-regroup").click();
    if (!hadSaved) { $("#dev-summary").click(); $("#dev-note").click(); } // seed demo items only on the first run
  }

  renderHeader(); renderGroups(); renderActivity(); renderSummaries(); renderNotes();
  api.runtime.sendMessage({ type: "engine:getSnapshot" })
    .then((snapshot) => handle({ type: "snapshot", ...snapshot }))
    .catch((error) => console.warn("[stick/sidebar] engine snapshot unavailable:", error));
})();

try {
  const stage = document.querySelector("#sidebar-stick-stage");
  sidebarStick = globalThis.Stick?.create({
    container: stage,
    targetHeight: 220,
    home: { x: 66, y: 154 },
    homeMargin: 0,
    entrance: false,
    quirks: false,
  });
  sidebarStick?.perform({ action: "idle" }).catch((error) => {
    console.warn("[stick/sidebar] companion animation failed:", error);
  });
} catch (error) {
  console.error("[stick/sidebar] companion could not start:", error);
}
