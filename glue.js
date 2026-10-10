(() => {
  if (globalThis.StickGlue) return;
  const api = typeof browser !== "undefined" ? browser : chrome;
  const DEV = true; // Alt+Shift+C rewrite the paragraph on screen, B briefing, K skim summary

  /* ---------- thresholds: tune these for your demo path ---------- */
  const CONFUSED_SCROLLBACKS = 2;
  const SLOW_MS_PER_WORD = 1000;     // about 60 words/min. Normal reading is about 250 ms/word
  const SLOW_MIN_WORDS = 12;
  const SLOW_MIN_DWELL = 5000;
  const ACTIVE_WITHIN = 20000;       // only judge "slow" if the user touched the page this recently
  const COOLDOWN = 8000;             // minimum gap between two rewrites
  const BREAK_MS = 5 * 60 * 1000;    // set to about 20000 for the demo
  const SKIM_MIN_PARAS = 6;          // skipped paragraphs needed...
  const SKIM_MAX_DWELL = 700;        // ...each seen for less than this
  const SKIM_MIN_WORDS = 500;        // and the page must be long

  const send = (msg) => api.runtime.sendMessage(msg).catch(() => {});
  const stick = (action, text) => globalThis.StickOverlay?.set(action, text);
  const inbox = (kind, item) => send({ type: "inbox", kind, item });
  const pageInfo = () => ({ title: document.title || location.hostname, url: location.href });

  let lastInput = Date.now();

  /* ---------- 1. confusion: rewrite the paragraph in place ---------- */
  const handled = new WeakSet();
  let busy = false, lastRewrite = 0;

  function attachToggle(el, original, simple) {
    let showing = "simple";
    el.addEventListener("click", (e) => {
      if (!e.altKey) return;
      e.preventDefault();
      if (showing === "simple") { el.innerHTML = original; showing = "original"; }
      else { el.textContent = simple; showing = "simple"; }
    });
  }

  async function simplifyParagraph(el) {
    if (busy || handled.has(el) || Date.now() - lastRewrite < COOLDOWN) return;
    busy = true;
    handled.add(el);
    send({ reading: "confused" });
    stick("magnify", "That one looks tricky. Let me simplify it.");
    try {
      const original = el.innerHTML;
      const simple = await StickAI.simplify(el.textContent.trim());
      if (simple && el.isConnected) {
        el.textContent = simple;
        Object.assign(el.style, { borderLeft: "3px solid #4f46e5", paddingLeft: "10px", background: "rgba(79,70,229,.07)" });
        el.title = "Simplified by Stick. Alt+click to show the original.";
        attachToggle(el, original, simple);
        stick("magnify", "Here's a simpler version.");
      }
    } catch (err) {
      console.warn("[stick] simplify failed:", err);
      stick("idle");
    } finally {
      busy = false;
      lastRewrite = Date.now();
      send({ reading: "ok" });
    }
  }

  /* ---------- 2. auto-notes from re-read passages ---------- */
  const noted = new WeakSet();
  function saveNote(el) {
    if (noted.has(el)) return;
    noted.add(el);
    inbox("note", { ...pageInfo(), text: el.textContent.trim().slice(0, 400), ts: Date.now() });
  }

  StickReading.on((e) => {
    if (e.type !== "scrollback") return;
    saveNote(e.el); // first re-read becomes a note (runs before any rewrite changes the text)
    if (e.scrollBacks >= CONFUSED_SCROLLBACKS) simplifyParagraph(e.el);
  });

  // slow-reading check on whatever is on screen right now
  setInterval(() => {
    if (document.visibilityState !== "visible" || Date.now() - lastInput > ACTIVE_WITHIN) return;
    for (const p of StickReading.visible()) {
      if (p.words >= SLOW_MIN_WORDS && p.dwellMs >= SLOW_MIN_DWELL && p.dwellMs / p.words >= SLOW_MS_PER_WORD) {
        simplifyParagraph(p.el);
        break;
      }
    }
  }, 1000);

  /* ---------- 3. welcome-back briefing ---------- */
  function currentSection() {
    let found = "";
    for (const h of document.querySelectorAll("h1, h2, h3")) {
      if (h.getBoundingClientRect().top < innerHeight * 0.5) found = h.textContent.trim();
      else break;
    }
    return found;
  }

  async function welcomeBack() {
    const ctx = (await send({ type: "engine:context" })) || {}; // the engine can answer with { task, sleeping }
    const text = await StickAI.briefing({
      task: ctx.task || document.title,
      sleeping: ctx.sleeping ?? 0,
      lastSection: currentSection(),
    });
    stick("wave", text);
  }

  // One shared "last active" timestamp, so switching tabs during normal browsing isn't a "break"
  let lastCheck = 0;
  async function onActivity() {
    const t = Date.now();
    lastInput = t;
    if (t - lastCheck < 1000) return;
    lastCheck = t;
    const { stickLastActive = t } = await api.storage.local.get("stickLastActive");
    if (t - stickLastActive >= BREAK_MS) welcomeBack();
    api.storage.local.set({ stickLastActive: t });
  }
  for (const ev of ["mousemove", "keydown", "scroll", "pointerdown"]) {
    addEventListener(ev, onActivity, { capture: true, passive: true });
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") onActivity();
  });

  /* ---------- 4. skim summary ---------- */
  let summarised = false;
  async function summarisePage() {
    if (summarised) return;
    summarised = true; // once per page
    stick("read", "Skimming? I'm writing you a summary.");
    try {
      const root = document.querySelector("article, main") || document.body;
      const summary = await StickAI.summarise(root.innerText.trim());
      inbox("summary", { ...pageInfo(), text: summary, ts: Date.now() });
      stick("read", "Summary saved in the sidebar.");
    } catch (err) {
      console.warn("[stick] summarise failed:", err);
      stick("idle");
    }
  }

  setInterval(() => {
    if (summarised || document.visibilityState !== "visible") return;
    const stats = StickReading.stats();
    const onScreen = new Set(StickReading.visible().map((p) => p.id));
    const words = stats.reduce((n, p) => n + p.words, 0);
    const skipped = stats.filter((p) => !onScreen.has(p.id) && p.visits > 0 && p.words >= 8 && p.dwellMs < SKIM_MAX_DWELL).length;
    if (words >= SKIM_MIN_WORDS && skipped >= SKIM_MIN_PARAS) summarisePage();
  }, 2000);

  /* ---------- dev shortcuts: test without waiting ---------- */
  if (DEV) {
    addEventListener("keydown", (e) => {
      if (!(e.altKey && e.shiftKey)) return;
      if (e.code === "KeyC") {
        const p = StickReading.visible().find((x) => x.words >= 8);
        if (p) { handled.delete(p.el); lastRewrite = 0; simplifyParagraph(p.el); }
      } else if (e.code === "KeyB") welcomeBack();
      else if (e.code === "KeyK") { summarised = false; summarisePage(); }
    });
  }

  globalThis.StickGlue = { simplifyParagraph, welcomeBack, summarisePage };
})();
