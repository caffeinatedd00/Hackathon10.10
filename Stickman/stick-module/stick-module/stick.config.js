/*
 * stick.config.js — the ONLY file you need to edit to wire up your sprite strips.
 * Load it BEFORE stick.js:   <script src="stick.config.js"></script><script src="stick.js"></script>
 *
 * How strips work
 *   - Every strip is a horizontal row of equal-width frames. The frame count is read from the
 *     filename (`idle_strip8.png` -> 8 frames) and the frame size is auto-detected from the image
 *     (frame width = image width / frames, frame height = image height).
 *   - Your PNGs go in  stick-module/assets/   (copy your Custom/ folder contents there).
 *   - If a file is missing, the module falls back to assets-placeholder/ so nothing crashes.
 *
 * Calibration (do this once, 5 minutes): open playground.html, scroll to "Calibrator", pick a strip,
 * scrub to the frame where the fist lands, click the fist, click the feet. It prints the numbers to
 * paste below (hit, anchor, impact).
 *
 * Coordinates are FRACTIONS of one frame: x 0 = left edge, 1 = right edge; y 0 = top, 1 = bottom.
 */
window.STICK_CONFIG = {
  // Where the PNGs live. In the extension this becomes a moz-extension:// URL (the folder must be listed
  // in manifest.json -> web_accessible_resources, see README).
  assetBase: (typeof browser !== 'undefined' && browser.runtime && browser.runtime.getURL)
    ? browser.runtime.getURL('stick-module/assets/')
    : 'assets/',
  fallbackBase: 'assets-placeholder/',

  facesRight: true,        // set false if your sprites face LEFT in the PNGs
  scale: 0,                // 0 = automatic integer scale from targetHeight; or set 1, 2, 3 ...
  targetHeight: 220,       // on-screen height (px) of one frame when scale is automatic
  anchor: { x: 0.5, y: 0.92 },   // default "feet" point inside a frame (calibrate!)
  autoContrast: true,      // invert black/dark sprites to white on dark page backgrounds

  walkSpeed: 150,          // px/second while walking: tune until the feet stop sliding
  runSpeed: 430,           // px/second while dashing
  useTurns: true,          // play walkturn / dashturn strips when changing direction

  greenFilter: 'hue-rotate(110deg) saturate(1.5)',   // turns only the fire overlay green for the "correct" jab

  strips: {
    idle:      { file: 'idle_strip8.png',            fps: 8,  loop: true, anchor: { x: 0.512, y: 0.604 } },
    walk:      { file: 'walk_strip8.png',            fps: 12, loop: true, anchor: { x: 0.508, y: 0.628 } },
    dash:      { file: 'dash_strip12.png',           fps: 18, loop: true, anchor: { x: 0.492, y: 0.612 } },
    dashstart: { file: 'dashstart_strip3.png',       fps: 14, optional: true, anchor: { x: 0.512, y: 0.616 } },
    dashstop:  { file: 'dashstop_strip2.png',        fps: 10, optional: true },
    walkturn:  { file: 'walkturn_strip2.png',        fps: 10, optional: true, anchor: { x: 0.504, y: 0.62 } },
    dashturn:  { file: 'dashturn_strip2.png',        fps: 10, optional: true },

    // red-fire jab: the typo-buster. impact = frame number where the fist lands (0-based).
    jabFire:   { file: 'jab_fire_strip20.png',       fps: 24, impact: 13, hit: { x: 0.727, y: 0.464 }, anchor: { x: 0.512, y: 0.616 }, overlay: 'jabFireEffect' },
    jabFireEffect: { file: 'jab_fire_draw_strip20.png', fps: 24, optional: true },
    jabFire2:  { file: 'jab_fire_strip20.png',       fps: 24, impact: 10, hit: { x: 0.82, y: 0.32 }, optional: true },
    jab:       { file: 'jab_strip24.png',            fps: 28, impact: 12, hit: { x: 0.82, y: 0.32 } },
    jabDraw:   { file: 'jab_draw_strip24.png',       fps: 28, impact: 12, hit: { x: 0.82, y: 0.32 }, optional: true },

    crouch:    { file: 'crouch_strip12.png',         fps: 14, focus: { x: 0.80, y: 0.62 }, anchor: { x: 0.508, y: 0.608 } },
    taunt:     { file: 'dtaunt_strip16.png',         fps: 14, focus: { x: 0.78, y: 0.35 } },
    ftilt:     { file: 'ftilt_strip7.png',           fps: 14, focus: { x: 0.85, y: 0.45 }, optional: true, anchor: { x: 0.57, y: 0.628 } },
    pratfall:  { file: 'pratfall_strip1.png',        fps: 1,  loop: true, anchor: { x: 0.516, y: 0.671 } }
  },

  // Which strip plays for which action (change these to re-skin an action without touching code).
  actionStrips: {
    punch: 'jabFire',        // red fire burns the wrong word
    correct: 'jabFire',      // same strip + greenFilter writes the right word in
    erase: 'jab',            // clean punch, then the paragraph is rewritten
    magnify: 'crouch',       // squats down to inspect the text
    tap: 'taunt',            // drift nudge
    highlight: 'ftilt',      // forward swing while the marker sweeps
    wave: 'taunt',            // dtaunt has a raised-arm gesture; use as the greeting until a wave strip exists
    cheer: 'taunt',
    sleep: 'pratfall',
    read: 'crouch'           // sitting/reading pose until you add a dedicated strip
  }
};
