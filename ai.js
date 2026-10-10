(() => {
  const CFG = globalThis.STICK_CONFIG || {};
  const USE_FAKE = CFG.USE_FAKE ?? true;
  const FALLBACK_ON_ERROR = CFG.FALLBACK_ON_ERROR ?? true;
  const TIMEOUT_MS = 8000;
  const MAX_PER_MIN = CFG.MAX_PER_MIN ?? 12;
  const MAX_CONCURRENT = 4;
  const MAX_CACHE = 500;
  const MAX_INPUT = 12000;

  // Strongest model for the long, high-stakes outputs; faster tier for the small, frequent ones
  const MODELS = {
    strong: CFG.MODEL_STRONG || CFG.MODEL || "gemini-3.5-flash",
    fast: CFG.MODEL_FAST || CFG.MODEL || "gemini-3.5-flash",
  };
  const TIER = { summarise: "strong", briefing: "strong", simplify: "strong", nameGroup: "fast", checkText: "fast", define: "fast", quip: "fast" };

  const SYS = "You are the language engine of STICK, a silent study companion inside a browser. " +
    "Be concise. Reply with only the requested text: no preamble, no quotes, no markdown.";
  const VOICE = "You are Stick, a tiny hand-drawn stickman who lives in the corner of the user's screen. " +
    "Dry, warm, a little cheeky, never preachy. You comment on what the user is doing in at most 8 words. " +
    "No emojis, no hashtags, no quotation marks.";

  /* ---------- helpers ---------- */
  const clip = (s, n = MAX_INPUT) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n); // whitespace-normalised, so cache keys are stable
  const firstSentences = (s, n) => (clip(s).match(/[^.!?]+[.!?]+/g) || [clip(s, 200)]).slice(0, n).join(" ").trim();
  const sum = (s) => [...s].reduce((a, c) => a + c.charCodeAt(0), 0);

  async function hash(s) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // Defensive JSON: strips code fences, then falls back to the first {...} or [...] block
  function parseJSON(text) {
    if (typeof text !== "string") return null;
    const cleaned = text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    try { return JSON.parse(cleaned); } catch {}
    const m = cleaned.match(/[\[{][\s\S]*[\]}]/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
    return null;
  }

  // parse() helpers: each returns the final value, or null if the text is unusable
  const plain = (max) => (t) => {
    const s = String(t ?? "").replace(/^["'“”]+|["'“”]+$/g, "").trim();
    return s ? s.slice(0, max) : null;
  };

  /* ---------- latency stats ---------- */
  const stats = {};
  const stat = (fn) => (stats[fn] ||= { calls: 0, hits: 0, fallbacks: 0, errors: 0, ms: [] });
  function latency() {
    return Object.entries(stats).map(([fn, s]) => {
      const sorted = [...s.ms].sort((a, b) => a - b);
      return {
        fn, model: MODELS[TIER[fn]], calls: s.calls, cacheHits: s.hits, fallbacks: s.fallbacks, errors: s.errors,
        avgMs: s.ms.length ? Math.round(s.ms.reduce((a, b) => a + b, 0) / s.ms.length) : null,
        p95Ms: sorted.length ? Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]) : null,
        lastMs: s.ms.length ? Math.round(s.ms[s.ms.length - 1]) : null,
      };
    });
  }

  /* ---------- persistent cache ---------- */
  let cache = {};
  const cacheReady = browser.storage.local.get("aiCache").then((r) => { cache = r.aiCache || {}; }).catch(() => {});
  let saveTimer;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const keys = Object.keys(cache);
      if (keys.length > MAX_CACHE) keys.slice(0, keys.length - MAX_CACHE).forEach((k) => delete cache[k]); // oldest out
      browser.storage.local.set({ aiCache: cache }).catch(() => {});
    }, 500);
  }

  /* ---------- API key: config.js first, then key.env ---------- */
  let keyPromise;
  function getKey() {
    if (!keyPromise) {
      keyPromise = (async () => {
        if (CFG.GEMINI_API_KEY && CFG.GEMINI_API_KEY !== " ") return CFG.GEMINI_API_KEY;
        try {
          const text = await (await fetch(browser.runtime.getURL("key.env"))).text();
          const m = text.match(/^\s*GEMINI_API_KEY\s*=\s*["']?([^"'\r\n#]+?)["']?\s*$/m);
          if (m) return m[1].trim();
          return /^AIza[\w-]{30,}$/.test(text.trim()) ? text.trim() : "";
        } catch { return ""; }
      })().then((k) => { if (!k) keyPromise = null; return k; }); // don't cache a miss
    }
    return keyPromise;
  }

  /* ---------- rate limiter: a sliding one-minute window, a concurrency cap, and 429 back-off ---------- */
  const sent = [];
  let active = 0, blockedUntil = 0;

  async function acquire(wait) {
    for (;;) {
      const t = Date.now();
      while (sent.length && t - sent[0] > 60000) sent.shift();
      if (t >= blockedUntil && sent.length < MAX_PER_MIN && active < MAX_CONCURRENT) { sent.push(t); active++; return true; }
      if (!wait) return false;               // interactive calls fall back immediately
      await new Promise((r) => setTimeout(r, 500)); // background jobs (pre-warm) wait their turn
    }
  }

  /* ---------- the one shared Gemini helper ---------- */
  // Returns { ok, text }. On any failure, text is the fallback string (or it throws if FALLBACK_ON_ERROR is off).
  async function callGemini(prompt, schema, o = {}) {
    const { tier = "strong", system = SYS, fallback = "", temperature = 0.4, fn = "call", wait = false } = o;
    const t0 = performance.now();
    let acquired = false;
    try {
      const key = await getKey();
      if (!key) throw new Error("No API key found. Put GEMINI_API_KEY=... in key.env");
      acquired = await acquire(wait);
      if (!acquired) throw new Error("Skipped locally: rate-limit guard");

      const generationConfig = { temperature };
      if (schema) { generationConfig.responseMimeType = "application/json"; generationConfig.responseSchema = schema; }

      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELS[tier]}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig,
          }),
          signal: ctl.signal,
        });
        if (res.status === 429) blockedUntil = Date.now() + (Number(res.headers.get("retry-after")) * 1000 || 30000);
        if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
        const data = await res.json();
        const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
        if (!text) throw new Error("Empty response from Gemini");

        const ms = performance.now() - t0;
        const s = stat(fn); s.calls++; s.ms.push(ms); if (s.ms.length > 50) s.ms.shift();
        console.debug(`[stick/ai] ${fn} on ${MODELS[tier]}: ${Math.round(ms)}ms`);
        return { ok: true, text };
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      const msg = err.name === "AbortError" ? `Timed out after ${TIMEOUT_MS / 1000}s` : err.message;
      stat(fn).errors++;
      console.warn(`[stick/ai] ${fn} failed: ${msg}`);
      if (!FALLBACK_ON_ERROR) throw new Error(msg);
      stat(fn).fallbacks++;
      return { ok: false, text: fallback };
    } finally {
      if (acquired) active--;
    }
  }

  /* ---------- cache, de-dupe, debounce and cooldown wrapped around callGemini ---------- */
  const inflight = new Map();   // identical concurrent requests share one call
  const lastCall = {};
  const waiting = {};           // per-function debounce state

  // Latest call wins. Superseded callers resolve with null: ignore a null result.
  function debounced(fn, exec, ms) {
    return new Promise((resolve, reject) => {
      const prev = waiting[fn];
      if (prev) { clearTimeout(prev.timer); prev.resolve(null); }
      const timer = setTimeout(() => { delete waiting[fn]; exec().then(resolve, reject); }, ms);
      waiting[fn] = { timer, resolve };
    });
  }

  // o: { prompt, schema?, fallbackText, parse, system?, temperature?, debounce?, cooldown?, wait? }
  async function run(fn, args, o) {
    const fallbackValue = () => o.parse(o.fallbackText);
    if (USE_FAKE) return fallbackValue();
    await cacheReady;

    const key = `v2:${fn}:${await hash(JSON.stringify(args))}`;
    if (cache[key] !== undefined) { stat(fn).hits++; return cache[key]; }
    if (o.cooldown && !o.wait && Date.now() - (lastCall[fn] || 0) < o.cooldown) { stat(fn).fallbacks++; return fallbackValue(); }

    const debounce = o.wait ? 0 : o.debounce;
    if (!debounce && inflight.has(key)) return inflight.get(key);

    const exec = async () => {
      lastCall[fn] = Date.now();
      const raw = await callGemini(o.prompt, o.schema, {
        tier: TIER[fn], system: o.system, temperature: o.temperature, fallback: o.fallbackText, fn, wait: o.wait,
      });
      const value = o.parse(raw.text);
      if (raw.ok && value != null) { cache[key] = value; persist(); return value; } // only real answers are cached
      if (raw.ok) {
        stat(fn).fallbacks++;
        console.warn(`[stick/ai] ${fn}: unusable response`);
        if (!FALLBACK_ON_ERROR) throw new Error(`${fn}: unusable response`);
        return fallbackValue();
      }
      return value ?? fallbackValue();
    };

    const p = debounce ? debounced(fn, exec, debounce) : exec();
    if (!debounce) { inflight.set(key, p); const done = () => inflight.delete(key); p.then(done, done); }
    return p;
  }

  /* ---------- the functions ---------- */
  function nameGroup(titles = [], _o = {}) {
    const list = (Array.isArray(titles) ? titles : []).map((t) => clip(t, 120)).filter(Boolean).slice(0, 12);
    const ignored = new Set([
      "about", "google", "search", "scholar", "pubmed", "qmul", "qmplus", "result", "results",
      "article", "articles", "home", "page", "online", "the", "and", "for", "with", "from",
      "your", "this", "that", "www", "com", "org", "edu", "co", "uk",
    ]);
    const counts = new Map();
    for (const title of list) {
      const seen = new Set();
      for (const token of title.match(/[A-Za-z][A-Za-z0-9'-]{2,}/g) || []) {
        const word = token.toLowerCase();
        if (!ignored.has(word) && !seen.has(word)) {
          seen.add(word);
          counts.set(word, (counts.get(word) || 0) + 1);
        }
      }
    }
    const localName = [...counts]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([word]) => word[0].toUpperCase() + word.slice(1))
      .join(" ") || "Study Research";
    return run("nameGroup", list, {
      prompt: `Name this group of browser tabs in 2 to 4 words (Title Case, no punctuation).\nTab titles:\n- ${list.join("\n- ")}`,
      fallbackText: localName,
      parse: (t) => { const s = String(t ?? "").replace(/["'.\n]/g, "").trim().slice(0, 40); return s || null; },
      ..._o,
    });
  }

  const LEVELS = {
    1: "Lightly reword it so it reads more clearly: shorter sentences and plainer words, but keep the technical terms.",
    2: "Rewrite it in plain, simple English for a student who found it confusing. Keep the meaning.",
    3: "Explain it very simply, as if to a curious 12-year-old, using everyday words (a short analogy is fine).",
  };
  const normLevel = (l) => ({ 1: 1, light: 1, 2: 2, plain: 2, 3: 3, simple: 3, simplest: 3, eli12: 3 })[String(l).toLowerCase()] ?? 2;

  function simplify(text, level = 2, _o = {}) {
    const t = clip(text, 3000), lv = normLevel(level);
    return run("simplify", [t, lv], {
      prompt: `${LEVELS[lv]} Keep it no longer than the original. Reply with only the rewritten text.\n\n${t}`,
      fallbackText: `In simple terms: ${firstSentences(t, 1)}`,
      parse: plain(3000),
      ..._o,
    });
  }

  function summarise(text, _o = {}) {
    const t = clip(text);
    return run("summarise", [t], {
      prompt: `Summarise this in at most 3 short sentences (under 60 words in total).\n\n${t}`,
      fallbackText: firstSentences(t, 2),
      parse: plain(1200),
      ..._o,
    });
  }

  function briefing({ task, sleeping, lastSection } = {}, _o = {}) {
    const n = Array.isArray(sleeping) ? sleeping.length : Number(sleeping) || 0;
    const ctx = { task: clip(task, 120), sleeping: n, lastSection: clip(lastSection, 120) };
    return run("briefing", [ctx], {
      prompt: `Write a one-sentence welcome-back briefing (max 25 words, friendly, second person) for a student returning from a break. ` +
        `Task: ${ctx.task || "unknown"}. Sleeping tabs: ${n}. Last section they were reading: ${ctx.lastSection || "unknown"}.`,
      fallbackText: `Welcome back! You were working on ${ctx.task || "your task"}${ctx.lastSection ? `, up to "${ctx.lastSection}"` : ""}. ${n} tab${n === 1 ? "" : "s"} asleep.`,
      parse: plain(300),
      ..._o,
    });
  }

  function define(term, context = "", _o = {}) {
    const w = clip(term, 80), c = clip(context, 400);
    return run("define", [w, c], {
      prompt: `Define "${w}" in plain English as it is used in this context, in one sentence of at most 25 words.` +
        `${c ? `\nContext: ${c}` : ""}\nReply with only the definition.`,
      fallbackText: `${w}: no definition available right now.`,
      parse: plain(300),
      debounce: 250,
      ..._o,
    });
  }

  // Tiny offline dictionary: used for fake mode and as the fallback if the API is unavailable
  const TYPOS = {
    teh: "the", recieve: "receive", definately: "definitely", seperate: "separate", alot: "a lot",
    occured: "occurred", libary: "library", tomorow: "tomorrow", tommorow: "tomorrow",
    wich: "which", becuase: "because", wierd: "weird", adress: "address", untill: "until",
    accomodate: "accommodate",
  };
  function localCheck(text) {
    const out = [], seen = new Set();
    for (const m of text.matchAll(/[A-Za-z']+/g)) {
      const fix = TYPOS[m[0].toLowerCase()];
      if (fix && !seen.has(m[0])) { seen.add(m[0]); out.push({ word: m[0], suggestion: fix, reason: "spelling" }); }
    }
    return out;
  }

  const CHECK_SCHEMA = {
    type: "OBJECT",
    properties: {
      issues: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: { word: { type: "STRING" }, suggestion: { type: "STRING" }, reason: { type: "STRING" } },
          required: ["word", "suggestion"],
        },
      },
    },
    required: ["issues"],
  };

  // Resolves to [{ word, suggestion, reason }]. Every word is verified to appear in the text.
  function checkText(text, _o = {}) {
    const t = clip(text, 2000);
    return run("checkText", [t], {
      prompt:
        `Proofread the text below. Report ONLY words that are genuinely wrong in context: misspellings and wrong-word errors ` +
        `(their/there/they're, your/you're, its/it's, to/too/two, then/than, affect/effect, loose/lose, and similar), ` +
        `judged from the surrounding sentence.\n` +
        `Do NOT report style or grammar preferences, punctuation, capitalisation, names, brands, acronyms, technical jargon, code, URLs, ` +
        `or any word that is correct in context.\n` +
        `Each "word" must be copied exactly as it appears in the text. "suggestion" is the corrected word or short phrase. ` +
        `If nothing is wrong, return an empty list.\n\nText:\n${t}`,
      schema: CHECK_SCHEMA,
      temperature: 0,
      fallbackText: JSON.stringify({ issues: localCheck(t) }),
      parse: (raw) => {
        const data = parseJSON(raw);
        const list = Array.isArray(data) ? data : data?.issues;
        if (!Array.isArray(list)) return null;
        const seen = new Set();
        return list
          .filter((i) => i && typeof i.word === "string" && typeof i.suggestion === "string" &&
            i.word.trim() && i.suggestion.trim() && i.word !== i.suggestion && t.includes(i.word))
          .filter((i) => !seen.has(i.word) && seen.add(i.word))
          .slice(0, 20)
          .map((i) => ({ word: i.word.trim(), suggestion: i.suggestion.trim(), reason: String(i.reason || "").slice(0, 120) }));
      },
      debounce: 700,
      ..._o,
    });
  }

  const QUIPS = { flow: "Look at you go.", drift: "Psst. Back to it?", stuck: "Tricky one. I've got it.", idle: "Just vibing here." };

  function quip(state = {}, _o = {}) {
    const s = { focus: state.focus || "idle", reading: state.reading || "ok", task: clip(state.task, 80), n: state.n ?? 0 };
    const key = s.reading === "confused" ? "stuck" : s.focus;
    return run("quip", [s], {
      system: VOICE,
      prompt: `Right now: focus=${s.focus}, reading=${s.reading}${s.task ? `, task="${s.task}"` : ""}. Variation ${s.n}. ` +
        `Say one short line (max 8 words) to the user.`,
      temperature: 0.9,
      fallbackText: QUIPS[key] || QUIPS.idle,
      parse: (t) => {
        const words = String(t ?? "").split("\n")[0].replace(/["“”]/g, "").trim().split(/\s+/).filter(Boolean);
        return words.length ? words.slice(0, 8).join(" ") : null;   // hard cap at 8 words
      },
      cooldown: 4000, // at most one fresh quip every 4 s: rapid state flips get a canned line instead
      ..._o,
    });
  }

  /* ---------- pre-warm the cache from demo.js ---------- */
  async function prewarm() {
    const d = globalThis.STICK_DEMO;
    if (!d) return console.log("[stick/ai] no STICK_DEMO found: nothing to pre-warm");
    if (USE_FAKE) return console.log("[stick/ai] USE_FAKE is on: skipping pre-warm");
    const w = { wait: true }; // queue politely behind the rate limiter instead of falling back
    const jobs = [
      ...(d.groups || []).map((g) => () => nameGroup(g, w)),
      ...(d.paragraphs || []).flatMap((p) => (d.levels || [2]).map((lv) => () => simplify(p, lv, w))),
      ...(d.pages || []).map((p) => () => summarise(p, w)),
      ...(d.briefings || []).map((b) => () => briefing(b, w)),
      ...(d.terms || []).map(([term, ctx]) => () => define(term, ctx, w)),
      ...(d.texts || []).map((t) => () => checkText(t, w)),
      ...(d.states || []).map((s) => () => quip(s, w)),
    ];
    let done = 0;
    for (const job of jobs) { try { await job(); done++; } catch (err) { console.warn("[stick/ai] pre-warm item failed:", err.message); } }
    console.log(`[stick/ai] pre-warm finished: ${done}/${jobs.length} items`);
    return { done, total: jobs.length };
  }

  globalThis.StickAI = { nameGroup, simplify, summarise, briefing, define, checkText, quip, latency, prewarm };

  /* ---------- message router, so content scripts and the sidebar can call the same functions ---------- */
  const PUBLIC = ["nameGroup", "simplify", "summarise", "briefing", "define", "checkText", "quip", "latency"];
  browser.runtime.onMessage.addListener((msg) => {
    if (msg?.type !== "ai" || !PUBLIC.includes(msg.fn)) return; // not ours, ignore
    return globalThis.StickAI[msg.fn](...(msg.args || []));
  });

  if (CFG.PREWARM !== false) setTimeout(() => prewarm().catch((e) => console.warn("[stick/ai] pre-warm:", e)), 3000);
})();