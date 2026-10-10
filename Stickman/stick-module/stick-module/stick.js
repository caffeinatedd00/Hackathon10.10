/*!
 * STICK — "Stick", the character module (pixel-art sprite-strip edition).
 * Zero dependencies. Load stick.config.js first, then this file.
 *
 *   await stick.perform({ action, target, text, opts })      // the Actor API from CONTRACT.md
 *
 *   action : idle | walk | run | punch | correct | magnify | tap | sleep      (the contract)
 *            + extras: erase | highlight | carry | read | wave | cheer | shrug | yawn | lookAround | say
 *   target : Element | Range | "css selector" | {x, y, width?, height?}   (viewport px)
 *   text   : replacement word (punch/correct/erase), speech-bubble text (say/tap/wave), note text (carry)
 *
 * punch  + text  -> red fire burns the wrong word, green fire writes the right one (all in one call)
 * punch (no text)-> red fire burns the word away (a Range is deleted; an Element flashes and returns)
 * correct + text -> green fire writes `text` into the target (replace, or insert into a collapsed Range)
 *
 * Extending without touching this file:
 *   stick.defineAction('name', async (cmd, h) => { ... })     // h = helpers (walk, play, say, rect, ...)
 */
(function (global) {
  'use strict';

  var CANCEL = { cancelled: true };

  // ---------------------------------------------------------------- defaults (stick.config.js overrides)
  var DEFAULTS = {
    container: null,           // null = full-page overlay. Pass an element to embed Stick in a panel/sidebar.
    assetBase: 'assets/', fallbackBase: 'assets-placeholder/',
    facesRight: true, scale: 0, targetHeight: 220, anchor: { x: 0.5, y: 0.92 },
    speed: 1,                  // global time multiplier (2 = twice as fast: handy for the demo video)
    walkSpeed: 150, runSpeed: 430, maxWalkMs: 2400, useTurns: true,
    autoContrast: true,
    greenFilter: 'hue-rotate(110deg) saturate(1.5)',
    halo: true,                // crisp white outline so a black Stick shows on dark pages
    zIndex: 2147483647, home: 'bottom-right', homeMargin: 70,
    entrance: true, quirks: true, idleHomeMs: 2600, noteMs: 6500,
    fontFamily: '"Comic Sans MS","Chalkboard SE","Segoe Print","Bradley Hand",cursive',
    ink: '#161616', accent: '#ff5a36',
    pow: ['POW!', 'BAM!', 'WHAP!', 'BONK!'],
    strips: {
      idle: { file: 'idle_strip8.png', fps: 8, loop: true, anchor: { x: 0.512, y: 0.604 } },
      walk: { file: 'walk_strip8.png', fps: 12, loop: true, anchor: { x: 0.508, y: 0.628 } },
      dash: { file: 'dash_strip12.png', fps: 18, loop: true, anchor: { x: 0.492, y: 0.612 } },
      dashstart: { file: 'dashstart_strip3.png', fps: 14, optional: true, anchor: { x: 0.512, y: 0.616 } },
      dashstop: { file: 'dashstop_strip2.png', fps: 10, optional: true },
      walkturn: { file: 'walkturn_strip2.png', fps: 10, optional: true, anchor: { x: 0.504, y: 0.62 } },
      dashturn: { file: 'dashturn_strip2.png', fps: 10, optional: true },
      jabFire: { file: 'jab_fire_strip20.png', fps: 24, impact: 13, hit: { x: 0.727, y: 0.464 }, anchor: { x: 0.512, y: 0.616 }, overlay: 'jabFireEffect' },
      jabFireEffect: { file: 'jab_fire_draw_strip20.png', fps: 24, optional: true },
      jabFire2: { file: 'jab_fire_strip20.png', fps: 24, impact: 10, hit: { x: 0.82, y: 0.32 }, optional: true },
      jab: { file: 'jab_strip24.png', fps: 28, impact: 12, hit: { x: 0.82, y: 0.32 } },
      jabDraw: { file: 'jab_draw_strip24.png', fps: 28, impact: 12, hit: { x: 0.82, y: 0.32 }, optional: true },
      crouch: { file: 'crouch_strip12.png', fps: 14, focus: { x: 0.8, y: 0.62 }, anchor: { x: 0.508, y: 0.608 } },
      taunt: { file: 'dtaunt_strip16.png', fps: 14, focus: { x: 0.78, y: 0.35 } },
      ftilt: { file: 'ftilt_strip7.png', fps: 14, focus: { x: 0.85, y: 0.45 }, optional: true, anchor: { x: 0.57, y: 0.628 } },
      pratfall: { file: 'pratfall_strip1.png', fps: 1, loop: true, anchor: { x: 0.516, y: 0.671 } }
    },
    actionStrips: { punch: 'jabFire', correct: 'jabFire', erase: 'jab', magnify: 'crouch', tap: 'taunt', highlight: 'ftilt',
                    wave: 'taunt', cheer: 'taunt', sleep: 'pratfall', read: 'crouch' }
  };
  // if a strip is missing, try these before giving up
  var FALLBACK = { dash: 'walk', dashstart: 'dash', dashstop: 'idle', walkturn: 'idle', dashturn: 'idle', jabFire: 'jab', jabFire2: 'jabFire',
                   jab: 'jabFire', jabDraw: 'jab', crouch: 'idle', taunt: 'idle', ftilt: 'jab', pratfall: 'idle', walk: 'idle' };

  function assign(t) {
    for (var i = 1; i < arguments.length; i++) { var s = arguments[i]; if (s) for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) t[k] = s[k]; }
    return t;
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function n2(v) { return (Math.round(v * 100) / 100).toString(); }

  function mergeConfig(user) {
    var ext = global.STICK_CONFIG || {};
    var cfg = assign({}, DEFAULTS, ext, user);
    var strips = {};
    var names = {};
    [DEFAULTS.strips, ext.strips, user && user.strips].forEach(function (src) { if (src) Object.keys(src).forEach(function (k) { names[k] = 1; }); });
    Object.keys(names).forEach(function (k) { strips[k] = assign({}, DEFAULTS.strips[k], ext.strips && ext.strips[k], user && user.strips && user.strips[k]); });
    cfg.strips = strips;
    cfg.actionStrips = assign({}, DEFAULTS.actionStrips, ext.actionStrips, user && user.actionStrips);
    cfg.anchor = assign({}, DEFAULTS.anchor, ext.anchor, user && user.anchor);
    return cfg;
  }

  // ---------------------------------------------------------------- the actor
  function createActor(userCfg) {
    var cfg = mergeConfig(userCfg);
    var st = {
      inited: false, ready: false, x: -300, y: 0, facing: 1, scale: 1,
      strip: null, cur: null, move: null, timers: [], clock: 0, last: 0, frameIdx: 0,
      posture: 'stand', epoch: 0, busy: 0, lastActivity: 0, filter: '', lastRun: false
    };
    var strips = {};                 // name -> {def, img, src, frames, fw, fh, missing}
    var host, shadow, stage, fx, actorEl, bodyEl, sprite, fireSprite, bubble, zzz, tray, cardEl, bookEl;
    var queue = Promise.resolve();
    var notes = [], customActions = {};
    var homeTimer = null, quirkTimer = null, hiddenTimer = null, raf = 0, bubbleTimer = null;
    var readyPromise = null, lastDrawn = null, contrastCheckAt = 0;

    // ------------------------------------------------ coordinates (stage-local px)
    function origin() { if (!cfg.container) return { left: 0, top: 0 }; var r = cfg.container.getBoundingClientRect(); return { left: r.left, top: r.top }; }
    function viewSize() {
      if (cfg.container) return { w: cfg.container.clientWidth, h: cfg.container.clientHeight };
      var de = document.documentElement; return { w: de.clientWidth || global.innerWidth, h: global.innerHeight || de.clientHeight };
    }
    function toRect(r) {
      var o = origin(), left = r.left - o.left, top = r.top - o.top, w = r.width, h = r.height;
      return { left: left, top: top, right: left + w, bottom: top + h, width: w, height: h, cx: left + w / 2, cy: top + h / 2 };
    }
    function resolveTarget(t) { if (typeof t === 'string') t = document.querySelector(t); return t || null; }
    function isRange(t) { return typeof Range !== 'undefined' && t instanceof Range; }
    function locate(t) {
      t = resolveTarget(t); if (!t) return null;
      if (isRange(t)) { var rs = t.getClientRects(); return toRect(rs && rs.length ? rs[0] : t.getBoundingClientRect()); }
      if (t.getBoundingClientRect) return toRect(t.getBoundingClientRect());
      if (typeof t.x === 'number') return toRect({ left: t.x, top: t.y, width: t.width || 0, height: t.height || 0 });
      return null;
    }
    function lineRects(t) {
      t = resolveTarget(t);
      var range = null;
      if (isRange(t)) range = t; else if (t && t.nodeType === 1) { range = document.createRange(); range.selectNodeContents(t); }
      var out = [];
      if (range) { var rs = range.getClientRects(); for (var i = 0; i < rs.length; i++) if (rs[i].width > 1 && rs[i].height > 1) out.push(toRect(rs[i])); }
      if (!out.length) { var r = locate(t); if (r) out.push(r); }
      out.sort(function (a, b) { return a.cy - b.cy || a.left - b.left; });
      var merged = [];
      out.forEach(function (r) {
        var m = merged[merged.length - 1];
        if (m && Math.abs(m.cy - r.cy) < Math.max(4, m.height * 0.4)) {
          m.left = Math.min(m.left, r.left); m.right = Math.max(m.right, r.right); m.top = Math.min(m.top, r.top); m.bottom = Math.max(m.bottom, r.bottom);
          m.width = m.right - m.left; m.height = m.bottom - m.top; m.cx = m.left + m.width / 2; m.cy = m.top + m.height / 2;
        } else merged.push(assign({}, r));
      });
      return merged;
    }
    function styleNodeOf(t) {
      t = resolveTarget(t); if (!t) return document.documentElement;
      if (isRange(t)) { var n = t.startContainer; return n.nodeType === 3 ? n.parentElement : n; }
      return t.nodeType === 1 ? t : document.documentElement;
    }
    function textOf(t) { t = resolveTarget(t); if (!t) return ''; return isRange(t) ? t.toString() : (t.textContent || ''); }
    function homePos() {
      var v = viewSize(), h = cfg.home;
      if (h && typeof h === 'object') return { x: h.x, y: h.y };
      return { x: h === 'bottom-left' ? cfg.homeMargin : v.w - cfg.homeMargin, y: v.h - 10 };
    }
    function homeFacing() { return homePos().x > viewSize().w / 2 ? -1 : 1; }
    function isAtHome() { var hp = homePos(); return Math.abs(st.x - hp.x) < 4 && Math.abs(st.y - hp.y) < 4; }

    // ------------------------------------------------ strips
    function parseFrames(file) { var m = /_strip(\d+)\.(png|webp|gif|jpe?g)$/i.exec(file || ''); return m ? parseInt(m[1], 10) : 0; }
    function loadImg(url) {
      return new Promise(function (res, rej) {
        var im = new Image();
        im.onload = function () { im.naturalWidth ? res(im) : rej(new Error('empty image')); };
        im.onerror = function () { rej(new Error('failed: ' + url)); };
        im.src = url;
      });
    }
    function loadStrip(name) {
      var def = cfg.strips[name], S = { name: name, def: def, missing: true, usedFallback: false };
      strips[name] = S;
      if (!def || !def.file) return Promise.resolve(S);
      var urls = [cfg.assetBase + def.file];
      if (cfg.fallbackBase) urls.push(cfg.fallbackBase + def.file);
      var chain = Promise.reject();
      urls.forEach(function (u, i) {
        chain = chain.catch(function () { return loadImg(u).then(function (im) { S.src = u; S.usedFallback = i > 0; return im; }); });
      });
      return chain.then(function (im) {
        S.img = im; S.missing = false;
        S.frames = def.frames || parseFrames(def.file) || 1;
        S.fw = im.naturalWidth / S.frames; S.fh = im.naturalHeight;
        S.fps = def.fps || 12; S.impact = def.impact != null ? def.impact : Math.round(S.frames * 0.45);
        S.anchor = assign({}, cfg.anchor, def.anchor);
        S.hit = def.hit || null; S.focus = def.focus || def.hit || null;
        return S;
      }, function () {
        if (!def.optional) console.warn('[stick] could not load strip "' + name + '" (' + def.file + ') from ' + cfg.assetBase + ' or the fallback');
        return S;
      });
    }
    function loadAll() {
      return Promise.all(Object.keys(cfg.strips).map(loadStrip)).then(function () {
        var idle = pick('idle');
        if (!idle) { console.error('[stick] idle strip missing: nothing to draw'); return; }
        st.scale = cfg.scale > 0 ? cfg.scale : Math.max(1, Math.round(cfg.targetHeight / idle.fh));
        Object.keys(strips).forEach(function (name) {
          var S = strips[name], overlay = S.def && S.def.overlay ? strips[S.def.overlay] : null;
          if (!overlay) return;
          if (overlay.missing || S.frames !== overlay.frames || Math.abs(S.fw - overlay.fw) > 0.01 || Math.abs(S.fh - overlay.fh) > 0.01) {
            console.warn('[stick] overlay "' + S.def.overlay + '" does not match "' + name + '" frame dimensions; overlay disabled');
            return;
          }
          S.overlay = overlay;
        });
        var fb = Object.keys(strips).filter(function (k) { return strips[k].usedFallback; });
        if (fb.length) console.info('[stick] using placeholder art for: ' + fb.join(', ') + ' (copy your PNGs into ' + cfg.assetBase + ')');
      });
    }
    /** Resolve a strip name to a loaded strip, following the fallback chain. */
    function pick(name) {
      var seen = {};
      while (name && !seen[name]) {
        seen[name] = 1;
        var S = strips[name];
        if (S && !S.missing) return S;
        name = FALLBACK[name];
      }
      return strips.idle && !strips.idle.missing ? strips.idle : null;
    }
    function stripFor(action) { return pick(cfg.actionStrips[action] || action); }

    // ------------------------------------------------ virtual-time primitives
    function waitRaw(ms) { return new Promise(function (res) { st.timers.push({ at: st.clock + ms, res: res }); }); }
    function guard(p) { var e = st.epoch; return p.then(function (v) { if (e !== st.epoch) throw CANCEL; return v; }); }
    function wait(ms) { return guard(waitRaw(ms)); }

    function setAnim(name, o) {
      o = o || {};
      var S = pick(name);
      if (!S) return Promise.resolve('missing');
      if (st.cur && !st.cur.finished && st.cur.done) { var d = st.cur.done; st.cur.finished = true; d('replaced'); }
      var cur = { name: name, S: S, t0: st.clock, loop: o.loop != null ? o.loop : !!(S.def && S.def.loop),
                  rate: o.rate || 1, reverse: !!o.reverse, marks: o.marks || null, fired: {}, finished: false, done: null };
      var pr = new Promise(function (res) { cur.done = res; });
      st.cur = cur; st.strip = S;
      return pr;
    }
    function play(name, o) { return guard(setAnim(name, assign({ loop: false }, o))); }
    function loop(name, o) { setAnim(name, assign({ loop: true }, o)); }
    function settle() { loop('idle'); }
    function setFilter(extra) { st.filter = extra || ''; if (sprite) applyFilter(); }
    function applyFilter() {
      if (!sprite) return;
      var invert = cfg.autoContrast && pageBackgroundIsDark()
        ? 'invert(1) hue-rotate(180deg) '
        : '';
      var halo = cfg.halo ? 'drop-shadow(1px 0 0 #fff) drop-shadow(-1px 0 0 #fff) drop-shadow(0 1px 0 #fff) drop-shadow(0 -1px 0 #fff) ' : '';
      sprite.style.filter = (invert + halo).trim() || 'none';
      if (fireSprite) fireSprite.style.filter = st.filter || 'none';
    }
    function pageBackgroundIsDark() {
      var offset = origin();
      var x = clamp(Math.round(st.x + offset.left), 0, Math.max(0, global.innerWidth - 1));
      var y = clamp(Math.round(st.y - 4 + offset.top), 0, Math.max(0, global.innerHeight - 1));
      var node = document.elementFromPoint ? document.elementFromPoint(x, y) : null;
      while (node) {
        var color = global.getComputedStyle(node).backgroundColor;
        var values = color.match(/[\d.]+/g);
        if (values && values.length >= 3 && (values.length < 4 || Number(values[3]) > 0.5)) {
          var channels = values.slice(0, 3).map(function (v) {
            var c = Number(v) / 255;
            return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
          });
          return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722 < 0.38;
        }
        node = node.parentElement;
      }
      return !!(global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches);
    }

    function walkRaw(x, y, o) {
      o = o || {};
      var dx = x - st.x, dy = y - st.y, dist = Math.sqrt(dx * dx + dy * dy);
      var newFacing = Math.abs(dx) > 4 ? (dx > 0 ? 1 : -1) : st.facing;
      if (dist < 3) { st.x = x; st.y = y; return Promise.resolve(); }
      var run = o.run != null ? o.run : o.anim === 'dash';
      var speed = run ? cfg.runSpeed : cfg.walkSpeed;
      var need = dist / (cfg.maxWalkMs / 1000);                         // never take longer than maxWalkMs
      if (need > speed) {
        speed = need;
        if (!o.anim && o.run == null && need > cfg.runSpeed * 0.7) { run = true; speed = Math.max(speed, cfg.runSpeed); }   // far away: break into a run
      }
      var ms = dist / speed * 1000;
      st.lastRun = run;
      var begin = function () {
        if (o.face !== false) st.facing = newFacing;
        var name = o.anim || (run ? 'dash' : 'walk');
        if (run && !o.anim && strips.dashstart && !strips.dashstart.missing) {
          var mv = null;
          setAnim('dashstart', { loop: false }).then(function () { if (st.move === mv && st.cur && st.cur.name === 'dashstart') setAnim('dash', { loop: true }); });
          mv = st.move = { x0: st.x, y0: st.y, x1: x, y1: y, t0: st.clock, ms: ms, res: null };
          return new Promise(function (res) { mv.res = res; });
        }
        setAnim(name, { loop: true });
        return new Promise(function (res) { st.move = { x0: st.x, y0: st.y, x1: x, y1: y, t0: st.clock, ms: ms, res: res }; });
      };
      if (cfg.useTurns && o.face !== false && newFacing !== st.facing) {
        var tn = run ? 'dashturn' : 'walkturn';
        if (strips[tn] && !strips[tn].missing) return setAnim(tn, { loop: false }).then(begin);
      }
      return begin();
    }
    function walk(x, y, o) {
      var p = guard(walkRaw(x, y, o));
      if (st.lastRun && strips.dashstop && !strips.dashstop.missing && !(o && o.anim)) {
        return p.then(function () { st.lastRun = false; return guard(setAnim('dashstop', { loop: false })); });
      }
      return p;
    }

    function animateRaw(el, kf, o) {
      o = assign({ fill: 'forwards', easing: 'ease-out' }, o);
      o.duration = (o.duration || 300) / Math.max(0.05, cfg.speed);
      if (el.animate) {
        var a = el.animate(kf, o);
        return a.finished ? a.finished.then(function () { return a; }, function () { return a; }) : new Promise(function (r) { a.onfinish = function () { r(a); }; });
      }
      return waitRaw(o.duration * cfg.speed);
    }
    function fxAnim(el, kf, o) { return guard(animateRaw(el, kf, o)); }

    // ------------------------------------------------ DOM
    var CSS = [
      ':host{all:initial}',
      '.stage{position:fixed;left:0;top:0;width:0;height:0;overflow:visible;pointer-events:none;font-family:var(--font)}',
      '.stage.in{position:absolute;width:100%;height:100%;overflow:hidden}',
      '.fx{position:absolute;left:0;top:0;width:0;height:0;overflow:visible}',
      '.actor{position:absolute;left:0;top:0;width:0;height:0;will-change:transform;pointer-events:none}',
      '.body{position:absolute;left:0;top:0;width:0;height:0}',
      '.sprite{position:absolute;left:0;top:0;transform-origin:0 0;background-repeat:no-repeat;image-rendering:pixelated;image-rendering:crisp-edges}',
      '.flyer{position:absolute;white-space:pre;margin:0;padding:0;will-change:transform,opacity;z-index:3}',
      '.ember{position:absolute;border-radius:50%;z-index:4;pointer-events:none}',
      '.pow{position:absolute;font:900 24px/1 var(--font);color:var(--accent);-webkit-text-stroke:2.5px var(--ink);paint-order:stroke fill;white-space:nowrap;z-index:5}',
      '.ripple{position:absolute;width:10px;height:10px;margin:-5px 0 0 -5px;border:2.5px solid var(--accent);border-radius:50%;z-index:4}',
      '.hl{position:absolute;background:rgba(255,222,60,.62);mix-blend-mode:multiply;border-radius:3px;z-index:2}',
      '.lens{position:absolute;width:70px;height:70px;margin:-35px 0 0 -35px;border-radius:50%;border:4px solid var(--ink);background:radial-gradient(circle at 32% 30%,rgba(255,255,255,.75),rgba(160,210,255,.28) 55%,rgba(160,210,255,.12));box-shadow:0 0 0 3px #fff,0 4px 10px rgba(0,0,0,.3);z-index:4}',
      '.lens:after{content:"";position:absolute;right:-22px;bottom:-16px;width:26px;height:6px;background:var(--ink);border-radius:3px;transform:rotate(40deg);transform-origin:left center}',
      '.scrib{position:absolute;z-index:3;overflow:visible}',
      '.note{position:absolute;max-width:230px;padding:7px 10px;background:#fff6a8;color:#161616;border:2px solid var(--ink);border-radius:4px 11px 4px 11px;font:13px/1.35 var(--font);box-shadow:2px 3px 0 rgba(0,0,0,.25);pointer-events:auto;cursor:pointer;z-index:6}',
      '.tray{position:absolute;left:14px;bottom:14px;padding:5px 11px;background:#fff6a8;color:#161616;border:2px solid var(--ink);border-radius:6px 12px 6px 12px;font:700 12px/1 var(--font);box-shadow:2px 3px 0 rgba(0,0,0,.25);display:none;z-index:6}',
      '.bubble{position:absolute;display:none;left:0;max-width:210px;width:max-content;padding:6px 11px;background:#fff;color:#161616;border:2px solid var(--ink);border-radius:13px;font:13px/1.3 var(--font);text-align:center;white-space:normal;transform:translateX(-50%)}',
      '.bubble:after{content:"";position:absolute;left:50%;bottom:-7px;width:10px;height:10px;background:#fff;border-right:2px solid var(--ink);border-bottom:2px solid var(--ink);transform:translateX(-50%) rotate(45deg)}',
      '.card{position:absolute;display:none;left:0;transform:translateX(-50%);padding:3px 9px;background:#fffbe0;border:2px solid var(--ink);border-radius:4px;font:700 12px/1.2 var(--font);color:var(--ink);white-space:nowrap}',
      '.book{position:absolute;display:none;width:22px;height:16px;background:var(--accent);border:2px solid var(--ink);border-radius:2px}',
      '.book:after{content:"";position:absolute;left:3px;right:3px;top:4px;height:2px;background:#fff;box-shadow:0 4px 0 #fff}',
      '.zzz{position:absolute;display:none;left:0;font:900 15px/1 var(--font);color:var(--ink)}',
      '.sleeping .zzz{display:block}',
      '.zzz span{position:absolute;left:0;top:0;opacity:0;animation:zf 2.6s infinite ease-out}',
      '.zzz span:nth-child(2){animation-delay:.85s;font-size:19px}',
      '.zzz span:nth-child(3){animation-delay:1.7s;font-size:13px}',
      '@keyframes zf{0%{opacity:0;transform:translate(0,0) scale(.6)}25%{opacity:1}100%{opacity:0;transform:translate(16px,-38px) scale(1.25)}}'
    ].join('\n');

    function init() {
      if (st.inited) return readyPromise;
      st.inited = true;
      var parent;
      if (cfg.container) { parent = cfg.container; if (global.getComputedStyle(parent).position === 'static') parent.style.position = 'relative'; }
      else parent = document.documentElement;

      host = document.createElement('stick-overlay');
      host.style.cssText = 'all:initial;position:' + (cfg.container ? 'absolute' : 'fixed') + ';left:0;top:0;width:0;height:0;z-index:' + cfg.zIndex + ';pointer-events:none;';
      shadow = host.attachShadow({ mode: 'open' });
      try { var sheet = new CSSStyleSheet(); sheet.replaceSync(CSS); shadow.adoptedStyleSheets = [sheet]; }   // constructed sheets are not blocked by page CSP
      catch (e) { var s = document.createElement('style'); s.textContent = CSS; shadow.appendChild(s); }
      stage = document.createElement('div'); stage.className = 'stage' + (cfg.container ? ' in' : '');
      stage.style.setProperty('--ink', cfg.ink); stage.style.setProperty('--accent', cfg.accent); stage.style.setProperty('--font', cfg.fontFamily);
      shadow.appendChild(stage);
      fx = document.createElement('div'); fx.className = 'fx'; stage.appendChild(fx);
      tray = document.createElement('div'); tray.className = 'tray'; stage.appendChild(tray);
      actorEl = document.createElement('div'); actorEl.className = 'actor'; stage.appendChild(actorEl);
      bodyEl = document.createElement('div'); bodyEl.className = 'body'; actorEl.appendChild(bodyEl);
      sprite = document.createElement('div'); sprite.className = 'sprite'; sprite.style.visibility = 'hidden'; bodyEl.appendChild(sprite);
      bookEl = document.createElement('div'); bookEl.className = 'book'; actorEl.appendChild(bookEl);
      cardEl = document.createElement('div'); cardEl.className = 'card'; actorEl.appendChild(cardEl);
      bubble = document.createElement('div'); bubble.className = 'bubble'; actorEl.appendChild(bubble);
      zzz = document.createElement('div'); zzz.className = 'zzz'; zzz.innerHTML = '<span>z</span><span>Z</span><span>z</span>'; actorEl.appendChild(zzz);
      fireSprite = document.createElement('div'); fireSprite.className = 'sprite fire'; fireSprite.style.visibility = 'hidden'; bodyEl.appendChild(fireSprite);
      applyFilter();
      parent.appendChild(host);

      readyPromise = loadAll().then(function () {
        st.ready = true;
        var hp = homePos(), v = viewSize();
        st.y = hp.y;
        st.x = cfg.entrance ? (hp.x > v.w / 2 ? v.w + 100 : -100) : hp.x;
        st.facing = cfg.entrance ? (hp.x > v.w / 2 ? -1 : 1) : homeFacing();
        positionHeadProps();
        loop('idle');
        sprite.style.visibility = 'visible';
        fireSprite.style.visibility = 'visible';
        raf = global.requestAnimationFrame(frame);
        hiddenTimer = setInterval(function () { if (document.hidden) stepClock(performance.now()); }, 120);
        global.addEventListener('resize', onResize);
        if (cfg.quirks) scheduleQuirk();
        if (cfg.entrance) enqueue(function () { return walk(hp.x, hp.y).then(function () { st.facing = homeFacing(); settle(); }); });
      });
      return readyPromise;
    }
    function positionHeadProps() {
      var S = pick('idle'); if (!S) return;
      var a = S.anchor, head = a.y * S.fh * st.scale;           // px from feet to top of frame
      bubble.style.bottom = (head - 4) + 'px';
      cardEl.style.bottom = (head - 2) + 'px';
    }
    function onResize() {
      if (st.busy || st.move) return;
      var v = viewSize(), hp = homePos();
      st.x = clamp(st.x, 30, v.w - 30); st.y = clamp(st.y, 60, v.h - 4);
      if (isAtHome()) { st.x = hp.x; st.y = hp.y; st.facing = homeFacing(); }
    }

    // ------------------------------------------------ frame loop
    function frame(now) { raf = global.requestAnimationFrame(frame); stepClock(now); }
    var lastStepAt = -1;
    function stepClock(now) {
      if (now === lastStepAt || !st.ready) return;
      lastStepAt = now;
      var dt = st.last ? clamp(now - st.last, 0, 100) : 16;
      st.last = now;
      st.clock += dt * cfg.speed;
      if (now - contrastCheckAt > 650) {
        contrastCheckAt = now;
        applyFilter();
      }

      if (st.timers.length) {
        var due = [], rest = [];
        for (var i = 0; i < st.timers.length; i++) (st.timers[i].at <= st.clock ? due : rest).push(st.timers[i]);
        st.timers = rest; due.forEach(function (t) { t.res(); });
      }
      if (st.move) {
        var m = st.move, p = clamp((st.clock - m.t0) / m.ms, 0, 1);
        st.x = m.x0 + (m.x1 - m.x0) * p; st.y = m.y0 + (m.y1 - m.y0) * p;
        if (p >= 1) { st.x = m.x1; st.y = m.y1; st.move = null; if (m.res) m.res(); }
      }
      var cur = st.cur, idx = 0;
      if (cur) {
        var S = cur.S, raw = Math.floor((st.clock - cur.t0) / 1000 * S.fps * cur.rate);
        if (cur.loop) idx = ((raw % S.frames) + S.frames) % S.frames;
        else idx = Math.min(raw, S.frames - 1);
        var shown = cur.reverse ? S.frames - 1 - idx : idx;
        if (!cur.finished) {
          if (cur.marks) for (var mk in cur.marks) {
            var at = mk === 'impact' ? S.impact : (cur.S.def.marks && cur.S.def.marks[mk]);
            if (at != null && !cur.fired[mk] && idx >= at) { cur.fired[mk] = true; try { cur.marks[mk](); } catch (err) { console.error('[stick] mark', err); } }
          }
          if (!cur.loop && raw >= S.frames) { cur.finished = true; cur.done('done'); }
        }
        idx = shown;
      }
      draw(st.strip, idx);
    }
    function draw(S, idx) {
      if (!S || !sprite) return;
      var sc = st.scale, W = S.fw * sc, H = S.fh * sc;
      if (S !== lastDrawn) {
        sprite.style.backgroundImage = 'url("' + S.src + '")';
        sprite.style.width = W + 'px'; sprite.style.height = H + 'px';
        sprite.style.backgroundSize = (S.img.naturalWidth * sc) + 'px ' + (S.img.naturalHeight * sc) + 'px';
        lastDrawn = S;
      }
      sprite.style.backgroundPosition = (-idx * W) + 'px 0';
      if (S.overlay && fireSprite) {
        var overlay = S.overlay;
        var overlayWidth = overlay.fw * sc, overlayHeight = overlay.fh * sc;
        fireSprite.style.backgroundImage = 'url("' + overlay.src + '")';
        fireSprite.style.width = overlayWidth + 'px';
        fireSprite.style.height = overlayHeight + 'px';
        fireSprite.style.backgroundSize = (overlay.img.naturalWidth * sc) + 'px ' + (overlay.img.naturalHeight * sc) + 'px';
        fireSprite.style.backgroundPosition = (-Math.min(idx, overlay.frames - 1) * overlayWidth) + 'px 0';
        fireSprite.style.visibility = 'visible';
      } else if (fireSprite) {
        fireSprite.style.visibility = 'hidden';
      }
      var ax = S.anchor.x * W, ay = S.anchor.y * H;
      var mirrored = (st.facing > 0) !== cfg.facesRight;
      var spriteTransform = mirrored ? 'translate(' + n2(ax) + 'px,' + n2(-ay) + 'px) scaleX(-1)' : 'translate(' + n2(-ax) + 'px,' + n2(-ay) + 'px)';
      sprite.style.transform = spriteTransform;
      if (S.overlay && fireSprite) fireSprite.style.transform = spriteTransform;
      actorEl.style.transform = 'translate(' + n2(st.x) + 'px,' + n2(st.y) + 'px)';
      st.frameIdx = idx;
    }

    // ------------------------------------------------ queue
    function enqueue(job) {
      st.busy++; st.lastActivity = Date.now(); clearTimeout(homeTimer);
      var p = queue.then(function () { return job(); });
      queue = p.then(function () {}, function () {}).then(function () {
        st.busy = Math.max(0, st.busy - 1); st.lastActivity = Date.now();
        if (st.busy === 0) armHomeTimer();
      });
      return p;
    }
    function armHomeTimer() {
      clearTimeout(homeTimer);
      if (!cfg.idleHomeMs) return;
      homeTimer = setTimeout(function () { if (st.busy === 0 && st.posture === 'stand' && !isAtHome()) perform({ action: 'idle' }); }, cfg.idleHomeMs / Math.max(0.05, cfg.speed));
    }
    function scheduleQuirk() {
      clearTimeout(quirkTimer);
      quirkTimer = setTimeout(function () {
        if (cfg.quirks && st.busy === 0 && st.posture === 'stand' && isAtHome() && !document.hidden) perform({ action: Math.random() < 0.5 ? 'yawn' : 'lookAround' });
        scheduleQuirk();
      }, 30000 + Math.random() * 40000);
    }

    // ------------------------------------------------ fx helpers
    function mk(cls, css, parent) { var d = document.createElement('div'); d.className = cls; if (css) d.style.cssText = css; (parent || fx).appendChild(d); return d; }
    function removeEl(e) { if (e && e.parentNode) e.parentNode.removeChild(e); }
    function clearFx() {
      Array.prototype.slice.call(fx.children).forEach(function (c) { if (!c.classList.contains('note')) removeEl(c); });
      clearTimeout(bubbleTimer); bubble.style.display = 'none';
    }
    function makeFlyer(text, rect, node) {
      var cs = global.getComputedStyle(node);
      var d = mk('flyer', 'left:' + n2(rect.left) + 'px;top:' + n2(rect.top) + 'px;font-family:' + cs.fontFamily + ';font-size:' + cs.fontSize + ';font-weight:' + cs.fontWeight +
        ';font-style:' + cs.fontStyle + ';letter-spacing:' + cs.letterSpacing + ';color:' + cs.color + ';line-height:' + n2(rect.height) + 'px;');
      d.textContent = text; return d;
    }
    var FIRE = {
      red:   { core: 'radial-gradient(circle,#fff 0,#ffe27a 28%,#ff7a1a 62%,rgba(255,60,0,0) 72%)', glow: '0 0 6px #ff7a00,0 -3px 10px #ff3d00,0 -8px 16px rgba(255,90,0,.7)', text: '#ff5a1f', ash: '#2a1408' },
      green: { core: 'radial-gradient(circle,#fff 0,#d4ff7a 28%,#2fe36b 62%,rgba(0,200,90,0) 72%)', glow: '0 0 6px #35e070,0 -3px 10px #12c45a,0 -8px 16px rgba(40,230,110,.7)', text: '#27d36a', ash: '#0a2a14' }
    };
    function embers(rect, kind, n) {
      var F = FIRE[kind];
      for (var i = 0; i < (n || 14); i++) {
        (function () {
          var sz = 4 + Math.random() * 6;
          var e = mk('ember', 'left:' + n2(rect.left + Math.random() * rect.width) + 'px;top:' + n2(rect.top + rect.height * (0.3 + Math.random() * 0.6)) + 'px;width:' + n2(sz) + 'px;height:' + n2(sz) + 'px;background:' + F.core + ';');
          animateRaw(e, [{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: 'translate(' + n2((Math.random() - 0.5) * 50) + 'px,' + n2(-(26 + Math.random() * 56)) + 'px) scale(.3)', opacity: 0 }],
            { duration: 520 + Math.random() * 520, easing: 'ease-out' }).then(function () { removeEl(e); });
        })();
      }
    }
    function burnWord(text, rect, node) {
      var f = makeFlyer(text, rect, node), F = FIRE.red, orig = global.getComputedStyle(node).color;
      embers(rect, 'red', 16);
      animateRaw(f, [
        { color: orig, textShadow: '0 0 0 transparent', transform: 'translateY(0) scale(1)', filter: 'blur(0px)', opacity: 1 },
        { color: F.text, textShadow: F.glow, transform: 'translateY(-4px) scale(1.06)', filter: 'blur(0px)', opacity: 1, offset: 0.3 },
        { color: F.ash, textShadow: F.glow, transform: 'translateY(-12px) scale(1.02)', filter: 'blur(1px)', opacity: 0.85, offset: 0.7 },
        { color: F.ash, textShadow: '0 0 0 transparent', transform: 'translateY(-30px) scale(.9)', filter: 'blur(4px)', opacity: 0 }
      ], { duration: 900, easing: 'ease-in' }).then(function () { removeEl(f); });
    }
    function igniteWord(text, rect, node) {
      var f = makeFlyer(text, rect, node), F = FIRE.green, orig = global.getComputedStyle(node).color;
      embers(rect, 'green', 16);
      var done = animateRaw(f, [
        { color: F.text, textShadow: F.glow, transform: 'translateY(8px) scale(.55)', opacity: 0, filter: 'blur(3px)' },
        { color: F.text, textShadow: F.glow, transform: 'translateY(-4px) scale(1.18)', opacity: 1, filter: 'blur(0px)', offset: 0.35 },
        { color: F.text, textShadow: F.glow, transform: 'translateY(0) scale(1)', opacity: 1, offset: 0.7 },
        { color: orig, textShadow: '0 0 0 transparent', transform: 'translateY(0) scale(1)', opacity: 1 }
      ], { duration: 950, easing: 'ease-out' });
      return { el: f, done: done };
    }
    function pow(x, y) {
      var d = mk('pow', 'left:' + n2(x) + 'px;top:' + n2(y) + 'px;');
      d.textContent = cfg.pow[Math.floor(Math.random() * cfg.pow.length)];
      animateRaw(d, [{ transform: 'translate(-50%,-50%) scale(.3) rotate(-14deg)', opacity: 0 }, { transform: 'translate(-50%,-90%) scale(1.25) rotate(-6deg)', opacity: 1, offset: 0.3 },
        { transform: 'translate(-50%,-120%) scale(1) rotate(-4deg)', opacity: 0 }], { duration: 650 }).then(function () { removeEl(d); });
    }
    function ripple(x, y) {
      var d = mk('ripple', 'left:' + n2(x) + 'px;top:' + n2(y) + 'px;');
      animateRaw(d, [{ transform: 'scale(.4)', opacity: 0.9 }, { transform: 'scale(4.6)', opacity: 0 }], { duration: 650 }).then(function () { removeEl(d); });
    }
    function shake(el, ms) { return animateRaw(el, [{ transform: 'translate(0,0)' }, { transform: 'translate(-3px,1px)' }, { transform: 'translate(3px,-1px)' }, { transform: 'translate(-2px,0)' }, { transform: 'translate(0,0)' }], { duration: ms || 220, easing: 'linear' }); }
    function say(text, ms) {
      clearTimeout(bubbleTimer); text = String(text == null ? '' : text);
      if (!text) { bubble.style.display = 'none'; return 0; }
      bubble.textContent = text; bubble.style.display = 'block';
      var S = pick('idle'), headPx = S ? S.anchor.y * S.fh * st.scale : 100;
      if (st.y - headPx < 56) { bubble.style.bottom = 'auto'; bubble.style.top = '14px'; } else { bubble.style.top = 'auto'; bubble.style.bottom = (headPx - 4) + 'px'; }
      var dur = ms || Math.max(1800, text.length * 70);
      bubbleTimer = setTimeout(function () { bubble.style.display = 'none'; }, dur / Math.max(0.05, cfg.speed));
      return dur;
    }
    function setCard(t) { if (t == null) { cardEl.style.display = 'none'; return; } t = String(t); cardEl.textContent = t.length > 24 ? t.slice(0, 23) + '…' : t; cardEl.style.display = 'block'; }
    function cardPx() { var S = pick('idle'); var head = S ? S.anchor.y * S.fh * st.scale : 100; return { x: st.x, y: st.y - head }; }
    function setBook(on) {
      if (!on) { bookEl.style.display = 'none'; return; }
      var S = pick('crouch') || pick('idle'), sc = st.scale, f = S.focus || { x: 0.8, y: 0.6 }, a = S.anchor;
      var dx = (f.x - a.x) * S.fw * sc, dy = (f.y - a.y) * S.fh * sc;
      var mirrored = (st.facing > 0) !== cfg.facesRight; dx = mirrored ? -dx : dx;
      bookEl.style.left = (dx - 11) + 'px'; bookEl.style.top = (dy - 8) + 'px'; bookEl.style.display = 'block';
    }

    // ------------------------------------------------ positioning
    function reveal(t) {
      if (cfg.container) return;
      var node = styleNodeOf(t); if (!node || node === document.documentElement || !node.scrollIntoView) return;
      var r = node.getBoundingClientRect(), v = viewSize(), S = pick('idle'), low = S ? (S.anchor.y * S.fh * st.scale) * 0.6 + 30 : 90;
      var cy = r.top + r.height / 2;
      if (cy < 120 || cy > v.h - low) node.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    }
    /** Where must Stick stand so the focus/hit point of strip `name` lands on (tx, ty)? */
    function focusSpot(name, tx, ty, prefer) {
      var S = pick(name) || pick('idle'), sc = st.scale, v = viewSize();
      var f = S.hit || S.focus || { x: 0.8, y: 0.5 }, a = S.anchor;
      var dx = (f.x - a.x) * S.fw * sc, dy = (f.y - a.y) * S.fh * sc;
      function offsetFor(facing) { var mirrored = (facing > 0) !== cfg.facesRight; return mirrored ? -dx : dx; }
      var facing = 1, ax = tx - offsetFor(1), margin = S.fw * sc * 0.4;
      if (prefer === 'right' || ax < margin) { facing = -1; ax = tx - offsetFor(-1); }
      return { x: clamp(ax, margin, v.w - margin), y: clamp(ty - dy, S.fh * sc * S.anchor.y * 0.6 + 8, v.h - 4), facing: facing };
    }
    function nearSpot(rect) {
      var S = pick('idle'), sc = st.scale, v = viewSize(), half = S.fw * sc * 0.3;
      var ax = rect.left - half - 10, facing = 1;
      if (ax < half + 6) { ax = rect.right + half + 10; facing = -1; }
      return { x: clamp(ax, half, v.w - half), y: clamp(rect.bottom + 6, S.fh * sc * S.anchor.y * 0.6 + 8, v.h - 4), facing: facing };
    }

    async function standUp() {
      if (st.posture === 'stand') return;
      var was = st.posture;
      st.posture = 'stand'; actorEl.classList.remove('sleeping'); setBook(false);
      animateRaw(bodyEl, [{ transform: 'translateY(0)' }, { transform: 'translateY(-14px)' }, { transform: 'translateY(0)' }], { duration: 320 });
      if (was === 'sleep') { await play('crouch', { reverse: true, rate: 1.4 }); }
      loop('idle'); await wait(120);
    }
    async function goHome() { var hp = homePos(); await walk(hp.x, hp.y); st.facing = homeFacing(); settle(); }
    async function typeInto(node, text, ms) {
      var n = text.length, steps = Math.max(1, Math.min(n, 48)); node.textContent = '';
      for (var i = 1; i <= steps; i++) { node.textContent = text.slice(0, Math.round(n * i / steps)); await wait(ms / steps); }
    }

    // ------------------------------------------------ gap helper (used by punch + correct)
    /** Turn the target into a same-width gap and remember how to fill it. */
    function makeGap(t, rect) {
      var gap = { t: t, range: isRange(t) ? t : null, spacer: null, hidden: null, rect: rect };
      if (gap.range) {
        gap.spacer = document.createElement('span');
        gap.spacer.setAttribute('data-stick-spacer', '1');
        gap.spacer.style.cssText = 'display:inline-block;width:' + n2(rect.width) + 'px;height:1em;vertical-align:baseline;';
        gap.range.deleteContents(); gap.range.insertNode(gap.spacer);
      } else if (t.nodeType === 1) { gap.hidden = t.style.visibility; t.style.visibility = 'hidden'; }
      return gap;
    }
    function fillGap(gap, text) {
      if (gap.spacer) { gap.spacer.replaceWith(document.createTextNode(text)); gap.spacer = null; }
      else if (gap.t.nodeType === 1) { gap.t.textContent = text; gap.t.style.visibility = gap.hidden || ''; }
    }
    function dropGap(gap) { if (gap.spacer) { gap.spacer.remove(); gap.spacer = null; } else if (gap.t.nodeType === 1 && gap.hidden !== null) gap.t.style.visibility = gap.hidden || ''; }

    // green jab: write `text` into the gap with green fire
    async function writeWithGreenFire(gap, text, node, rect, standSpot) {
      setFilter(cfg.greenFilter);
      var igniter = null;
      function onImpact() {
        var tr = gap.spacer ? toRect(gap.spacer.getBoundingClientRect()) : locate(gap.t);
        var box = { left: tr.left, top: rect.top, height: rect.height };
        var probe = makeFlyer(text, box, node);
        var nw = probe.getBoundingClientRect().width; removeEl(probe);
        if (gap.spacer) gap.spacer.style.cssText += 'transition:width ' + (0.18 / cfg.speed) + 's ease;width:' + n2(nw) + 'px;';
        pow(tr.left + nw / 2, rect.top);
        igniter = igniteWord(text, { left: box.left, top: box.top, width: nw, height: box.height }, node);
      }
      await play(cfg.actionStrips.correct, { marks: { impact: onImpact } });
      setFilter('');
      if (igniter) await guard(igniter.done);
      fillGap(gap, text);
      if (igniter) removeEl(igniter.el);
      settle();
    }

    // ------------------------------------------------ the actions
    var ACT = {};

    ACT.idle = async function () { await standUp(); setBook(false); setCard(null); await goHome(); };

    function targetAction(runIt) {
      return async function (c) {
        await standUp();
        var t = c.target; if (!resolveTarget(t)) { if (c.opts && c.opts.to) t = c.opts.to; else throw new Error('stick.' + (runIt ? 'run' : 'walk') + ': no target'); }
        var r = locate(t); if (!r) throw new Error('stick: could not locate target');
        reveal(t); r = locate(t);
        var sp = nearSpot(r);
        await walk(sp.x, sp.y, { run: runIt ? true : undefined });
        st.facing = sp.facing; settle();
        return { x: sp.x, y: sp.y };
      };
    }
    ACT.walk = targetAction(false);
    ACT.run = targetAction(true);

    ACT.say = async function (c) {
      var dur = say(c.text, c.opts && c.opts.ms);
      if (!(c.opts && c.opts.wait === false) && dur) await wait(Math.min(dur, 2500));
    };

    ACT.wave = async function (c) { await standUp(); if (c.text) say(c.text, c.opts && c.opts.ms); loop(cfg.actionStrips.wave); await wait((c.opts && c.opts.ms) || 1600); settle(); };
    ACT.cheer = async function (c) { await standUp(); if (c.text) say(c.text); await play(cfg.actionStrips.cheer); settle(); };
    ACT.shrug = async function (c) { await standUp(); say(c.text || '¯\\_(ツ)_/¯', 1600); await wait(1500); };
    ACT.yawn = async function () { await standUp(); say('*yawn*', 1500); await wait(1400); };
    ACT.lookAround = async function () {
      await standUp(); var f0 = st.facing;
      if (strips.walkturn && !strips.walkturn.missing) { await play('walkturn'); } else await wait(250);
      st.facing = -f0; await wait(800); st.facing = f0; settle();
    };

    ACT.tap = async function (c) {
      await standUp();
      var S = stripFor('tap'), r = c.target ? locate(c.target) : null;
      if (r) { reveal(c.target); r = locate(c.target); var sp = focusSpot(cfg.actionStrips.tap, r.left, r.cy); await walk(sp.x, sp.y); st.facing = sp.facing; }
      if (c.text) say(c.text);
      var f = S.focus || { x: 0.8, y: 0.4 }, mirrored = (st.facing > 0) !== cfg.facesRight;
      var dx = (f.x - S.anchor.x) * S.fw * st.scale * (mirrored ? -1 : 1), dy = (f.y - S.anchor.y) * S.fh * st.scale;
      var cnt = 0;
      var done = play(cfg.actionStrips.tap, { marks: {} });
      var iv = setInterval(function () { ripple(st.x + dx, st.y + dy); if (++cnt >= 3) clearInterval(iv); }, 380 / Math.max(0.05, cfg.speed));
      await done; clearInterval(iv);
      settle();
    };

    ACT.read = async function (c) {
      if (st.posture === 'sit') return;
      await standUp();
      if (c.target) {
        var target = resolveTarget(c.target), rect = locate(target);
        if (!rect) throw new Error('stick.read: could not locate target');
        reveal(target);
        rect = locate(target);
        var spot = nearSpot(rect);
        await walk(spot.x, spot.y);
        st.facing = spot.facing;
      } else if (!(c.opts && c.opts.here)) {
        await goHome();
      }
      st.posture = 'sit';
      await play(cfg.actionStrips.read, { rate: 1.1 });
      setBook(true);
    };
    ACT.sleep = async function (c) {
      if (st.posture === 'sleep') return;
      await standUp();
      if (!(c.opts && c.opts.here)) await goHome();
      st.posture = 'sleep';
      loop(cfg.actionStrips.sleep);
      animateRaw(bodyEl, [{ transform: 'translateY(-46px) rotate(-18deg)', offset: 0 }, { transform: 'translateY(0) rotate(0)', offset: 0.55 }, { transform: 'translateY(-9px)', offset: 0.75 }, { transform: 'translateY(0)', offset: 1 }], { duration: 640, easing: 'ease-in', fill: 'none' });
      var S = pick(cfg.actionStrips.sleep);
      var headX = (S.anchor.x * S.fw * st.scale) * 0.55 * (((st.facing > 0) !== cfg.facesRight) ? 1 : -1);
      zzz.style.left = headX + 'px'; zzz.style.top = -(S.fh * st.scale * 0.9) + 'px';
      actorEl.classList.add('sleeping');
      await wait(640);
    };

    ACT.magnify = async function (c) {
      await standUp();
      var t = c.target, r = locate(t); if (!r) throw new Error('stick.magnify: no target');
      reveal(t); r = locate(t);
      var sp = focusSpot(cfg.actionStrips.magnify, r.left + Math.min(40, r.width * 0.15), r.top + Math.min(r.height / 2, 60));
      await walk(sp.x, sp.y); st.facing = sp.facing;
      await play(cfg.actionStrips.magnify);                    // squat down (holds the last frame)
      // the lens scans the text
      var lines = lineRects(t), L = lines[0] || r;
      var lens = mk('lens', 'left:' + n2(L.left) + 'px;top:' + n2(L.cy) + 'px;');
      var glow = mk('hl', 'left:' + n2(r.left - 5) + 'px;top:' + n2(r.top - 4) + 'px;width:' + n2(r.width + 10) + 'px;height:' + n2(r.height + 8) + 'px;background:rgba(120,190,255,.16);outline:2px dashed ' + cfg.accent + ';');
      var span = Math.max(80, Math.min(L.width, 520)), ms = (c.opts && c.opts.ms) || 2000;
      animateRaw(lens, [{ transform: 'translate(0,0)', opacity: 0 }, { transform: 'translate(0,0)', opacity: 1, offset: 0.1 }, { transform: 'translate(' + n2(span) + 'px,0)', opacity: 1, offset: 0.55 },
        { transform: 'translate(' + n2(span * 0.3) + 'px,' + n2(Math.min(r.height * 0.4, 22)) + 'px)', opacity: 1, offset: 0.85 }, { transform: 'translate(' + n2(span * 0.3) + 'px,' + n2(Math.min(r.height * 0.4, 22)) + 'px)', opacity: 0 }], { duration: ms, easing: 'ease-in-out' });
      await wait(ms);
      removeEl(lens);
      if (!(c.opts && c.opts.keepGlow)) animateRaw(glow, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 }).then(function () { removeEl(glow); });
      await play(cfg.actionStrips.magnify, { reverse: true, rate: 1.3 });
      settle();
    };

    ACT.highlight = async function (c) {
      await standUp();
      var t = c.target; if (!resolveTarget(t)) throw new Error('stick.highlight: no target');
      reveal(t);
      var lines = lineRects(t), made = [], S = pick(cfg.actionStrips.highlight);
      for (var i = 0; i < lines.length; i++) {
        var L = lines[i];
        var h = mk('hl', 'left:' + n2(L.left - 2) + 'px;top:' + n2(L.top) + 'px;width:' + n2(L.width + 4) + 'px;height:' + n2(L.height) + 'px;clip-path:inset(0 100% 0 0);');
        made.push(h);
        if (i < 6) {
          var a = focusSpot(cfg.actionStrips.highlight, L.left, L.cy), b = focusSpot(cfg.actionStrips.highlight, L.right, L.cy);
          await walk(a.x, a.y); st.facing = a.facing;
          var swing = play(cfg.actionStrips.highlight);
          var ms = clamp(L.width * 3.2, 420, 1100);
          h.style.clipPath = '';
          var grow = fxAnim(h, [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }], { duration: ms, easing: 'linear' });
          await Promise.all([swing, grow, L.width > 160 ? walk(b.x, b.y, { anim: 'walk', face: false }) : Promise.resolve()]);
        } else h.style.clipPath = '';
      }
      settle();
      var keep = (c.opts && c.opts.ms) || 4200;
      var cleanup = function () { global.removeEventListener('scroll', onScroll, true); made.forEach(removeEl); };
      var onScroll = function () { cleanup(); };
      global.addEventListener('scroll', onScroll, true);
      setTimeout(cleanup, keep / Math.max(0.05, cfg.speed));
      return { lines: lines.length };
    };

    ACT.erase = async function (c) {
      await standUp();
      var t = resolveTarget(c.target); if (!t || t.nodeType !== 1) throw new Error('stick.erase: target must be an Element');
      reveal(t); var r = locate(t);
      var sp = focusSpot(cfg.actionStrips.erase, r.left + 8, r.top + Math.min(r.height * 0.4, 70));
      await walk(sp.x, sp.y); st.facing = sp.facing;
      var h = Math.min(r.height, 280), rows = clamp(Math.round(h / 15), 2, 18), w = r.width;
      var sv = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      sv.setAttribute('width', w); sv.setAttribute('height', h); sv.setAttribute('class', 'scrib'); sv.style.cssText = 'left:' + n2(r.left) + 'px;top:' + n2(r.top) + 'px;';
      var d = 'M0 ' + n2(h / (rows * 2));
      for (var i = 0; i < rows; i++) { var y = (i + 0.5) * h / rows; d += i % 2 === 0 ? ' L' + n2(w) + ' ' + n2(y) : ' L0 ' + n2(y); }
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d); path.setAttribute('fill', 'none'); path.setAttribute('stroke', cfg.accent); path.setAttribute('stroke-width', '3.2');
      path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round'); path.setAttribute('opacity', '.8');
      sv.appendChild(path); fx.appendChild(sv);
      var len = 0; try { len = path.getTotalLength(); } catch (e) { len = w * rows; }
      path.style.strokeDasharray = len; path.style.strokeDashoffset = len;
      var prevT = t.style.transition, prevO = t.style.opacity;
      t.style.transition = 'opacity ' + (0.9 / cfg.speed) + 's linear'; t.style.opacity = '0.12';
      var jab = play(cfg.actionStrips.erase);
      await fxAnim(path, [{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: clamp(len * 1.6, 600, 1500), easing: 'ease-in-out' });
      await jab;
      var text = c.text;
      if (text != null) {
        if (t.dataset.stickOriginal == null) t.dataset.stickOriginal = t.textContent;
        t.dataset.stickRewritten = '1';
        fxAnim(sv, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 }).then(function () { removeEl(sv); }, function () { removeEl(sv); });
        t.style.opacity = prevO || ''; t.style.transition = prevT || '';
        await typeInto(t, String(text), clamp(String(text).length * 22, 500, 1800));
      } else { removeEl(sv); t.style.opacity = prevO || ''; t.style.transition = prevT || ''; }
      settle();
      return { rewritten: text != null };
    };

    ACT.carry = async function (c) {
      await standUp();
      var text = c.text != null ? String(c.text) : '', t = c.target ? resolveTarget(c.target) : null;
      setCard(text || '…');
      if (t) {
        reveal(c.target);
        var r = locate(c.target), sp = nearSpot(r);
        await walk(sp.x, sp.y, { anim: 'walk' }); st.facing = sp.facing;
        var cp = cardPx(); setCard(null);
        var v = viewSize(), nx = clamp(r.right + 12, 8, v.w - 240), ny = clamp(r.top - 4, 8, v.h - 80);
        if (r.right + 12 > v.w - 240) nx = clamp(r.left - 240, 8, v.w - 240);
        var note = mk('note', 'left:' + n2(nx) + 'px;top:' + n2(ny) + 'px;'); note.textContent = text;
        note.addEventListener('click', function () { removeEl(note); });
        await fxAnim(note, [{ transform: 'translate(' + n2(cp.x - nx) + 'px,' + n2(cp.y - ny) + 'px) scale(.3) rotate(-14deg)', opacity: 0.2 }, { transform: 'rotate(-1.4deg)', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.2,.9,.3,1.2)' });
        note.style.transform = 'rotate(-1.4deg)';
        setTimeout(function () { animateRaw(note, [{ opacity: 1 }, { opacity: 0 }], { duration: 400 }).then(function () { removeEl(note); }); }, ((c.opts && c.opts.ms) || cfg.noteMs) / Math.max(0.05, cfg.speed));
        settle(); return { placed: true };
      }
      var v2 = viewSize(), S = pick('idle');
      await walk(110 + S.fw * st.scale * 0.3, v2.h - 10, { anim: 'walk' });
      st.facing = -1;
      var cp2 = cardPx(); setCard(null);
      var fl = mk('note', 'left:' + n2(cp2.x - 40) + 'px;top:' + n2(cp2.y - 12) + 'px;pointer-events:none;');
      fl.textContent = text.length > 22 ? text.slice(0, 21) + '…' : text;
      animateRaw(fl, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'translate(' + n2(14 - (cp2.x - 40)) + 'px,' + n2(v2.h - 34 - (cp2.y - 12)) + 'px) scale(.2)', opacity: 0.2 }], { duration: 450, easing: 'ease-in' }).then(function () { removeEl(fl); });
      await wait(430);
      notes.push(text); tray.textContent = 'notes ' + notes.length; tray.style.display = 'block';
      st.facing = homeFacing(); settle();
      return { notes: notes.length };
    };

    ACT.punch = async function (c) {
      await standUp();
      var t = resolveTarget(c.target); if (!t) throw new Error('stick.punch: no target');
      reveal(t);
      var r = locate(t), node = styleNodeOf(t), oldText = textOf(t), replace = c.text != null, newText = replace ? String(c.text) : null;
      var sp = focusSpot(cfg.actionStrips.punch, r.left + 2, r.cy);
      await walk(sp.x, sp.y); st.facing = sp.facing;
      var gap = null;
      function onImpact() {
        pow(r.left + r.width / 2, r.top);
        burnWord(oldText, r, node);
        gap = makeGap(t, r);                         // original vanishes, a same-width gap stays
        shake(bodyEl, 180);
      }
      await play(cfg.actionStrips.punch, { marks: { impact: onImpact }, blend: 0 });
      settle();
      if (!gap) gap = makeGap(t, r);
      if (!replace) {
        await wait(700);
        if (gap.range) dropGap(gap); else dropGap(gap);   // Range: word deleted; Element: reappears
        return { punched: true };
      }
      await wait(260);
      await writeWithGreenFire(gap, newText, node, r, sp);
      return { replaced: true };
    };

    ACT.correct = async function (c) {
      await standUp();
      var t = resolveTarget(c.target); if (!t) throw new Error('stick.correct: no target');
      if (c.text == null) throw new Error('stick.correct: needs text');
      reveal(t);
      var r = locate(t), node = styleNodeOf(t);
      var collapsed = isRange(t) && t.collapsed;
      var sp = focusSpot(cfg.actionStrips.correct, r.left + (collapsed ? 0 : 2), r.cy);
      await walk(sp.x, sp.y); st.facing = sp.facing;
      var gap = makeGap(t, r);
      await writeWithGreenFire(gap, String(c.text), node, r, sp);
      return { replaced: true };
    };

    // ------------------------------------------------ perform / stop / destroy
    var ALIASES = { walkTo: 'walk', fixTypo: 'punch', fix: 'punch', glossary: 'carry', sit: 'read', nap: 'sleep', hello: 'wave', burn: 'punch', dash: 'run', inspect: 'magnify', nudge: 'tap', rest: 'sleep' };

    function perform(cmd) {
      if (typeof cmd === 'string') cmd = { action: cmd };
      cmd = cmd || {};
      var name = ALIASES[cmd.action] || cmd.action;
      var fn = customActions[name] || ACT[name];
      if (!fn) return Promise.reject(new Error('Stick: unknown action "' + cmd.action + '"'));
      var rp = init();
      var token = st.epoch;
      return enqueue(function () {
        return rp.then(function () {
          if (token !== st.epoch) return { cancelled: true };
          if (!st.ready) throw new Error('Stick: strips failed to load');
          return fn(cmd, helpers).then(function (v) { return v || { ok: true }; });
        }).catch(function (e) {
          if (e === CANCEL) return { cancelled: true };
          console.error('[stick] "' + name + '" failed:', e);
          try { settle(); } catch (x) {}
          throw e;
        });
      });
    }
    function stop() {
      st.epoch++; queue = Promise.resolve(); st.busy = 0;
      var m = st.move; st.move = null; if (m && m.res) m.res();
      var ts = st.timers; st.timers = []; ts.forEach(function (t) { t.res(); });
      if (st.inited && st.ready) { clearFx(); setCard(null); setBook(false); setFilter(''); actorEl.classList.remove('sleeping'); st.posture = 'stand'; settle(); }
    }
    function destroy() {
      stop(); cancelAnimationFrame(raf); clearInterval(hiddenTimer); clearTimeout(homeTimer); clearTimeout(quirkTimer);
      global.removeEventListener('resize', onResize); removeEl(host); st.inited = false; st.ready = false;
    }
    function restore(el) {
      el = resolveTarget(el);
      if (el && el.dataset && el.dataset.stickOriginal != null) { el.textContent = el.dataset.stickOriginal; delete el.dataset.stickOriginal; delete el.dataset.stickRewritten; return true; }
      return false;
    }

    var helpers = {
      cfg: cfg, st: st, strips: strips,
      wait: wait, walk: walk, play: play, loop: loop, settle: settle, say: say, standUp: standUp, goHome: goHome, anim: fxAnim,
      rect: locate, lineRects: lineRects, reveal: reveal, focusSpot: focusSpot, nearSpot: nearSpot, pow: pow, ripple: ripple,
      embers: embers, burnWord: burnWord, igniteWord: igniteWord, makeFlyer: makeFlyer, mk: mk, removeEl: removeEl, setFilter: setFilter,
      setCard: setCard, setBook: setBook, cardPx: cardPx, resolveTarget: resolveTarget, styleNodeOf: styleNodeOf, textOf: textOf, viewSize: viewSize, typeInto: typeInto,
      makeGap: makeGap, fillGap: fillGap, dropGap: dropGap, fx: function () { return fx; }
    };

    return {
      version: '2.0.0-sprites',
      config: cfg,
      init: init, perform: perform, stop: stop, destroy: destroy, restore: restore,
      get ready() { return init(); },
      say: function (t, ms) { return perform({ action: 'say', text: t, opts: { ms: ms } }); },
      get notes() { return notes.slice(); },
      get posture() { return st.posture; },
      get busy() { return st.busy > 0; },
      get position() { return { x: st.x, y: st.y, facing: st.facing }; },
      get strips() { return strips; },
      get scale() { return st.scale; },
      setSpeed: function (s) { cfg.speed = s; },
      setScale: function (s) { cfg.scale = s; st.scale = s; lastDrawn = null; positionHeadProps(); },
      play: function (name, o) { init(); return setAnim(name, o); },
      defineAction: function (name, fn) { customActions[name] = fn; },
      helpers: helpers
    };
  }

  var Stick = createActor();
  Stick.create = createActor;
  global.Stick = Stick;
  global.stick = Stick;                 // the contract spells it lowercase: stick.perform({...})
  if (typeof module !== 'undefined' && module.exports) module.exports = Stick;
})(typeof window !== 'undefined' ? window : this);
