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

  const send = (msg) => api.runtime.sendMessage(msg).catch((err) => {
    console.warn("[stick] runtime message failed:", err);
  });
  const stick = (action, text, target) => {
    if (!globalThis.stick?.perform) {
      console.warn("[stick] animation actor is not available");
      return Promise.resolve();
    }
    return globalThis.stick.perform({ action, text, target }).catch((err) => {
      console.warn(`[stick] ${action} action failed:`, err);
    });
  };
  const inbox = (kind, item) => send({ type: "inbox", kind, item });
  const pageInfo = () => ({ title: document.title || location.hostname, url: location.href });

  let lastInput = Date.now();

  /* ---------- 1. confusion: rewrite the paragraph in place ---------- */
  const handled = new WeakSet();
  const offered = new WeakSet();
  let busy = false, lastRewrite = 0;
  const typoTimers = new WeakMap();
  const checkedText = new WeakMap();
  const proofreadPrompts = new WeakMap();

  function editableText(el) {
    return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
      ? el.value
      : el.innerText || el.textContent || "";
  }

  function editableTarget(el) {
    return (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
      ? !el.disabled && !el.readOnly && el.type !== "password" && el.type !== "hidden"
      : el.isContentEditable;
  }

  function findWordRange(root, word) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\b${escaped}\\b`, "i");
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const match = pattern.exec(node.textContent);
      if (!match) continue;
      const range = document.createRange();
      range.setStart(node, match.index);
      range.setEnd(node, match.index + match[0].length);
      return range;
    }
    return null;
  }

  function matchCase(source, replacement) {
    if (source === source.toUpperCase()) return replacement.toUpperCase();
    if (source[0] === source[0].toUpperCase()) {
      return replacement[0].toUpperCase() + replacement.slice(1);
    }
    return replacement;
  }

  async function checkEditable(el) {
    const text = editableText(el);
    if (text.length < 3 || checkedText.get(el) === text) return;
    const issues = await StickAI.checkText(text);
    if (!el.isConnected || editableText(el) !== text) return;
    const suggestions = issues.filter((issue) =>
      el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
        ? new RegExp(`\\b${issue.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)
        : findWordRange(el, issue.word));
    if (!suggestions.length) {
      checkedText.set(el, text);
      return;
    }
    const preview = suggestions.slice(0, 4).map((issue) => `${issue.word} → ${issue.suggestion}`).join("; ");
    const remainder = suggestions.length > 4 ? `; +${suggestions.length - 4} more` : "";
    let prompt;
    prompt = pagePrompt(el, `Possible spelling fixes: ${preview}${remainder}`, [
      {
        label: `Fix all ${suggestions.length}`,
        primary: true,
        run: () => {
          prompt.remove();
          proofreadPrompts.delete(el);
          applyCorrections(el, text, suggestions)
            .catch((error) => console.warn("[stick] batch proofreading failed:", error));
        },
      },
      {
        label: "Not now",
        run: () => {
          prompt.remove();
          proofreadPrompts.delete(el);
          checkedText.set(el, text);
        },
      },
    ]);
    proofreadPrompts.set(el, prompt);
    stick("say", `${suggestions.length} possible spelling fixes. Want them?`);
  }

  async function applyCorrections(el, originalText, issues) {
    if (!el.isConnected || editableText(el) !== originalText) return;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      let correctedText = originalText;
      let corrected = 0;
      for (const issue of issues) {
        const escaped = issue.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = new RegExp(`\\b${escaped}\\b`, "gi");
        correctedText = correctedText.replace(pattern, (source) => {
          corrected++;
          return matchCase(source, issue.suggestion);
        });
      }
      if (!corrected) return;
      el.value = correctedText;
      if (start != null && end != null) {
        const delta = correctedText.length - originalText.length;
        el.setSelectionRange(Math.min(start + delta, correctedText.length), Math.min(end + delta, correctedText.length));
      }
      checkedText.set(el, correctedText);
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertReplacementText" }));
      checkedText.set(el, correctedText);
      inbox("activity", {
        title: "Draft proofread",
        text: `${corrected} spelling ${corrected === 1 ? "correction" : "corrections"} applied in one pass.`,
        ...pageInfo(),
        ts: Date.now(),
      });
      stick("say", "Fixed the spelling. Have a look.");
      return;
    }
    let corrected = 0;
    for (const issue of issues) {
      if (!el.isConnected) break;
      const range = findWordRange(el, issue.word);
      if (!range) continue;
      const correction = matchCase(range.toString(), issue.suggestion);
      await stick("punch", correction, range);
      corrected++;
    }
    checkedText.set(el, editableText(el));
    if (corrected) {
      inbox("activity", {
        title: "Draft proofread",
        text: `${corrected} spelling ${corrected === 1 ? "correction" : "corrections"} applied in one pass.`,
        ...pageInfo(),
        ts: Date.now(),
      });
    }
  }

  addEventListener("input", (event) => {
    const el = event.target;
    if (!(el instanceof HTMLElement) || !editableTarget(el)) return;
    proofreadPrompts.get(el)?.remove();
    proofreadPrompts.delete(el);
    clearTimeout(typoTimers.get(el));
    typoTimers.set(el, setTimeout(() => {
      checkEditable(el).catch((err) => console.warn("[stick] typo check failed:", err));
    }, 700));
  }, true);

  function pagePrompt(el, message, actions) {
    const host = document.createElement("span");
    const isFormControl = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
    host.style.cssText = isFormControl
      ? "display:block;position:fixed;z-index:2147483000;max-width:min(420px,calc(100vw - 16px));"
      : "display:block;margin:8px 0;position:relative;z-index:2147483000;";
    if (isFormControl) {
      const rect = el.getBoundingClientRect();
      host.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - 428))}px`;
      host.style.top = `${Math.min(rect.bottom + 8, innerHeight - 80)}px`;
    }
    host.setAttribute("data-stick-reading-prompt", "");
    const root = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = `
      :host{all:initial}
      .card{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:8px 10px;border:1px solid #d8dfd4;border-radius:10px;background:#f7faf6;color:#26372b;font:13px/1.4 system-ui,sans-serif;box-shadow:0 3px 12px #0002}
      .message{flex:1 1 180px}
      button{padding:5px 10px;border:1px solid #d8dfd4;border-radius:7px;background:#fff;color:#26372b;font:600 12px system-ui,sans-serif;cursor:pointer}
      button.primary{border-color:#305e4d;background:#305e4d;color:#fff}
      button:focus-visible{outline:2px solid #5274a5;outline-offset:2px}`;
    const card = document.createElement("span");
    card.className = "card";
    const label = document.createElement("span");
    label.className = "message";
    label.textContent = message;
    card.append(label);
    for (const action of actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = action.label;
      if (action.primary) button.className = "primary";
      button.addEventListener("click", action.run);
      card.append(button);
    }
    root.append(style, card);
    el.insertAdjacentElement("afterend", host);
    return host;
  }

  function offerSimplification(el) {
    if (busy || handled.has(el) || offered.has(el) || Date.now() - lastRewrite < COOLDOWN) return;
    offered.add(el);
    send({ reading: "confused" });
    stick("magnify", "Want me to make this simpler?", el);
    let prompt;
    prompt = pagePrompt(el, "This passage may be worth another look.", [
      {
        label: "Simplify",
        primary: true,
        run: () => {
          prompt.remove();
          simplifyParagraph(el).catch((error) => console.warn("[stick] simplify failed:", error));
        },
      },
      {
        label: "Not now",
        run: () => {
          prompt.remove();
          handled.add(el);
          send({ reading: "ok" });
          stick("idle");
        },
      },
    ]);
  }

  async function simplifyParagraph(el) {
    if (busy || handled.has(el)) return;
    busy = true;
    handled.add(el);
    send({ reading: "confused" });
    try {
      const original = el.innerHTML;
      const originalStyle = el.getAttribute("style");
      const originalTitle = el.title;
      const simple = await StickAI.simplify(el.textContent.trim());
      if (simple && el.isConnected) {
        if (globalThis.stick?.perform) await stick("erase", simple, el);
        else el.textContent = simple;
        Object.assign(el.style, { borderLeft: "3px solid #4f46e5", paddingLeft: "10px", background: "rgba(79,70,229,.07)" });
        el.title = "Simplified by Stick. Use the button below to restore the original.";
        let showingSimple = true;
        const simpleStyle = el.getAttribute("style");
        const simpleTitle = el.title;
        let versionPrompt;
        versionPrompt = pagePrompt(el, "Simplified by Stick. The original is saved.", [{
          label: "Show original",
          primary: true,
          run: () => {
            if (showingSimple) {
              versionPrompt.remove();
              el.innerHTML = original;
              if (originalStyle == null) el.removeAttribute("style");
              else el.setAttribute("style", originalStyle);
              el.title = originalTitle;
              showingSimple = false;
              const card = pagePrompt(el, "Original restored.", [{
                label: "Show simpler version",
                primary: true,
                run: () => {
                  el.textContent = simple;
                  el.setAttribute("style", simpleStyle || "");
                  el.title = simpleTitle;
                  card.remove();
                },
              }]);
            }
          },
        }]);
        inbox("activity", {
          title: "Passage simplified",
          text: pageInfo().title,
          url: location.href,
          ts: Date.now(),
        });
        stick("say", "Here's a simpler version.");
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
    if (e.scrollBacks >= CONFUSED_SCROLLBACKS) offerSimplification(e.el);
  });

  // slow-reading check on whatever is on screen right now
  setInterval(() => {
    if (document.visibilityState !== "visible" || Date.now() - lastInput > ACTIVE_WITHIN) return;
    for (const p of StickReading.visible()) {
      if (p.words >= SLOW_MIN_WORDS && p.dwellMs >= SLOW_MIN_DWELL && p.dwellMs / p.words >= SLOW_MS_PER_WORD) {
        offerSimplification(p.el);
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
