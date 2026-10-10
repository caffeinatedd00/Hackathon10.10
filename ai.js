(() => {
  const CFG = globalThis.STICK_CONFIG || {};
  const MODEL = CFG.MODEL || "gemini-3.5-flash";
  const USE_FAKE = CFG.USE_FAKE ?? true;
  const FALLBACK_ON_ERROR = CFG.FALLBACK_ON_ERROR ?? true;
  const TIMEOUT_MS = 15000;
  const MAX_INPUT = 12000;

  const SYS = "You are the language engine of STICK, a silent study companion inside a browser. " +
    "Be concise. Reply with only the requested text: no preamble, no quotes, no markdown.";

  /* ---------- helpers ---------- */
  const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  const clip = (s, n = MAX_INPUT) => String(s ?? "").trim().slice(0, n);
  const firstSentences = (s, n) => (clip(s).match(/[^.!?]+[.!?]+/g) || [clip(s, 200)]).slice(0, n).join(" ").trim();

  /* ---------- persistent cache (survives reloads, so a recorded demo can't fail) ---------- */
  let cache = {};
  const cacheReady = browser.storage.local.get("aiCache").then((r) => { cache = r.aiCache || {}; }).catch(() => {});
  let saveTimer;
  const persist = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => browser.storage.local.set({ aiCache: cache }).catch(() => {}), 500);
  };

  /* ---------- Gemini REST call ---------- */
  async function ask(user) {
    if (!CFG.GEMINI_API_KEY || CFG.GEMINI_API_KEY === "PASTE_KEY_HERE") throw new Error("No GEMINI_API_KEY in config.js");
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": CFG.GEMINI_API_KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYS }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { temperature: 0.4 },
        }),
        signal: ctl.signal,
      });
      if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
      if (!text) throw new Error("Empty response from Gemini");
      return text;
    } finally {
      clearTimeout(timer);
    }
  }

  // fake -> canned answer, prompt -> what we send to Gemini. Real answers are cached; fallbacks are not.
  async function run(fn, args, fake, prompt) {
    if (USE_FAKE) return fake();
    await cacheReady;
    const key = fn + ":" + hash(JSON.stringify(args));
    if (cache[key] != null) return cache[key];
    try {
      const out = await ask(prompt);
      cache[key] = out;
      persist();
      return out;
    } catch (err) {
      console.warn(`[stick/ai] ${fn} failed:`, err.message);
      if (FALLBACK_ON_ERROR) return fake();
      throw err;
    }
  }

  /* ---------- the contract ---------- */
  function nameGroup(titles = []) {
    const list = titles.map((t) => clip(t, 120)).filter(Boolean).slice(0, 12);
    return run("nameGroup", list,
      () => ["Neural Networks", "Essay Research", "Lecture Notes", "Reading List"][parseInt(hash(list.join("|")), 36) % 4],
      `Name this group of browser tabs in 2 to 4 words (Title Case, no punctuation).\nTab titles:\n- ${list.join("\n- ")}`
    ).then((s) => s.replace(/["'.\n]/g, "").slice(0, 40));
  }

  function simplify(text) {
    const t = clip(text, 3000);
    return run("simplify", [t],
      () => `In simple terms: ${firstSentences(t, 1)}`,
      `Rewrite this passage in plain, simple English for a student who found it confusing. Keep the meaning and keep it no longer than the original.\n\n${t}`);
  }

  function summarise(text) {
    const t = clip(text);
    return run("summarise", [t],
      () => firstSentences(t, 2),
      `Summarise this in at most 3 short sentences (under 60 words in total).\n\n${t}`);
  }

  function briefing({ task, sleeping, lastSection } = {}) {
    const n = Array.isArray(sleeping) ? sleeping.length : Number(sleeping) || 0;
    const ctx = { task: clip(task, 120), sleeping: n, lastSection: clip(lastSection, 120) };
    return run("briefing", [ctx],
      () => `Welcome back! You were working on ${ctx.task || "your task"}${ctx.lastSection ? `, up to "${ctx.lastSection}"` : ""}. ${n} tab${n === 1 ? "" : "s"} asleep.`,
      `Write a one-sentence welcome-back briefing (max 25 words, friendly, second person) for a student returning from a break. ` +
      `Task: ${ctx.task || "unknown"}. Sleeping tabs: ${n}. Last section they were reading: ${ctx.lastSection || "unknown"}.`);
  }

  globalThis.StickAI = { nameGroup, simplify, summarise, briefing };

  /* ---------- message router, so content scripts and the sidebar can call the same functions ---------- */
  browser.runtime.onMessage.addListener((msg) => {
    if (msg?.type !== "ai" || !globalThis.StickAI[msg.fn]) return; // not ours, ignore
    return globalThis.StickAI[msg.fn](...(msg.args || []));
  });
})();