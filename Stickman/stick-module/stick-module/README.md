# Stick module (pixel-art sprite edition)

Stick lives in his own folder, works **without the extension** (open `playground.html`), and plugs into the extension with one `content_scripts` entry.

```
stick-module/
  stick.js            the engine + Actor API            (you never need to edit this)
  stick.config.js     strip table, speeds, calibration  (the ONLY file you edit)
  bridge.js           extension messages -> Stick       (Dev A / Dev B use this)
  playground.html     preview every action + calibrator
  assets/             PUT YOUR PNGs HERE
  assets-placeholder/ stand-in art so everything works before your files are in
  CONTRACT-actor-api.md   paste into the repo's CONTRACT.md
```

## 1. Quick start (2 minutes)

1. Copy all your `Custom/*.png` strips into `assets/` (keep the names: `idle_strip8.png`, `jab_fire_draw_strip20.png`, ...).
2. Serve the folder and open the playground:
   ```
   cd stick-module
   python -m http.server 8000      # then open http://localhost:8000/playground.html
   ```
   (Opening `playground.html` straight from disk also works in most browsers.)
3. Press the buttons. The status bar says *placeholder art for N strips* until your PNGs are found.

No frame counts or sizes to enter: the count comes from the file name (`_strip8` = 8 frames) and the frame size is detected from the image (`width / frames` x `height`).

## 2. Calibrate (5 minutes, do it once)

I have not seen your PNGs (only the folder screenshot), so the *fist*, *feet* and *impact frame* positions start as sensible guesses. Fix them in the playground's **Calibrator**:

1. Pick `jabFire`. Drag **frame** to where the fist hits. Press **set impact = this frame**.
2. Set **click sets: fist** and click the fist. Set **feet** and click the point between his feet.
3. Repeat for `jab`, `crouch` (click where his hands/face are when crouched), `taunt`, `ftilt`, `pratfall` (feet = where he touches the ground).
4. **copy to clipboard** and paste the numbers into the matching entries in `stick.config.js`.

Then tune the feel with the sliders: raise/lower **walk px/s** and **run px/s** until the feet stop sliding, and copy the numbers into the config. If your sprites face LEFT, set `facesRight: false`.

## 3. Which strip plays what

| Action | Strip | Notes |
|---|---|---|
| idle | `idle_strip8` | loop |
| walk | `walk_strip8` | loop |
| run | `dash_strip12` | `dashstart_strip3` before, `dashstop_strip2` after (if the files exist) |
| punch | `jab_fire_draw_strip20` | red fire burns the word |
| correct | same jab + `greenFilter` | `hue-rotate` turns the fire green; the stickman is black/grey so he is unaffected |
| magnify | `crouch_strip12` | plays forward, holds, lens scans the text, plays backwards |
| tap | `dtaunt_strip16` | drift nudge + ripples |
| sleep | `pratfall_strip1` | one frame; drops with a bounce, Zzz floats up |
| highlight | `ftilt_strip7` | assumed to be a forward swing: swap it in `actionStrips` if not |
| erase | `jab_strip24` | clean punch while the scribble draws, then the text is rewritten |
| read / wave / cheer | `crouch` / `dtaunt` / `dtaunt` | stand-ins until you draw dedicated strips |

Change any of these in `actionStrips` (stick.config.js). Missing optional strips fall back automatically (`dash` -> `walk`, `jabFire` -> `jab`, ...).

Green colour too yellow/blue? Edit `greenFilter` (red is hue 0, green is about 120, so `hue-rotate(100deg)` to `hue-rotate(130deg)`).

## 4. API

```js
await stick.perform({ action: 'punch', target: wordRange, text: 'receive' });
```
See `CONTRACT-actor-api.md` for the full table. Also: `stick.stop()`, `stick.busy`, `stick.restore(el)`, `stick.notes`, `stick.config.speed = 1.5` (global speed for recording), `stick.setScale(3)`.

## 5. Putting it in the extension

`manifest.json` (Dev A owns this file, but these two blocks are what Stick needs):

```json
"content_scripts": [{
  "matches": ["<all_urls>"],
  "js": [
    "stick-module/stick.config.js",
    "stick-module/stick.js",
    "stick-module/bridge.js",
    "content/reading/reading.js"
  ],
  "run_at": "document_idle"
}],
"web_accessible_resources": [{
  "resources": ["stick-module/assets/*"],
  "matches": ["<all_urls>"]
}]
```

* Scripts in the same `content_scripts` entry share one world, so `reading.js` can simply call `stick.perform(...)` with real Elements and Ranges. List `stick.js` **before** it.
* Without `web_accessible_resources` the sprites will not load on web pages (you will see blank space where Stick should be).
* `assetBase` in `stick.config.js` automatically becomes the `moz-extension://` URL inside the extension.

**Dev B examples**
```js
// typo: burn the wrong word, write the right one (one call)
await stick.perform({ action: 'punch', target: range, text: 'receive' });

// confusion: inspect, then rewrite in place (with a "show original" button calling stick.restore(el))
await stick.perform({ action: 'magnify', target: paragraphEl });
const simple = await ai.simplify(paragraphEl.textContent, level);
await stick.perform({ action: 'erase', target: paragraphEl, text: simple });

// don't pile up requests while he is busy
if (!stick.busy) stick.perform({ action: 'tap', text: 'Back to it?' });
```

**Dev A examples** (background script)
```js
browser.tabs.sendMessage(tabId, { type: 'STICK_ACTION', cmd: { action: 'sleep' } });
browser.tabs.sendMessage(tabId, { type: 'STATE', state: { focus: 'drift' } });   // bridge.js decides what Stick does
```

**Stick in the sidebar** (tab animations belong here: web pages cannot draw over the browser's tab bar):
```html
<div id="stage" style="position:relative;height:100%"></div>
<script src="stick-module/stick.config.js"></script><script src="stick-module/stick.js"></script>
<script>const side = Stick.create({ container: document.getElementById('stage'), entrance: false, home: 'bottom-left' });
        side.perform({ action: 'walk', target: '#tab-card-3' });</script>
```
(Set `assetBase` to the right relative path for the sidebar page, e.g. `../stick-module/assets/`.)

## 6. Honest limits and things to check early

* **Test on the real demo sites** (YouTube, Wikipedia, your demo page). Some sites have a strict Content-Security-Policy; if the sprite never appears on one site but works on others, tell me and I will switch the renderer to canvas.
* Tested in headless Chromium, not in Firefox. It only uses standard APIs (Shadow DOM, Web Animations, `adoptedStyleSheets` with a fallback), but load it in `about:debugging` early and check.
* Typo punching works on normal text, `contenteditable` and any Range. It will **not** work inside canvas-based editors such as Google Docs. For `<textarea>`/`<input>`, Dev B must compute the word's coordinates (mirror-div) and pass `{x, y, width, height}`; the replacement of the value is then Dev B's job.
* Stick stands to the left of the word (or right, near the left screen edge) and briefly covers neighbouring text: that is the cost of a real punch.
* The fire on the word (burn, ember sparks, green glow) is CSS. The fire on the fist comes from your strip.
* `useTurns` is off until you have checked that `walkturn` / `dashturn` face the right way.

## 7. Add your own action without touching stick.js

```js
stick.defineAction('facepalm', async (cmd, h) => {
  await h.standUp();
  await h.play('taunt', { reverse: true });
  h.say(cmd.text || '...', 1500);
  await h.wait(1200);
  h.settle();
});
// stick.perform({ action: 'facepalm' })
```
Helpers (`h`): `walk, play, loop, settle, say, wait, rect, reveal, focusSpot, nearSpot, pow, ripple, embers, burnWord, igniteWord, makeFlyer, setFilter, setCard, setBook, resolveTarget, textOf, viewSize, makeGap, fillGap, dropGap`.
