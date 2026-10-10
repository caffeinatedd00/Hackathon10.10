(() => {
  if (window.__stickLoaded) return;
  window.__stickLoaded = true;

  const api = typeof browser !== "undefined" ? browser : chrome;
  const DEV = true; // Alt+Shift+1..7 triggers animations without the backend
  const HOLD = { walk: 3000, carry: 3000, tap: 2500, magnify: 4000, wave: 2500 }; // "read" stays until changed
  const ACTIONS = ["idle", "walk", "carry", "read", "tap", "magnify", "wave"];

  const host = document.createElement("div");
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
  <style>
    :host { all: initial; }
    #wrap { position: fixed; right: 24px; bottom: 16px; width: 90px;
            z-index: 2147483647; pointer-events: none; font-family: system-ui, sans-serif; }
    svg { width: 90px; height: auto; overflow: visible; }
    .limb { stroke: #111; stroke-width: 4; stroke-linecap: round; fill: none; }
    .head { fill: #fff; stroke: #111; stroke-width: 4; }

    #armL, #armR { transform-origin: 50px 40px; }
    #legL, #legR { transform-origin: 50px 75px; }
    #head { transform-origin: 50px 30px; }

    .box, .book, .magnifier { display: none; }
    .carry .box { display: block; fill: #c8a165; stroke: #111; stroke-width: 2; }
    .read .book { display: block; fill: #e8f0ff; stroke: #111; stroke-width: 2; }
    .magnify .magnifier { display: block; }
    .lens { fill: rgba(180, 220, 255, .5); stroke: #111; stroke-width: 3; }

    @keyframes bob   { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-2px) } }
    @keyframes swingA{ 0%,100% { transform: rotate(-28deg) } 50% { transform: rotate(28deg) } }
    @keyframes swingB{ 0%,100% { transform: rotate(28deg) } 50% { transform: rotate(-28deg) } }
    @keyframes tap   { 0%,100% { transform: rotate(-95deg) } 50% { transform: rotate(-70deg) } }
    @keyframes look  { 0%,100% { transform: rotate(-105deg) } 50% { transform: rotate(-85deg) } }
    @keyframes wave  { 0%,100% { transform: rotate(-135deg) } 50% { transform: rotate(-165deg) } }

    #all { animation: bob 2.4s ease-in-out infinite; }

    .walk #legL, .carry #legL { animation: swingA .5s ease-in-out infinite; }
    .walk #legR, .carry #legR { animation: swingB .5s ease-in-out infinite; }
    .walk #armL { animation: swingB .5s ease-in-out infinite; }
    .walk #armR { animation: swingA .5s ease-in-out infinite; }

    .carry #armL, .read #armL { transform: rotate(-50deg); }
    .carry #armR, .read #armR { transform: rotate(50deg); }
    .read #head { transform: rotate(12deg); }

    .tap #armR     { animation: tap .35s ease-in-out infinite; }
    .magnify #armR { animation: look 1s ease-in-out infinite; }
    .wave #armR    { animation: wave .5s ease-in-out infinite; }

    #bubble { position: absolute; right: 80px; bottom: 90px; width: max-content; max-width: 220px;
              background: #fff; color: #111; border: 2px solid #111; border-radius: 10px;
              padding: 6px 10px; font-size: 13px; opacity: 0; transition: opacity .2s; }
    #bubble.show { opacity: 1; }
  </style>

  <div id="wrap" class="idle">
    <div id="bubble"></div>
    <svg viewBox="0 0 100 130">
      <g id="all">
        <g id="head">
          <circle class="head" cx="50" cy="20" r="10"/>
          <circle cx="46" cy="18" r="1.4" fill="#111"/><circle cx="54" cy="18" r="1.4" fill="#111"/>
        </g>
        <line class="limb" x1="50" y1="30" x2="50" y2="75"/>
        <g id="legL"><line class="limb" x1="50" y1="75" x2="38" y2="110"/></g>
        <g id="legR"><line class="limb" x1="50" y1="75" x2="62" y2="110"/></g>
        <g id="armL"><line class="limb" x1="50" y1="40" x2="34" y2="62"/></g>
        <g id="armR">
          <line class="limb" x1="50" y1="40" x2="66" y2="62"/>
          <g class="magnifier">
            <line class="limb" x1="66" y1="62" x2="70" y2="67"/>
            <circle class="lens" cx="74" cy="72" r="8"/>
          </g>
        </g>
        <rect class="box" x="40" y="56" width="20" height="14" rx="2"/>
        <g class="book"><rect x="41" y="57" width="18" height="12"/><line x1="50" y1="57" x2="50" y2="69" stroke="#111" stroke-width="2"/></g>
      </g>
    </svg>
  </div>`;
  document.documentElement.appendChild(host);

  const wrap = root.getElementById("wrap");
  const bubble = root.getElementById("bubble");
  let idleTimer, bubbleTimer;

  function setStick(action = "idle", text) {
    if (!ACTIONS.includes(action)) action = "idle";
    clearTimeout(idleTimer);
    wrap.className = action;
    if (text) {
      bubble.textContent = text;
      bubble.classList.add("show");
      clearTimeout(bubbleTimer);
      bubbleTimer = setTimeout(() => bubble.classList.remove("show"), 5000);
    }
    if (HOLD[action]) idleTimer = setTimeout(() => setStick("idle"), HOLD[action]);
  }

  // State message from the engine: { task, focus, reading }
  function applyState({ focus, reading }) {
    if (reading === "confused") return setStick("magnify");
    if (focus === "flow") return setStick("read");
    if (focus === "drift") return setStick("tap");
    setStick("idle");
  }
  function setStick(action = "idle", text)
  {
    let atHome = true;
  function crossScreen(ms) {
    const dist = Math.min(innerWidth - 160, 520);
    wrap.style.transition = `transform ${ms}ms linear`;
    wrap.style.transform = atHome ? `translateX(${-dist}px)` : "translateX(0)";
    atHome = !atHome;
  }

  function setStick(action = "idle", text) {
    if (!ACTIONS.includes(action)) action = "idle";
    clearTimeout(idleTimer);
    wrap.className = action;
    if (action === "walk" || action === "carry") crossScreen(HOLD[action]);
    if (text) {
      bubble.textContent = text;
      bubble.classList.add("show");
      clearTimeout(bubbleTimer);
      bubbleTimer = setTimeout(() => bubble.classList.remove("show"), Math.max(4000, text.length * 70));
    }
    if (HOLD[action]) idleTimer = setTimeout(() => setStick("idle"), HOLD[action]);
  }
  globalThis.StickOverlay = { set: setStick };
  }
  api.runtime.onMessage.addListener((msg) => {
    if (msg?.action) setStick(msg.action, msg.text);
    else if (msg?.focus || msg?.reading) applyState(msg);
  });

  if (DEV) {
    addEventListener("keydown", (e) => {
      if (!(e.altKey && e.shiftKey)) return;
      const i = Number(e.code.replace("Digit", "")) - 1;
      if (ACTIONS[i]) setStick(ACTIONS[i], ACTIONS[i] === "wave" ? "Welcome back! You were mid-way through the paper." : undefined);
    });
  }
})();
