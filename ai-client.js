// Same API as the background's StickAI, over messaging. Every function returns a Promise.
(() => {
  const call = (fn, ...args) => browser.runtime.sendMessage({ type: "ai", fn, args });
  globalThis.StickAI = {
    nameGroup: (titles) => call("nameGroup", titles),
    simplify: (text, level) => call("simplify", text, level),
    summarise: (text) => call("summarise", text),
    briefing: (ctx) => call("briefing", ctx),
    define: (term, context) => call("define", term, context),
    checkText: (text) => call("checkText", text),
    quip: (state) => call("quip", state),
    latency: () => call("latency"),
  };
})();