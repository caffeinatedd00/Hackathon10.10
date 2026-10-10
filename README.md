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
| 🗂️ **Task** | What you are working on | Page embeddings, tab switching, which tab opened from which |
| 🎧 **Focus** | Flow, stuck, or drifting | Tab-switch rate, time on distraction sites, typing rhythm |
| 📖 **Comprehension** | Reading smoothly or confused | Scroll-backs, re-reading, dwell time per paragraph |

Every feature is just an **action the engine takes** when a state changes. That is what makes it one product and not a pile of features.

---

## ✅ Scope

### Must-haves (the demo is built on these)
- [ ] Stick appears as an overlay and reacts to engine state
- [ ] Tabs regroup by task, get named automatically, and unused ones auto-sleep
- [ ] Confusion detection that simplifies the paragraph in place
- [ ] Welcome-back briefing after a break

### Should-haves (only once the above work)
- [ ] Flow and drift nudges (simple version: tab-switch rate plus a distraction-site list)
- [ ] Page summary when you are skimming a long page
- [ ] Auto-notes from passages you re-read

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

**Art route:** SVG/CSS stickman (head, body line, four limbs rotated by CSS keyframes). About an hour for a walk cycle and it scales cleanly. Pixel art (32x32 in Piskel, sprite strips played with CSS `steps()`) looks cooler but costs more time per animation.

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

**Why this architecture? (be ready for the judges)** Detection runs locally for privacy and speed. The LLM is only used where language is needed, so the core logic stays explainable and works offline.

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

---

## 🎬 3-Minute Video Outline

| Time | Section |
|---|---|
| 0:00 – 0:30 | **Problem:** 40 tabs, distraction, dense reading, and every tool waits for you to ask |
| 0:30 – 2:15 | **Live demo:** regroup, sleep, confusion rewrite, briefing |
| 2:15 – 2:45 | **Architecture:** the engine, local embeddings, Gemini only for language |
| 2:45 – 3:00 | **Close:** *"Your browser had no idea what you were doing. Stick does."* |

**Judging criteria to hit:** Creativity (the character plus a new signal nobody senses today) · Implementation (a demo that visibly works) · Impact (a relatable student problem) · Technical depth (local embeddings, state engine, justified choices).

---

## ⚠️ Honest Warnings

1. **Pre-build a scripted demo session:** a dense paper, 15 to 20 tabs across 2 or 3 tasks, one YouTube distraction. Live detection will be fuzzy, so tune thresholds for your demo path and rehearse it.
2. **Build the engine first, then skin it.** A cute Stick on top of broken detection loses Implementation and Technical depth.
3. **Animation is the biggest time sink.** Stay at 6 animations and do not polish before the engine works.
4. **Do not add features after 3:00.** One thing working live beats three half-working.
5. **Stick is original.** Take inspiration from the stick-figure-on-your-screen idea, but keep his own name, colour and quirks so he is clearly yours.