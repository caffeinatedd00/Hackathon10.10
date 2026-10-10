(() => {
  const MAX = 100;
  let queue = Promise.resolve(); // handle one message at a time so writes can't overlap

  browser.runtime.onMessage.addListener((msg) => {
    if (msg?.type !== "inbox" || !["note", "summary"].includes(msg.kind)) return;
    queue = queue.then(async () => {
      const { stickSidebar } = await browser.storage.local.get("stickSidebar");
      const data = stickSidebar || { summaries: [], notes: [] };
      const list = msg.kind === "note" ? (data.notes ||= []) : (data.summaries ||= []);
      if (list.some((x) => x.text === msg.item.text && x.url === msg.item.url)) return; // no duplicates
      list.unshift({ id: crypto.randomUUID(), ...msg.item });
      list.length = Math.min(list.length, MAX);
      await browser.storage.local.set({ stickSidebar: data });
    }).catch((err) => console.error("[stick/inbox]", err));
  });
})();
