// Same API as the background's StickAI, but over messaging. Every function returns a Promise<string>.
(() => {
  const call = (fn, ...args) => browser.runtime.sendMessage({ type: "ai", fn, args });
  globalThis.StickAI = {
    nameGroup: (titles) => call("nameGroup", titles),
    simplify: (text) => call("simplify", text),
    summarise: (text) => call("summarise", text),
    briefing: (ctx) => call("briefing", ctx),
  };
})();