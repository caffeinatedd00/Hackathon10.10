(() => {
  const pages = {
    pubmed: {
      address: "pubmed.ncbi.nlm.nih.gov",
      external: "https://pubmed.ncbi.nlm.nih.gov/",
      tab: "PubMed",
      workspace: "research",
      title: "How sleep supports memory after learning",
      crumb: "Journal article preview · Example content",
      meta: 'A sample research summary · <a href="https://pubmed.ncbi.nlm.nih.gov/" target="_blank" rel="noopener noreferrer">PubMed is a real biomedical literature resource</a>',
      icon: "P",
      brand: "PubMed",
      paragraph: "Memory consolidation is the process through which newly encoded information becomes stabilized and integrated with existing knowledge. Evidence suggests that sleep after learning can support this process, although effects vary by task, timing and individual differences.",
      simplified: "Memory consolidation is how the brain strengthens new information and connects it to what you already know. Sleep after studying may help, but the effect depends on what you learned, when you sleep and the person.",
      before: "Researchers continue to study how sleep changes memory after learning. The exact effects can depend on the type of task, when sleep happens and individual differences.",
      after: "Example paragraph saved in your notes.",
      citation: "Sample text for this prototype · not a real paper abstract",
      asideTitle: "A useful reading moment",
      asideText: "A long paragraph feels dense? Ask Stick for a plainer version, then compare it with the original.",
      otherTitle: "Keep the source",
      otherText: "Your note keeps the page title and link beside the passage.",
    },
    scholar: {
      address: "scholar.google.com",
      external: "https://scholar.google.com/",
      tab: "Google Scholar",
      workspace: "research",
      title: "Search across research before opening another dozen tabs",
      crumb: "Research search preview · Example content",
      meta: 'A familiar starting point for literature searches · <a href="https://scholar.google.com/" target="_blank" rel="noopener noreferrer">Google Scholar is a real search service</a>',
      icon: "G",
      brand: "Google Scholar",
      paragraph: "A focused search workflow can make a literature review easier to manage: keep related papers together, capture the claim you want to revisit, and retain the source link so you can check the evidence later.",
      simplified: "For a literature review, group related papers, save claims you want to check again, and keep the links so you can verify the evidence.",
      before: "Search result 1 · Sleep and learning: a review",
      after: "Example result · Memory during sleep",
      citation: "Example search results · not live results",
      asideTitle: "Research workspace",
      asideText: "Scholar and PubMed are grouped as one task so a side search does not get lost among course tabs.",
      otherTitle: "No source guessing",
      otherText: "Saved notes keep the URL they came from.",
    },
    qmplus: {
      address: "qmplus.qmul.ac.uk",
      external: "https://qmplus.qmul.ac.uk/",
      tab: "QMplus",
      workspace: "coursework",
      title: "PSYC 101 · Learning and memory",
      crumb: "My courses / Week 5 / Assignment",
      meta: 'Course-page mockup · <a href="https://qmplus.qmul.ac.uk/" target="_blank" rel="noopener noreferrer">QMplus is Queen Mary University of London’s learning platform</a>',
      icon: "Q",
      brand: "QMplus",
      paragraph: "Assignment brief: Compare two explanations for how information is remembered. Use at least two academic sources, describe one limitation of each explanation, and submit your response through the course page.",
      simplified: "For this assignment: compare two theories of memory, use at least two academic sources, explain one weakness of each theory and submit your work on the course page.",
      before: "Assignment · Memory theories comparison",
      after: "Write your comparison and submit it on QMplus.",
      citation: "Example coursework details · check your actual course page for requirements",
      asideTitle: "Coursework, not another pile",
      asideText: "Keep the course page and lecture notes under Coursework while your research stays separate.",
      otherTitle: "No guessed deadlines",
      otherText: "This concept does not scan or invent due dates. Check the date shown in your real course page.",
    },
    draft: {
      address: "draft.study.local",
      external: "https://example.edu/",
      tab: "Draft",
      workspace: "coursework",
      title: "Your assignment draft",
      crumb: "Coursework / notes / untitled draft",
      meta: "Simulated contenteditable draft · proofreading is a concept interaction",
      icon: "D",
      brand: "Writing draft",
      paragraph: "",
      simplified: "",
      before: "A single pause lets Stick check the whole draft, then show the proposed corrections together.",
      after: "Example only · check every suggested edit before using it in submitted work.",
      citation: "The live extension supports ordinary contenteditable editors; canvas-based editors are not supported.",
      asideTitle: "One review, not one typo at a time",
      asideText: "A single proofreading pass can gather spelling suggestions across the draft.",
      otherTitle: "You approve the changes",
      otherText: "A real editor needs explicit review and a way to undo every applied suggestion.",
    },
  };

  const pageArea = document.querySelector("#page-area");
  const addressText = document.querySelector("#address-text");
  const openSite = document.querySelector("#open-site");
  const stickCaption = document.querySelector("#stick-caption");
  const toastEl = document.querySelector("#toast");
  const noteList = document.querySelector("#note-list");
  const noteCount = document.querySelector("#note-count");
  let activeSite = "pubmed";
  let focusActive = false;
  let focusEndsAt = 0;
  let focusTimer = null;
  let toastTimer;
  let actor;

  try {
    actor = window.Stick?.create({
      container: document.querySelector("#stick-stage"),
      assetBase: "Stickman/stick-module/stick-module/assets/",
      fallbackBase: "Stickman/stick-module/stick-module/assets-placeholder/",
      targetHeight: 220,
      entrance: false,
      quirks: false,
      halo: false,
      home: { x: 140, y: 102 },
      homeMargin: 0,
    });
    actor?.perform({ action: "idle" }).catch(() => {});
  } catch (error) {
    console.warn("[STICK mockup] sprite preview could not start:", error);
  }

  function announce(message) {
    toastEl.textContent = message;
    toastEl.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("visible"), 2800);
    stickCaption.textContent = message;
  }

  function animate(action, text, target) {
    if (!actor?.perform) return;
    if (action === "walk" && !target) target = document.querySelector("#stick-stage");
    actor.perform({ action, text, target }).catch((error) => {
      console.warn(`[STICK mockup] ${action} animation failed:`, error);
    });
  }

  function activeParagraph() {
    return pageArea.querySelector(".target-paragraph");
  }

  function renderPage(site, { animateChange = false } = {}) {
    const page = pages[site];
    if (!page) return;
    const isDraft = site === "draft";
    activeSite = site;
    addressText.textContent = page.address;
    openSite.href = page.external;
    openSite.hidden = isDraft;
    document.querySelectorAll(".browser-tab").forEach((tab) => {
      const selected = tab.dataset.site === site;
      tab.classList.toggle("active", selected);
      tab.setAttribute("aria-selected", String(selected));
    });
    document.querySelectorAll(".workspace-card").forEach((card) => {
      const selected = card.dataset.workspace === page.workspace;
      card.classList.toggle("active", selected);
      card.setAttribute("aria-pressed", String(selected));
    });

    const isSearch = site === "scholar";
    const courseDetails = site === "qmplus"
      ? `<div class="assignment-box"><strong>What to do</strong><p>Compare two explanations for memory. Use two academic sources, note one limitation of each, and submit on the course page.</p><span class="due-label">Example brief · verify the real course page</span></div>`
      : "";
    const searchResults = isSearch
      ? `<div class="search-box"><span aria-hidden="true">⌕</span> sleep memory consolidation learning</div>
         <div class="search-result"><h3>Sleep, memory and learning</h3><p>Example result: a review of how sleep can support newly learned information.</p><small>Example record · open the real search service to explore</small></div>
         <div class="search-result"><h3>Memory after study: what the evidence says</h3><p>Example result: compare study design, population and limitations before using a claim.</p><small>Example record · not a live Scholar result</small></div>`
      : "";
    const paragraph = isDraft
      ? `<p>${page.paragraph}</p>`
      : `<p class="target-paragraph">${page.paragraph}</p>`;
    const actionLabel = site === "qmplus" ? "Simplify assignment brief" : "Simplify this passage";
    const noteLabel = site === "qmplus" ? "Save brief to notes" : "Save passage to notes";
    const draftContent = isDraft
      ? `<div class="draft-editor" contenteditable="true" role="textbox" aria-label="Example assignment draft" spellcheck="false">I need to seperate these notes becuase teh paper is definately relevant to alot of my revision.</div>
         <p class="draft-disclaimer">Example spelling errors · try one proofreading pass.</p>`
      : "";
    const actions = isDraft
      ? `<button class="action-button primary" data-action="proofread"><span aria-hidden="true">✦</span>Proofread whole draft</button>
         <button class="action-button" data-action="save"><span aria-hidden="true">＋</span>Save draft note</button>`
      : `<button class="action-button primary" data-action="simplify"><span aria-hidden="true">✦</span>${actionLabel}</button>
         <button class="action-button" data-action="save"><span aria-hidden="true">＋</span>${noteLabel}</button>
         ${site !== "qmplus" ? '<button class="action-button" data-action="welcome"><span aria-hidden="true">↻</span>Welcome back</button>' : ""}`;

    pageArea.innerHTML = `
      <div class="page-layout">
        <article class="page-main">
          <div class="site-brand ${site === "qmplus" ? "qm-brand" : site === "scholar" ? "scholar-brand" : ""}">
            <span class="site-brand-mark">${page.icon}</span>${page.brand}
          </div>
          <p class="crumb">${page.crumb}</p>
          <h3 class="page-title">${page.title}</h3>
          <p class="page-meta">${page.meta}</p>
          <div class="page-body">
            ${isSearch ? searchResults : ""}
            ${isDraft ? "" : `<p>${page.before}</p>`}
            ${paragraph}
            ${draftContent}
            ${courseDetails}
            <p>${page.citation}</p>
          </div>
          <div class="action-row">
            ${actions}
          </div>
        </article>
        <aside class="page-aside">
          <p class="aside-label">A SMALL HELPING HAND</p>
          <div class="related-card"><strong>${page.asideTitle}</strong><p>${page.asideText}</p></div>
          <div class="related-card"><strong>${page.otherTitle}</strong><p>${page.otherText}</p></div>
          <div class="focus-card">
            <span class="focus-glyph" aria-hidden="true">◷</span>
            <span class="focus-copy"><strong>${focusActive ? "Focus session on" : "Take a focus block"}</strong><small>${focusActive ? "Gentle mode · no sites blocked" : "Optional · 25 minutes"}</small></span>
            <button class="focus-toggle" aria-pressed="${focusActive}">${focusActive ? "End" : "Start"}</button>
          </div>
        </aside>
      </div>`;

    pageArea.querySelector('[data-action="simplify"]')?.addEventListener("click", simplify);
    pageArea.querySelector('[data-action="proofread"]')?.addEventListener("click", proofreadDraft);
    pageArea.querySelector('[data-action="save"]')?.addEventListener("click", saveNote);
    pageArea.querySelector('[data-action="welcome"]')?.addEventListener("click", welcomeBack);
    pageArea.querySelector(".focus-toggle")?.addEventListener("click", toggleFocus);
    if (focusActive) updateFocusCard();
    if (animateChange) {
      animate("walk");
      announce(`Workspace switched to ${page.workspace === "research" ? "Memory & learning" : "Coursework"}.`);
    }
  }

  function simplify() {
    const page = pages[activeSite];
    const paragraph = activeParagraph();
    if (!paragraph) {
      announce("Open a page with a passage to try the reading helper.");
      return;
    }
    if (paragraph.dataset.simplified === "true") {
      announce("This passage is already in its plain-language version.");
      return;
    }
    paragraph.dataset.original = paragraph.textContent;
    if (!paragraph.dataset.originalMinHeight) {
      paragraph.dataset.originalMinHeight = `${paragraph.getBoundingClientRect().height}px`;
      paragraph.style.minHeight = paragraph.dataset.originalMinHeight;
    }
    paragraph.textContent = page.simplified;
    paragraph.dataset.simplified = "true";
    paragraph.classList.add("simplified");
    let restoreButton = pageArea.querySelector('[data-action="restore"]');
    if (!restoreButton) {
      restoreButton = document.createElement("button");
      restoreButton.className = "action-button";
      restoreButton.dataset.action = "restore";
      restoreButton.addEventListener("click", () => toggleOriginal(paragraph, restoreButton));
      pageArea.querySelector(".action-row").insertBefore(restoreButton, pageArea.querySelector('[data-action="save"]'));
    }
    restoreButton.textContent = "Show original";
    announce("Here’s a clearer version. The original can be restored anytime.");
    animate("magnify", "Want a clearer version?", document.querySelector("#stick-stage"));
  }

  function proofreadDraft() {
    const editor = pageArea.querySelector(".draft-editor");
    if (!editor) return;
    const corrections = [
      [/\bseperate\b/gi, (word) => matchDraftCase(word, "separate")],
      [/\bbecuase\b/gi, (word) => matchDraftCase(word, "because")],
      [/\bteh\b/gi, (word) => matchDraftCase(word, "the")],
      [/\bdefinately\b/gi, (word) => matchDraftCase(word, "definitely")],
      [/\balot\b/gi, () => "a lot"],
    ];
    const original = editor.textContent;
    let count = 0;
    const corrected = corrections.reduce((text, [pattern, replacement]) =>
      text.replace(pattern, (word) => { count++; return replacement(word); }), original);
    if (!count) {
      announce("No example spelling issues found.");
      return;
    }
    if (!editor.dataset.original) editor.dataset.original = original;
    editor.textContent = corrected;
    editor.classList.add("proofread");
    editor.setAttribute("aria-label", `Example draft after ${count} spelling corrections`);
    let undo = pageArea.querySelector('[data-action="undo-proofread"]');
    if (!undo) {
      undo = document.createElement("button");
      undo.className = "action-button";
      undo.dataset.action = "undo-proofread";
      undo.textContent = "Undo proofread";
      undo.addEventListener("click", () => {
        editor.textContent = editor.dataset.original;
        editor.classList.remove("proofread");
        editor.removeAttribute("aria-label");
        undo.remove();
        logActivity("Draft proofreading undone", "The example draft was restored.");
        announce("Draft restored to its original text.");
      });
      pageArea.querySelector(".action-row").insertBefore(undo, pageArea.querySelector('[data-action="save"]'));
    }
    logActivity("Draft proofread", `${count} spelling suggestions corrected in one pass.`);
    announce(`One pass complete: ${count} spelling suggestions corrected.`);
    animate("say", `${count} quick fixes. You can undo them.`, editor);
  }

  function matchDraftCase(source, replacement) {
    if (source === source.toUpperCase()) return replacement.toUpperCase();
    if (source[0] === source[0].toUpperCase()) return replacement[0].toUpperCase() + replacement.slice(1);
    return replacement;
  }

  function toggleOriginal(paragraph, button) {
    const showingSimplified = paragraph.dataset.simplified === "true";
    paragraph.textContent = showingSimplified ? paragraph.dataset.original : pages[activeSite].simplified;
    paragraph.dataset.simplified = String(!showingSimplified);
    paragraph.classList.toggle("simplified", !showingSimplified);
    button.textContent = showingSimplified ? "Show simpler version" : "Show original";
  }

  function saveNote() {
    const page = pages[activeSite];
    const paragraph = activeParagraph();
    const text = paragraph?.textContent || page.simplified;
    const note = document.createElement("article");
    note.className = "saved-note";
    const content = document.createElement("p");
    content.textContent = text.length > 155 ? `${text.slice(0, 152)}…` : text;
    const source = document.createElement("a");
    source.href = page.external;
    source.target = "_blank";
    source.rel = "noopener noreferrer";
    source.className = "note-source";
    source.textContent = `${page.tab} · ${page.address}`;
    note.append(content, source);
    noteList.replaceChildren(note);
    noteCount.textContent = "1";
    announce("Saved with its source link in your notes.");
    animate("carry", "Keeping this with its source.");
  }

  function welcomeBack() {
    announce("Welcome back. You were looking at this study task.");
    animate("wave", "Welcome back!");
  }

  function logActivity(title, text) {
    const list = document.querySelector("#activity-list");
    const item = document.createElement("li");
    item.className = "activity-item";
    const strong = document.createElement("strong");
    strong.textContent = title;
    const detail = document.createElement("span");
    detail.textContent = text;
    item.append(strong, detail);
    list.querySelector(".activity-empty")?.remove();
    list.prepend(item);
    while (list.children.length > 5) list.lastElementChild.remove();
    document.querySelector("#activity-count").textContent = String(list.children.length);
  }

  function toggleFocus() {
    focusActive = !focusActive;
    clearInterval(focusTimer);
    if (focusActive) focusEndsAt = Date.now() + 25 * 60 * 1000;
    renderPage(activeSite);
    announce(focusActive
      ? "Focus session started. No websites are blocked."
      : "Focus session ended. Your tabs are unchanged.");
    animate(focusActive ? "read" : "idle");
    if (focusActive) {
      focusTimer = setInterval(() => {
        if (Date.now() >= focusEndsAt) {
          focusActive = false;
          clearInterval(focusTimer);
          renderPage(activeSite);
          announce("Your focus block is complete. Take a moment before the next task.");
          animate("wave", "Nice work!");
          return;
        }
        updateFocusCard();
      }, 1000);
    }
  }

  function updateFocusCard() {
    const label = pageArea.querySelector(".focus-copy small");
    if (!label) return;
    const remaining = Math.max(0, Math.ceil((focusEndsAt - Date.now()) / 1000));
    const minutes = String(Math.floor(remaining / 60)).padStart(2, "0");
    const seconds = String(remaining % 60).padStart(2, "0");
    label.textContent = `${minutes}:${seconds} · no sites blocked`;
  }

  document.querySelectorAll(".browser-tab").forEach((tab) => {
    tab.addEventListener("click", () => renderPage(tab.dataset.site, { animateChange: tab.dataset.site !== activeSite }));
  });
  document.querySelectorAll(".workspace-card").forEach((card) => {
    card.addEventListener("click", () => {
      const site = card.dataset.workspace === "coursework" ? "qmplus" : "pubmed";
      renderPage(site, { animateChange: site !== activeSite });
    });
  });
  document.querySelector("#showcase-button").addEventListener("click", runShowcase);
  renderPage(activeSite);

  let showcaseRunning = false;
  let stopCurrentDelay;
  function waitForShowcase(ms) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        stopCurrentDelay = null;
        resolve();
      }, ms);
      stopCurrentDelay = () => {
        clearTimeout(timer);
        stopCurrentDelay = null;
        resolve();
      };
    });
  }

  document.querySelector("#stop-showcase").addEventListener("click", () => {
    if (!showcaseRunning) return;
    showcaseRunning = false;
    stopCurrentDelay?.();
  });

  async function runShowcase() {
    if (showcaseRunning) return;
    showcaseRunning = true;
    const button = document.querySelector("#showcase-button");
    const stopButton = document.querySelector("#stop-showcase");
    const caption = document.querySelector("#showcase-caption");
    button.disabled = true;
    stopButton.hidden = false;
    button.textContent = "Showcase playing…";
    try {
      caption.textContent = "1/4 · Stick keeps research and coursework in separate, reversible workspaces.";
      renderPage("qmplus", { animateChange: true });
      logActivity("Coursework workspace", "QMplus example grouped with lecture notes. Tabs stay open.");
      animate("walk", "This way for coursework.");
      await waitForShowcase(2100);
      if (!showcaseRunning) return;

      caption.textContent = "2/4 · Re-reading and long dwell can suggest someone may want help. They don’t prove how a person feels.";
      renderPage("pubmed", { animateChange: true });
      logActivity("Reading support offered", "A possible reading snag: Stick offers help rather than changing the page.");
      animate("tap", "Want me to unpack this?");
      await waitForShowcase(1800);
      if (!showcaseRunning) return;
      pageArea.querySelector('[data-action="simplify"]')?.click();
      await waitForShowcase(1400);
      if (!showcaseRunning) return;

      caption.textContent = "3/4 · A saved passage stays in the sidebar with a source link.";
      saveNote();
      logActivity("Source-linked note saved", "The passage and its PubMed source are together.");
      await waitForShowcase(1500);
      if (!showcaseRunning) return;

      caption.textContent = "4/4 · One user-triggered proofreading pass checks the whole supported draft; every change can be undone.";
      renderPage("draft", { animateChange: true });
      await waitForShowcase(900);
      if (!showcaseRunning) return;
      pageArea.querySelector('[data-action="proofread"]')?.click();
      await waitForShowcase(2200);
      if (!showcaseRunning) return;
      caption.textContent = "Showcase complete · simulated pages and interactions. Open real sites only with their links.";
      animate("wave", "A little less chaos.");
    } finally {
      showcaseRunning = false;
      button.disabled = false;
      stopButton.hidden = true;
      if (!caption.textContent.includes("Showcase complete")) caption.textContent = "Showcase stopped · replay when you’re ready.";
      button.innerHTML = '<span aria-hidden="true">↻</span> Replay showcase';
    }
  }
})();
