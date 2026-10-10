## Stick Actor API (paste over the old section in CONTRACT.md)

```js
await stick.perform({ action, target, text, opts })   // -> Promise, resolves when the animation has finished
```

| action | what Stick does | target | text |
|---|---|---|---|
| `idle` | goes home to the corner, stands | none | none |
| `walk` / `run` | walks (or dashes) next to the target | Element, Range, selector, {x,y} | none |
| `punch` | red-fire jab burns the target away | Element or Range (a typo) | **optional**: if given, green fire writes it in afterwards |
| `correct` | green-fire jab writes `text` into the target (replace, or insert into a collapsed Range) | Element or Range | **required** |
| `magnify` | crouches, lens scans the paragraph | Element | none |
| `tap` | taunt strip + ripples (drift nudge) | optional | optional bubble |
| `sleep` | lies down (pratfall), Zzz | none | none |
| extras | `erase` (scribble + rewrite, `text` = new text), `highlight`, `carry` (note beside target, or copy to tray if no target), `read` (optional target; sits beside it, or reads at home), `wave`, `cheer`, `shrug`, `say` | varies | varies |

* `target` can be an Element, a Range, a CSS selector string, or `{x, y, width?, height?}` in viewport px.
* Calls are queued: `perform` never overlaps animations. `stick.stop()` cancels everything and goes home.
* `stick.busy` is true while anything is queued/running (use it to avoid piling up requests).
* `stick.restore(el)` puts back the original text after an `erase` rewrite ("show original" button).
* Over extension messages `target` must be a selector string or {x,y,...} (Elements cannot be serialised).
* `walk`, `run`, `magnify`, and `highlight` need a target. `punch` and `correct` need a word/Range; `erase` needs an Element. `idle`, `sleep`, and `say` do not need a target.
