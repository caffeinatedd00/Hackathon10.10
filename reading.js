(() => {
  if (globalThis.StickReading) return;

  const SEL = "p, li, h1, h2, h3, h4, h5, h6, blockquote";
  const SKIP = "nav, footer, aside, form, button, [role='navigation'], [aria-hidden='true']";
  const MIN_CHARS = 40;          // body text shorter than this isn't a "paragraph" (headings are exempt)
  const VISIBLE_RATIO = 0.6;     // an element counts as on screen at 60% visible...
  const VISIBLE_VIEWPORT = 0.5;  // ...or when it fills half the viewport (for very tall paragraphs)
  const MIN_READ_MS = 1500;      // a scroll-back only counts if they'd read it at least this long
  const MIN_GAP_MS = 600;        // and it was off screen this long (filters scroll jitter)
  const DEBUG = false;

  const records = new Map();     // element -> record
  const visible = new Set();     // elements currently counted as on screen
  const listeners = [];
  let nextId = 1;
  let paused = document.visibilityState === "hidden";

  const now = () => performance.now();
  const liveDwell = (r) => Math.round(r.dwellMs + (r.visibleSince != null ? now() - r.visibleSince : 0));
  // Which edge of the viewport the element is nearer to: used to tell "scrolled past" from "scrolled back to"
  const side = (rect) => (rect.top + rect.height / 2 < innerHeight / 2 ? "above" : "below");

  function emit(type, el, r) {
    const e = {
      type, el, id: r.id, text: el.textContent.trim().slice(0, 200),
      dwellMs: liveDwell(r), visits: r.visits, scrollBacks: r.scrollBacks,
    };
    for (const fn of listeners) { try { fn(e); } catch (err) { console.error("[stick]", err); } }
  }

  function show(el, r, rect) {
    const t = now();
    // Scroll-back: it left through the top (they scrolled past it), now it re-enters from the top
    const returning = r.visits > 0 && r.exitSide === "above" && side(rect) === "above"
      && t - r.exitedAt >= MIN_GAP_MS && r.dwellMs >= MIN_READ_MS;
    r.visits++;
    visible.add(el);
    if (!paused) r.visibleSince = t;
    if (returning) { r.scrollBacks++; emit("scrollback", el, r); }
    else emit("enter", el, r);
  }

  function hide(el, r, rect) {
    if (r.visibleSince != null) { r.dwellMs += now() - r.visibleSince; r.visibleSince = null; }
    r.exitSide = side(rect);
    r.exitedAt = now();
    visible.delete(el);
    emit("exit", el, r);
  }

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const el = entry.target, r = records.get(el);
      if (!r) continue;
      const isVis = entry.isIntersecting &&
        (entry.intersectionRatio >= VISIBLE_RATIO || entry.intersectionRect.height >= innerHeight * VISIBLE_VIEWPORT);
      const was = visible.has(el);
      if (isVis && !was) show(el, r, entry.boundingClientRect);
      else if (!isVis && was) hide(el, r, entry.boundingClientRect);
    }
  }, { threshold: Array.from({ length: 21 }, (_, i) => i / 20) });

  // Dwell only counts while the tab is actually in front
  document.addEventListener("visibilitychange", () => {
    paused = document.visibilityState === "hidden";
    const t = now();
    for (const el of visible) {
      const r = records.get(el);
      if (!r) continue;
      if (paused && r.visibleSince != null) { r.dwellMs += t - r.visibleSince; r.visibleSince = null; }
      else if (!paused && r.visibleSince == null) r.visibleSince = t;
    }
  });

  function track(el) {
    // Leaf-most only, so <li><p>..</p></li> or <blockquote><p>..</p></blockquote> isn't counted twice
    if (records.has(el) || el.closest(SKIP) || el.querySelector(SEL)) return;
    const text = el.textContent.trim();
    if (text.length < (/^H[1-6]$/.test(el.tagName) ? 3 : MIN_CHARS)) return;
    records.set(el, {
      id: nextId++, words: text.split(/\s+/).length,
      dwellMs: 0, visibleSince: null, visits: 0, scrollBacks: 0, exitedAt: 0, exitSide: null,
    });
    io.observe(el);
  }

  function scan(root) {
    if (root.nodeType !== 1) return;
    if (root.matches(SEL)) track(root);
    root.querySelectorAll(SEL).forEach(track);
  }

  // Pick up content added later (infinite scroll, SPAs)
  const pending = new Set();
  let timer;
  new MutationObserver((muts) => {
    for (const m of muts) m.addedNodes.forEach((n) => n.nodeType === 1 && pending.add(n));
    clearTimeout(timer);
    timer = setTimeout(() => { pending.forEach(scan); pending.clear(); }, 300);
  }).observe(document.body, { childList: true, subtree: true });

  function prune() {
    for (const el of records.keys()) {
      if (!el.isConnected) { io.unobserve(el); records.delete(el); visible.delete(el); }
    }
  }

  globalThis.StickReading = {
    // fn receives { type: "enter" | "exit" | "scrollback", el, id, text, dwellMs, visits, scrollBacks }
    on: (fn) => listeners.push(fn),
    // Snapshot of every tracked paragraph, with live dwell
    stats() {
      prune();
      return [...records].map(([el, r]) => {
        const dwellMs = liveDwell(r);
        return {
          id: r.id, text: el.textContent.trim().slice(0, 80), words: r.words,
          dwellMs, msPerWord: Math.round(dwellMs / r.words), visits: r.visits, scrollBacks: r.scrollBacks,
        };
      });
    },
  };

  scan(document.body);

  if (DEBUG) {
    StickReading.on((e) => {
      if (e.type === "scrollback") {
        e.el.style.outline = "2px solid #f97316";
        console.log(`[stick] scroll-back #${e.scrollBacks}:`, e.text.slice(0, 60));
      }
    });
    addEventListener("keydown", (e) => {
      if (e.altKey && e.shiftKey && e.code === "KeyR") console.table(StickReading.stats());
    });
  }
})();
