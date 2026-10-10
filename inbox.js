(() => {
  const MAX = 100;
  let queue = Promise.resolve(); // handle one message at a time so writes can't overlap

  function recordActivity(item) {
    queue = queue.then(async () => {
      const { stickSidebar } = await browser.storage.local.get("stickSidebar");
      const data = stickSidebar || { summaries: [], notes: [], activity: [] };
      const activity = data.activity ||= [];
      if (activity.some((entry) => entry.title === item.title && entry.text === item.text && entry.ts === item.ts)) return;
      activity.unshift({ id: crypto.randomUUID(), ...item });
      activity.length = Math.min(activity.length, MAX);
      await browser.storage.local.set({ stickSidebar: data });
    }).catch((err) => console.error("[stick/inbox] activity save failed:", err));
    return queue;
  }

  globalThis.StickInbox = { recordActivity };

  browser.runtime.onMessage.addListener((msg) => {
    if (msg?.type !== "inbox" || !["note", "summary", "activity"].includes(msg.kind)) return;
    if (msg.kind === "activity") return recordActivity(msg.item);
    queue = queue.then(async () => {
      const { stickSidebar } = await browser.storage.local.get("stickSidebar");
      const data = stickSidebar || { summaries: [], notes: [], activity: [] };
      const list = msg.kind === "note" ? (data.notes ||= []) : (data.summaries ||= []);
      if (list.some((x) => x.text === msg.item.text && x.url === msg.item.url)) return; // no duplicates
      list.unshift({ id: crypto.randomUUID(), ...msg.item });
      list.length = Math.min(list.length, MAX);
      const activity = data.activity ||= [];
      activity.unshift({
        id: crypto.randomUUID(),
        title: msg.kind === "note" ? "Passage saved to Notes" : "Summary saved",
        text: msg.item.title || new URL(msg.item.url).hostname,
        url: msg.item.url,
        ts: msg.item.ts || Date.now(),
      });
      activity.length = Math.min(activity.length, MAX);
      await browser.storage.local.set({ stickSidebar: data });
    }).catch((err) => console.error("[stick/inbox]", err));
  });
})();
