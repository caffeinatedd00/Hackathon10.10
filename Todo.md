<div align="center">

# 🕴️ STICK: Team To-Do Lists

**Deadline: 3:45pm · Feature freeze: 3:00 · Record video: 3:15**

</div>

---

## 📍 Checkpoints (everyone)

| Time | Checkpoint |
|---|---|
| **11:45** | Repo created, folders assigned, `CONTRACT.md` committed, API key tested |
| **12:00** | Mocks exist: fake `ai.js` responses and a fake `stick.perform()`, so nobody waits on anybody |
| **12:45** | **Integration 1:** extension loads in Firefox, Stick appears, one state message reaches him |
| **2:00** | **Integration 2:** all must-haves work individually, merged to `main` |
| **3:00** | **FEATURE FREEZE.** Only bug fixes and demo rehearsal from here |
| **3:15** | Record the video (30 min buffer for retakes) |
| **3:30** | Upload and submit on Devpost (do not leave this to the last minute) |

---

## 📁 Repo layout (one owner per folder = no merge conflicts)

```
stick/
├── manifest.json            ← Dev A
├── CONTRACT.md              ← Abdulla (copy of the contracts below)
├── background/              ← Dev A  (engine, tabs, state, idle)
├── sidebar/                 ← Dev A + Abdulla (tab groups UI, session recap)
├── content/
│   ├── reading/             ← Dev B  (dwell, confusion, typos, glossary, shield)
│   └── stick/               ← Abdulla (character, animations, Actor API)
├── ai/ai.js                 ← Gemini person
└── demo/                    ← Abdulla (demo page, script, test text)
```

**Rules:** work on your own branch, merge to `main` at the checkpoints, and never edit someone else's folder without telling them.

---

## 🔌 Contracts (the glue, agree these first)

### 1. `ai.js` (Gemini person builds, everyone calls)
```js
nameGroup(titles[])                          // → string  (2-3 word group name)
simplify(text, level = 1)                    // → string  (level 1-3, higher = simpler)
summarise(text)                              // → string  (3 bullet points max)
briefing({ task, sleeping, lastSection, deadlines }) // → string (one line)
define(term, context)                        // → string  (one sentence, in context)
checkText(text)                              // → [{ wrong, suggestion }]  (context-aware)
quip(state)                                  // → string  (max 8 words, in Stick's voice)
```

### 2. Stick Actor API (Abdulla builds, Dev A and Dev B call)
```js
stick.perform({ action, target, text })   // → Promise, resolves when the animation finishes
// action: "walkTo" | "punch" | "carry" | "magnify" | "erase" | "highlight"
//         | "sleep" | "read" | "tap" | "wave" | "say" | "idle"
// target: Element | Range | {x, y}
// text:   optional (corrected word, speech bubble text, replacement text)
```
Devs call `await stick.perform({action:"punch", target: wordRange, text:"receive"})` and never think about animation.

### 3. Messages
```js
STATE:  { task, focus: "flow"|"drift"|"stuck", reading: "ok"|"confused" }   // engine → everyone
PARAGRAPH_CONFUSED: { id, text }                                              // Dev B → engine
```

---

## 🧍 ABDULLA: Stick, character, presentation, oversight

### Setup (11:30 – 12:00)
- [ ] Create the repo, folders and `CONTRACT.md`, invite everyone
- [ ] Write the **mock `stick.perform()`** (logs the action and resolves after 500ms) and commit it so devs can integrate before any animation exists
- [ ] Agree prompt style and Stick's voice with the Gemini person (see Personality below)

### Stick overlay shell (by 12:45)
- [ ] Content script that injects a container using **Shadow DOM** (so page CSS cannot break him)
- [ ] `position: fixed`, `pointer-events: none` except on Stick himself, highest z-index
- [ ] Action queue so animations never overlap
- [ ] `walkTo(target)`: scroll the target into view, get its position with `getBoundingClientRect()`, walk Stick there

### The rig and animations (priority order)
- [ ] SVG stickman rig: head, body, two arms, two legs as groups with correct transform origins
- [ ] **1. idle** (breathing, blink) and **walk** (limb rotation cycle, flip direction)
- [ ] **2. punch** (windup, strike, recoil)
- [ ] **3. carry** (holds a word or tab card above his head)
- [ ] **4. magnify** (magnifying glass over a paragraph)
- [ ] **5. sleep** (lies down, floating Zzz)
- [ ] 6. read / sit (book), tap (taps the inside of the screen), wave
- [ ] Optional: pixel-art skin later if everything else is done

### Page interactions (the cool part)
- [ ] **Typo punch:** Stick walks to the misspelt word, punches it, the word shakes and flies off, then he walks in carrying the corrected word and drops it into place
- [ ] **Erase and rewrite:** for a confused paragraph, he scribbles over it with an eraser, then the simplified text writes itself in
- [ ] **Highlighter:** re-read passages get marked with his highlighter
- [ ] **Distraction block:** during flow he stands in front of a distraction site's overlay with arms crossed
- [ ] **Copy carry:** when you copy text he carries it to a little notes tray in the corner
- [ ] **Definition card:** on a glossary hover he carries a small card over to the word
- [ ] Speech bubble component (max 8 words, scribbled-font style)

### Personality (keep it consistent)
- [ ] Silent by default; mostly sits still. He moves only when the engine acts, which is the Invisible AI point
- [ ] A few small quirks: yawns after long idle, looks around when you switch tabs fast, shrugs when a rewrite fails
- [ ] Give the Gemini person a persona line for `quip()`, for example: "Stick is a quiet, dry-humoured stickman. Never more than 8 words."

### Presentation and submission
- [ ] **Demo page and script (by 2:00):** a dense paper or Wikipedia article for the confusion demo, a text box with deliberate typos, 15 to 20 tabs across 2 or 3 tasks, one YouTube distraction
- [ ] Storyboard the 3-minute video (problem 0:30, demo 1:45, architecture 0:30, close 0:15)
- [ ] Slides for the problem and architecture sections
- [ ] **Start the Devpost entry by 2:30:** project name, description, built-with list (the form takes longer than you think)
- [ ] Rehearse the demo twice, record at 3:15, upload and submit by 3:30

### Oversight
- [ ] Run Integration 1 (12:45) and Integration 2 (2:00): everyone's code loaded together in Firefox
- [ ] Call the feature freeze at 3:00 and cut anything not working
- [ ] Prepare the "why this architecture?" answers with the Gemini person

---

## 🤖 GEMINI PERSON: AI integration

### Setup (11:30 – 12:00)
- [ ] Get the API key working from a plain script first
- [ ] Store the key in a **gitignored** config file or the extension's local storage. **Never commit it**
- [ ] Create `ai.js` with all 7 functions returning **mocked responses** and push it by 12:00

### Real implementation (by 2:00)
- [ ] One shared `callGemini(prompt, schema)` helper with an 8-second timeout and a fallback string
- [ ] Use **JSON output** (response mime type JSON plus a schema) for `checkText` and anything structured, and parse defensively
- [ ] `nameGroup`, `summarise`, `briefing`, `define`, `simplify(text, level)`
- [ ] `checkText`: returns only genuinely wrong words with a suggestion, using context (their/there)
- [ ] `quip(state)`: persona prompt for Stick's voice, max 8 words
- [ ] **Cache** every response by input hash in `storage.local`, and **pre-warm** the cache with the demo content
- [ ] Debounce and rate-limit so rapid events cannot burn your quota
- [ ] Measure latency per function: use the strongest model for summaries and briefings, and a faster tier (if you have one) for `checkText` and `define`

### With Abdulla
- [ ] Agree Stick's voice and the exact output formats
- [ ] Write the presentation paragraph: **where the LLM is used, where it is not, and why** (language only, with detection kept local)

### If you finish early
- [ ] Help Dev A with the embedding pipeline or Dev B with the typo checker

---

## ⚙️ DEV A: Engine and tabs

### Skeleton (first 30 minutes, everyone is waiting on this)
- [ ] `manifest.json`: Manifest V3, background as `scripts` (Firefox event page), permissions `tabs`, `storage`, `idle`, `activeTab`, optionally `tabHide`, host permission `<all_urls>`, plus a `sidebar_action`
- [ ] Load it via `about:debugging` → *This Firefox* → *Load Temporary Add-on*, then tell the team
- [ ] Message passing wired between background, content script and sidebar

### Engine (by 2:00)
- [ ] **Signal collector:** log `tabs.onActivated / onCreated / onRemoved / onUpdated` with timestamps and compute the tab-switch rate
- [ ] **State machine:** produce `{task, focus}` and broadcast `STATE` to content scripts
- [ ] **Demo mode:** one config object with shortened thresholds (for example sleep after 30s) **and** a hidden hotkey to force a state as a safety net. Real detection stays in the main path
- [ ] **Embeddings:** transformers.js (MiniLM) in a worker. **Bundle the model files inside the extension** so it works offline and avoids CSP and network issues. **Time-box this to 45 minutes.** If it fights you, fall back to TF-IDF or keyword overlap on title, description and first 500 characters
- [ ] **Clustering:** assign each tab to the nearest cluster if similarity is above a threshold, else start a new one, then call `nameGroup()`
- [ ] **Auto-sleep:** `tabs.discard()` for tabs that are inactive and off-task, restore when the task returns or a group is clicked
- [ ] **Sidebar UI:** groups list, click a task to show only its tabs (`tabs.hide/show`), sleeping tabs marked

### Cheap wins (after the above works)
- [ ] Duplicate catcher: normalise URLs, close the dupe, jump to the original
- [ ] Break nudge and AFK nap using `browser.idle`
- [ ] Welcome-back briefing: on idle to active, call `briefing()` and send `stick.perform({action:"wave", text})`
- [ ] Tab-count mood: send tab count so Stick can change expression
- [ ] Session log and recap panel (time per task, tabs slept, confusions resolved)

> ⚠️ **Heads-up:** web pages cannot draw over the browser's tab bar, so Stick physically moving tabs has to happen **in the sidebar** (he lives there too) or in an in-page tab tray. Plan the tab animations for the sidebar.

---

## 📖 DEV B: Reading and page

### Scaffold (by 12:45)
- [ ] Content script on all pages that tracks paragraphs (`p, li, h1-h6, blockquote`) with `IntersectionObserver`
- [ ] Dwell time per paragraph, plus a scroll-back counter when the user returns to one

### Confusion and rewrite (by 2:00)
- [ ] **Confusion rule:** dwell above a threshold scaled by paragraph length, **and** at least one scroll-back to it. Thresholds live in the demo-mode config
- [ ] On trigger: `stick.perform({action:"magnify", target:el})`, then `simplify(text, level)`, then `stick.perform({action:"erase"...})` and swap the text
- [ ] "Show original" toggle on every rewritten paragraph
- [ ] Reading-level adaptation: increase `level` each time confusion repeats

### Typo punching
- [ ] Listen to `input` on `contenteditable` and `textarea`, debounced about 700ms
- [ ] **Local dictionary check** (nspell with an en-GB dictionary) for instant detection, so the punch is not waiting on the network
- [ ] Optionally send the sentence to `checkText()` for context errors the dictionary cannot catch
- [ ] For `contenteditable`: get the word's position via a `Range` and call `stick.perform({action:"punch", target:range, text:correction})`
- [ ] For `textarea`: use the mirror-div technique to find the word's coordinates
- [ ] **Demo on a plain `contenteditable` page.** This will not work in canvas-based editors such as Google Docs

### More page features
- [ ] Auto-glossary: hover on a word for about 2 seconds, call `define(term, context)`, show a tooltip
- [ ] Distraction shield: on listed domains during `flow`, dim the page and show a "5 more minutes" button
- [ ] Skim summary (fast scroll plus low dwell calls `summarise()`)
- [ ] Auto-notes: save re-read passages to `storage.local`
- [ ] Copy capture: `copy` event saves text, URL and title, with Markdown export
- [ ] Resume where you left off: save `scrollY` and the nearest heading per URL (feeds the briefing's "stopped at section 4")

---

## 🧰 Everyone: working with gen AI

- **Paste `CONTRACT.md` into every AI prompt** so generated code matches the interfaces
- Ask for **one small module at a time** and test it before the next
- Test in Firefox via `about:debugging`; reload the add-on after each change
- Commit often, merge only at checkpoints, and say in the group chat when you change a contract
- Be able to **explain every line you submit**. Technical depth means the judges will ask why you chose it

---

## ✂️ If time runs short, cut in this order

1. Comic strip / long-term profile (already stretch)
2. Skim summary, deadline radar
3. Sleep and tab-count animations
4. Cheap wins (dupe catcher, copy capture)

**Protect:** Stick overlay, task regrouping, confusion rewrite, typo punch, welcome-back briefing.