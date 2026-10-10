<div align="center">

# 🕴️ STICK

### **S**ilent **T**ask-aware **I**ntelligence **C**ompanion for **K**nowledge work

> *Your browser had no idea what you were doing. Stick does.*

**QMUL AI Hackathon · Theme: Invisible AI · Submission deadline: 3:45pm**

</div>

---

## 🎯 The Pitch

STICK is a Firefox extension that quietly watches **how** you browse, not just **what** you browse, and acts on its own. A small stickman named **Stick** lives on your pages as his body language: he only moves when the engine has decided something is worth doing. Nobody types to him. There is no chatbot.

**The problem:** students lose hours to tab chaos, distraction and dense reading, and every existing tool waits for you to ask.

**The Invisible AI answer:** the intelligence is invisible, and Stick is its body language.

---

## 🧠 The Engine: three things it tracks

| State | What it means | Signals used |
|---|---|---|
| 🗂️ **Task** | What you are working on | Local overlap of tab-title and hostname terms |
| 🎧 **Focus** | Flow, stuck, or drifting | Tab-switch rate and time on the active tab |
| 📖 **Comprehension** | Reading smoothly or confused | Scroll-backs, re-reading, dwell time per paragraph |

Every feature is just an **action the engine takes** when a state changes. That is what makes it one product and not a pile of features.

---

## ✅ Scope

### Must-haves (the demo is built on these)
- [x] Calibrated sprite Stick is injected as an overlay and reacts to state/action messages
- [x] Tabs are grouped in the sidebar using local title/hostname similarity and named via `nameGroup()`
- [x] Re-reading/slow-dwell signals can offer a reversible paragraph simplification; saving notes is user-initiated
- [x] Returning after an idle break triggers a welcome-back briefing
- [x] Inactive tabs can be manually snoozed per task group; the active tab is protected and clicking a snoozed tab restores it. Automatic snoozing is not enabled.

### Additional implemented features
- [x] The reader can save a summary after a substantial skim pattern or explicitly summarise selected text
- [x] Summaries and user-saved notes persist in the sidebar and can be edited/copied/deleted
- [x] Selecting text and right-clicking offers Stick actions to summarise, paraphrase, or save it to Notes
- [x] The sidebar keeps an activity history for regrouping, reading help, proofreading and saved work
- [x] Focus state is inferred from rapid tab switching and sustained active-tab time
- [x] The typo checker can offer a reviewable batch of spelling corrections in ordinary text fields, search boxes and `contenteditable` editors

### Not integrated yet

- Automatic tab discard/sleep and group-based tab hiding
- Embedding-based task clustering, distraction-site shielding, and tab-count mood
- Auto-glossary, copy capture, resume position, deadline radar, and session recap
- Google Docs/canvas-editor typo correction (canvas editors do not expose editable text ranges)

These remain follow-up work; they are not implied by the current demo.

### Stretch (probably cut)
- [ ] End-of-day stick-figure comic strip of your session
- [ ] Long-term local learning profile

> **Cut order if time runs short:** comic strip → summaries → auto-sleep animation.
> **Protect at all costs:** confusion detection, task regrouping, auto-notes. These are what make STICK different from Firefox's built-in features.

---

## 🧍 Stick: behaviours and animations

| Engine state | What Stick does | Animation |
|---|---|---|
| Idle / nothing to do | Stands or sits in a corner | `idle` |
| Task changes, tabs regroup | Drags tabs into labelled piles | `walk`, `carry` |
| Tab unused and off-task | Carries it off to a tiny bed | `carry` |
| In flow | Sits down with a book, notifications held | `read` |
| Drifting | Taps on the inside of the screen | `tap` |
| Confused paragraph | Magnifying glass, rewrites it simpler | `magnify` |
| Back from a break | Waves, one-line briefing | `wave` (optional) |

**Limit to 6 animations:** idle, walk, carry, read, tap, magnify (plus wave if time allows).

**Art route:** calibrated pixel-art sprite strips, rendered in the isolated Stick actor module. The extension loads the same `stick.perform()` API used by the playground.

### Current integration map

- `engine.js` groups open web tabs locally, broadcasts task/focus state, and sends the welcome-back action.
- Group names are generated from the tab titles locally when the AI key is unavailable; enabling Gemini can supply generated names instead.
- `inbox.js` keeps local history of tab regrouping, reading support, proofreading and saved notes/summaries; the sidebar is the history hub. Inactive group tabs can be snoozed explicitly and are restored by selecting them.
- `ai.js` provides the shared language API and cache; it defaults to mock/fallback responses unless configured.
- `reading.js` tracks visible text and re-reads without creating notes automatically. `glue.js` offers opt-in reading help, larger-article summaries, selection actions, and briefing flows.
- `Stickman/stick-module/stick-module/` contains the calibrated sprite actor, its configuration, bridge, and standalone playground.
- `sidebar.js` displays current tab groups plus saved summaries and notes, and drives a larger sidebar Stick: he greets task changes, reads during focus, taps on drift, and asks before offering reading help. The content-page Stick remains the one that walks to and acts on real page text.

The Gemini key is optional for local/demo operation. Keep `key.env` local and untracked; do not paste its value into source or messages.

## 🖥️ Presentation mockup

Open `mockup.html` directly for a standalone, repeatable video walkthrough. Select **Play showcase** and record the sequence: task workspaces, a user-approved reading simplification, a source-linked note, and one-pass proofreading. The calibrated sprite module powers Stick’s movements and speech bubbles.

The example browser includes recognizable PubMed, Google Scholar and QMplus pages with clearly marked sample content. Their links open the real services in a new tab, but the mock pages do not scrape or alter those sites. The Firefox extension itself runs on supported real web pages, subject to browser permissions and editor limitations.

The demonstration is intentionally candid: observable rereading/dwell signals are only hints that a reader *may* want help, not proof of confusion; the extension asks before simplifying. Notes are saved only when requested. Select text and right-click to ask Stick to summarise, paraphrase, or save it. Paraphrasing animates erasing and rewriting just the selected text, with an undo option. Automatic skim summaries require a substantial article; selected text can be summarised at any length. Task workspaces group tabs in the sidebar without moving or closing them, snoozing is an explicit per-group action that leaves the tab available to restore, focus mode does not block sites, and spelling suggestions are reviewed before one batch is applied. The original passage/draft can be restored or undone. Ordinary text inputs and contenteditable editors are supported; canvas-based editors such as Google Docs remain unsupported. The mockup does not invent deadlines or connect to live AI.

### Recording the Firefox demo

1. In Firefox, open `about:debugging#/runtime/this-firefox` and load this project's `manifest.json` as a temporary add-on.
2. Open the STICK sidebar, then visit the real PubMed, Google Scholar and QMplus pages you plan to show. The sidebar groups available tabs; the content script/Stick can only run where Firefox grants the extension access.
3. Select a paragraph on a real page and right-click to demonstrate Stick’s selection actions. Use the local `mockup.html` **Play showcase** for the repeatable story and sample draft; keep its **SIMULATED PAGE** notice visible, and open real sites separately.

---

## 👥 Team and Roles

| Who | Owns | Delivers |
|---|---|---|
| **Abdulla** | Stick (art and animation), overlay UI, presentation, demo script and video, code oversight | Sprite or SVG pack, overlay component, 3-min video |
| **Gemini person** | `ai.js` | `nameGroup()`, `simplify()`, `summarise()`, `briefing()`, plus response caching |
| **Dev A: Engine and tabs** | Background script | Signal capture, state model, clustering, auto-sleep and restore |
| **Dev B: Reading** | Content script | Scroll and dwell tracking, confusion detection, in-page rewrite, summary |

---

## 🔌 Interface Contracts (agree these first)

**`ai.js`** (Gemini person)
```js
nameGroup(titles[])                         // → string
simplify(text)                              // → string
summarise(text)                             // → string
briefing({ task, sleeping, lastSection })   // → string
```

**State message** (engine → overlay)
```js
{ task, focus: "flow" | "drift" | "stuck", reading: "ok" | "confused" }
```

**Action message** (any module → overlay)
```js
{ action: "walk" | "carry" | "read" | "tap" | "magnify" | "wave", text? }
```

**Rules of the road**
- The Gemini person hard-codes fake responses on day one so everyone can build against it straight away.
- Keep the API key out of git: use extension local storage or a gitignored config file.
- Cache every Gemini response for your demo content so a rate limit or slow network cannot ruin the recording.

---

## 🛠️ Stack

- **Firefox WebExtension** (Manifest V3): background script (engine), content script (signals and rewrites), sidebar (tab groups UI)
- **transformers.js**: local embeddings, so browsing data never leaves the machine (your privacy and architecture argument)
- **Gemini API**: language only (naming groups, simplifying text, summaries, briefings)
- **Check early:** whether your Firefox version has the tab groups API. If not, render groups in your own sidebar.

---

## ⏱️ Timeline

| Time | Milestone |
|---|---|
| **11:30** | Interfaces agreed, repo set up, everyone starts |
| **12:45** | Skeleton integrated: extension loads, Stick appears, state messages flow |
| **2:00** | All must-haves working individually |
| **3:00** | **Feature freeze.** Rehearse the scripted demo |
| **3:15** | Record the video (30 minutes of buffer for retakes) |
| **3:45** | **Submission deadline** |

