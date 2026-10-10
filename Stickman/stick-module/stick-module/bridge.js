/*
 * bridge.js — glue between the extension's messages and Stick. Load AFTER stick.js (same content_scripts entry).
 *
 * Dev A (background script) drives Stick in a tab with:
 *     browser.tabs.sendMessage(tabId, { type: 'STICK_ACTION', cmd: { action: 'tap', text: 'Back to it?' } })
 *     browser.tabs.sendMessage(tabId, { type: 'STATE', state: { task, focus: 'flow'|'drift'|'stuck', reading: 'ok'|'confused' } })
 *   (an Element cannot travel in a message, so over messages `target` must be a CSS selector string or {x,y,width,height})
 *
 * Dev B (content script in the same world) skips messages and calls  stick.perform({...})  directly with real Elements/Ranges.
 *
 * Reaction rules live in StickBridge.config: edit them (or set a rule to null to switch it off).
 */
(function (global) {
  'use strict';
  var stick = global.stick;
  if (!stick) { console.warn('[stick-bridge] load stick.js first'); return; }
  stick.perform({ action: 'idle' }).catch(function (e) {
    console.warn('[stick-bridge] initial idle failed:', e.message);
  });

  var cfg = {
    flow:  { action: 'read' },                                   // sit down while you're in flow
    drift: { action: 'tap', text: 'Back to it?', cooldownMs: 60000 },
    stuck: { action: 'shrug', text: 'Stuck? Take a breath.', cooldownMs: 90000 },
    clear: { action: 'idle' }                                    // when flow/drift/stuck end
  };
  var last = { focus: null, at: {} };

  function cooled(key, ms) {
    var now = Date.now();
    if (ms && last.at[key] && now - last.at[key] < ms) return false;
    last.at[key] = now; return true;
  }

  function onState(s) {
    if (!s) return;
    var focus = s.focus && s.focus !== 'ok' ? s.focus : null;
    if (focus === last.focus) return;
    var prev = last.focus; last.focus = focus;
    var rule = focus ? cfg[focus] : (prev === 'flow' ? cfg.clear : null);
    if (!rule) return;
    if (!cooled(focus || 'clear', rule.cooldownMs)) return;
    stick.perform({ action: rule.action, text: rule.text }).catch(function (e) { console.warn('[stick-bridge]', e.message); });
  }

  // messages from the background script (Firefox: `browser`, Chrome-style: `chrome`)
  var rt = (global.browser && global.browser.runtime) || (global.chrome && global.chrome.runtime);
  if (rt && rt.onMessage) {
    rt.onMessage.addListener(function (msg) {
      if (!msg || !msg.type) return;
      if (msg.type === 'STICK_ACTION' && msg.cmd) return stick.perform(msg.cmd).then(function (r) { return r; }, function (e) { return { error: e.message }; });
      if (msg.type === 'STATE') { onState(msg.state || msg); return Promise.resolve({ ok: true }); }
    });
  }

  // page-level hook for quick tests from the console:
  //   window.dispatchEvent(new CustomEvent('stick:perform', { detail: { action: 'wave', text: 'hi' } }))
  global.addEventListener('stick:perform', function (e) { stick.perform(e.detail); });

  global.StickBridge = { config: cfg, onState: onState };
})(typeof window !== 'undefined' ? window : this);
