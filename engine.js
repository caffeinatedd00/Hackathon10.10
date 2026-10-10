(() => {
  const api = browser;
  const STOP = new Set([
    "about", "after", "also", "from", "have", "into", "more", "page", "that", "this",
    "with", "your", "www", "the", "and", "for", "you", "are", "was",
  ]);
  const state = { task: null, focus: "idle", reading: "ok" };
  const nameCache = new Map();
  let groups = [];
  let activeTabId = null;
  let activeSince = Date.now();
  let awaySince = null;
  let switches = [];
  let rebuildTimer;
  let rebuildVersion = 0;
  let lastGroupSignature = null;
  let lastLoggedFocus = "idle";

  function logActivity(title, text) {
    if (!globalThis.StickInbox?.recordActivity) return;
    globalThis.StickInbox.recordActivity({ title, text, ts: Date.now() })
      .catch((error) => console.error("[stick/engine] activity log failed:", error));
  }

  function pageTab(tab) {
    return tab.url && /^https?:/i.test(tab.url);
  }

  function tokens(tab) {
    const host = new URL(tab.url).hostname.replace(/^www\./, "").toLowerCase();
    const words = `${tab.title || ""} ${host}`
      .toLowerCase()
      .match(/[a-z0-9]{3,}/g) || [];
    return { host, words: new Set(words.filter((word) => !STOP.has(word))) };
  }

  function similarity(a, b) {
    if (a.host === b.host) return 1;
    let shared = 0;
    for (const word of a.words) if (b.words.has(word)) shared++;
    const union = a.words.size + b.words.size - shared;
    return union ? shared / union : 0;
  }

  function fallbackName(tabs) {
    try {
      return new URL(tabs[0].url).hostname.replace(/^www\./, "");
    } catch {
      return tabs[0].title || "Research";
    }
  }

  async function groupName(tabs) {
    const titles = tabs.map((tab) => tab.title || new URL(tab.url).hostname);
    const key = [...titles].sort().join("|");
    if (nameCache.has(key)) return nameCache.get(key);
    let name = fallbackName(tabs);
    if (globalThis.StickAI?.nameGroup) {
      try {
        name = await globalThis.StickAI.nameGroup(titles) || name;
      } catch (error) {
        console.warn("[stick/engine] group naming failed:", error);
      }
    }
    nameCache.set(key, name);
    return name;
  }

  async function rebuildGroups() {
    const version = ++rebuildVersion;
    const tabs = (await api.tabs.query({}))
      .filter(pageTab)
      .sort((a, b) => Number(b.active) - Number(a.active));
    const clusters = [];

    for (const tab of tabs) {
      const features = tokens(tab);
      let best = null;
      let bestScore = 0;
      for (const cluster of clusters) {
        const score = Math.max(...cluster.features.map((item) => similarity(features, item)));
        if (score > bestScore) {
          best = cluster;
          bestScore = score;
        }
      }
      if (!best || (bestScore < 0.22 && bestScore !== 1)) {
        best = { tabs: [], features: [] };
        clusters.push(best);
      }
      best.tabs.push(tab);
      best.features.push(features);
    }

    const named = await Promise.all(clusters.map(async (cluster, index) => ({
      id: `task-${Math.min(...cluster.tabs.map((tab) => tab.id))}`,
      name: await groupName(cluster.tabs),
      color: ["blue", "purple", "green", "orange", "pink"][index % 5],
      tabs: cluster.tabs.map((tab) => ({
        id: tab.id,
        title: tab.title,
        url: tab.url,
        favIconUrl: tab.favIconUrl,
        sleeping: Boolean(tab.discarded),
      })),
    })));
    if (version !== rebuildVersion) return;

    groups = named;
    const signature = groups.map((group) =>
      `${group.name}:${group.tabs.map((tab) => tab.id).sort((a, b) => a - b).join(",")}`).join("|");
    if (lastGroupSignature !== null && signature !== lastGroupSignature) {
      const overview = groups.map((group) => `${group.name} (${group.tabs.length})`).join(" · ");
      logActivity("Tabs regrouped", overview || "No web tabs are open.");
    }
    lastGroupSignature = signature;
    const activeGroup = groups.find((group) => group.tabs.some((tab) => tab.id === activeTabId));
    state.task = activeGroup?.name || null;
    await api.runtime.sendMessage({ type: "groups", groups }).catch(() => {});
    await publishState();
  }

  function scheduleRebuild() {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => {
      rebuildGroups().catch((error) => console.error("[stick/engine] tab grouping failed:", error));
    }, 350);
  }

  async function sendActive(message) {
    if (activeTabId == null) return;
    try {
      await api.tabs.sendMessage(activeTabId, message);
    } catch {
      // Tabs such as about: pages do not accept content-script messages.
    }
  }

  async function publishState() {
    const now = Date.now();
    switches = switches.filter((timestamp) => now - timestamp < 60_000);
    if (switches.length >= 8) state.focus = "drift";
    else if (now - activeSince >= 90_000) state.focus = "flow";
    else state.focus = "idle";
    if (state.focus !== lastLoggedFocus) {
      if (state.focus !== "idle") logActivity("Focus signal", `Stick noticed a possible ${state.focus === "flow" ? "focus stretch" : "rapid tab switching"}.`);
      lastLoggedFocus = state.focus;
    }

    const snapshot = { task: state.task, focus: state.focus, reading: state.reading };
    await api.runtime.sendMessage(snapshot).catch(() => {});
    await sendActive({ type: "STATE", state: snapshot });
  }

  async function activate(tabId) {
    const now = Date.now();
    if (activeTabId != null && activeTabId !== tabId) switches.push(now);
    activeTabId = tabId;
    activeSince = now;
    state.reading = "ok";
    try {
      const tab = await api.tabs.get(tabId);
      const group = groups.find((item) => item.tabs.some((entry) => entry.id === tabId));
      state.task = group?.name || (pageTab(tab) ? tab.title : null);
    } catch (error) {
      console.warn("[stick/engine] active tab lookup failed:", error);
    }
    await publishState();
  }

  async function welcomeBack() {
    try {
      const sleeping = groups.reduce((count, group) =>
        count + group.tabs.filter((tab) => tab.sleeping).length, 0);
      const text = await globalThis.StickAI.briefing({
        task: state.task,
        sleeping,
        lastSection: "",
      });
      await sendActive({ type: "STICK_ACTION", cmd: { action: "wave", text } });
    } catch (error) {
      console.warn("[stick/engine] welcome-back briefing failed:", error);
    }
  }

  api.tabs.onActivated.addListener(({ tabId }) => {
    activate(tabId).catch((error) => console.error("[stick/engine] activation failed:", error));
    scheduleRebuild();
  });
  api.tabs.onCreated.addListener(scheduleRebuild);
  api.tabs.onRemoved.addListener(scheduleRebuild);
  api.tabs.onUpdated.addListener((tabId, change) => {
    if (change.status === "complete" || change.title || change.url || change.discarded != null) {
      scheduleRebuild();
    }
    if (tabId === activeTabId && change.status === "complete") publishState();
  });

  api.runtime.onMessage.addListener((message, sender) => {
    if (message?.type === "engine:getSnapshot") {
      return { task: state.task, focus: state.focus, reading: state.reading, groups };
    }
    if (message?.type === "engine:context") {
      return {
        task: state.task,
        sleeping: groups.reduce((count, group) =>
          count + group.tabs.filter((tab) => tab.sleeping).length, 0),
      };
    }
    if (message?.reading === "confused" || message?.reading === "ok") {
      if (sender.tab?.id === activeTabId) {
        state.reading = message.reading;
        publishState();
      }
    }
  });

  if (api.idle) {
    api.idle.setDetectionInterval(60);
    api.idle.onStateChanged.addListener((status) => {
      if (status === "idle" || status === "locked") {
        awaySince = Date.now();
        return;
      }
      if (status === "active" && awaySince && Date.now() - awaySince >= 60_000) {
        awaySince = null;
        welcomeBack();
      }
    });
  }

  setInterval(() => {
    publishState().catch((error) => console.error("[stick/engine] state update failed:", error));
  }, 15_000);
  api.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
    if (tabs[0]) activeTabId = tabs[0].id;
    return rebuildGroups();
  }).catch((error) => console.error("[stick/engine] startup failed:", error));
})();
