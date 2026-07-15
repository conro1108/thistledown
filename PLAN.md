# Overgrown — Implementation Plan

Living doc: check things off, reorder freely. DESIGN.md holds the vision; this holds the
build order. Rule: thin vertical slice first (one playable fight e2e), then features by
priority. Don't overspec ahead of what's built.

## Approach

- Cozy Sprites stack: Vite + vanilla TypeScript, canvas renderer, Vitest colocated tests.
- `src/game/` is pure and DOM-free (all logic tested there); `src/render/` draws;
  `src/main.ts` wires.
- Deploy: static `dist/` via `npm run build`, Vercel with the Vite preset — no config.

## P0 — Core e2e (a playable fight in the browser) — DONE

- [x] Scaffold: Vite + TS + Vitest, index.html, styles
- [x] Engine: movement + threat generation for all 11 kinds (tests)
- [x] Fight loop: telegraph → player move → resolve → re-telegraph; win/lose (tests)
- [x] Renderer: tiles, pixel sprites, move highlights, telegraphs, hover threat overlay
- [x] Input + HUD: select/move, hint text, win/lose overlays

## P1 — The run — DONE

- [x] Fight ladder: 6 escalating fights (board size, enemy kinds, acts-per-turn)
- [x] Recruit choice between fights (the movement blurb IS the teaching moment)
- [x] Shaken: captured friends sit out the next fight, then recover
- [x] Run win/lose flow

## P2 — Next up, in rough priority

- [x] Promotion: a sprout reaching the far edge evolves mid-fight (choice of
      hopper/slink/rumble; the evolution sticks to that companion for the run)
- [x] **Mobile UX pass** (playtest feedback: enemy move was invisible, no stated
      goal, dead vertical space, roster chips weren't real buttons):
  - engine split — `playerMove` and `resolveEnemyTurn` are now separate calls,
    so the UI can show "your move landed" and "the bramble moves…" as two
    distinct, watchable beats (pause → resolve → tween slide) instead of an
    instant state swap
  - full `100dvh` flex layout that actually fills the viewport; a square
    board is inherently width-capped on a tall phone screen, so the leftover
    space is now a cozy sky/sun/cloud backdrop instead of a void
  - roster entries are real `<button>`s (mini sprite + name + piece title),
    tappable, with a selection ring and disabled/greyed state for shaken or
    already-captured-this-fight companions
  - persistent goal line + a 3-swatch legend (you can go / they'll go /
    they'll strike) under the header, so the color language is explained
    once and stays visible instead of living only in hover text
  - tap-to-inspect works for the touch case (mousemove-only hover doesn't
    fire on a phone) — tapping any piece, friend or enemy, shows its threat
    squares, not just its owner's move squares
- [ ] Camp: heal shaken early, snacks (small permanent buffs)
- [ ] First trinkets (3–5, run-defining passives)
- [ ] Region-2/3 boss with the cornering (no-safe-square) rule
- [ ] Mid-run save (localStorage; serialize seed + decision log)
- [ ] Sound: WebAudio chiptune, captures pop into flowers
- [ ] Real art pass (current sprites are placeholders-with-charm)
- [ ] Stalemate guard (a "wait" action, or detect no-legal-moves)
- [ ] Balance pass on the fight ladder (current numbers are a guess)

## P3 — Later

Events, node-map branching, meta unlocks, bestiary, ascension, daily seed, Cozy
Sprites cameo, a proper battle log (right now there's no persistent record of
"what just happened," which would help further).

## PWA — DONE (basic)

- [x] `manifest.webmanifest`, hand-rolled pixel-art icons (no image-library
      dependency — `scripts/make-icons.mjs` is a from-scratch PNG encoder),
      iOS home-screen meta tags
- [x] `public/sw.js` — network-first with cache fallback. Deliberately not a
      hashed-asset precache list (no build-tool integration yet); bump
      `CACHE` in that file when a release must invalidate old assets
- [ ] Actually installing this on an iPhone and confirming it launches
      standalone hasn't been done by a human yet — worth checking before
      calling PWA support solid
- [ ] Capacitor/native wrapper is a "maybe someday," not started

## Decisions so far

- **Name: Overgrown** (not chess-y on purpose).
- Pure capture both ways, no HP (bosses will be the exception later).
- Telegraphs are re-checked for legality when they resolve — so blocking a thistle
  head-on works (pawns can't capture forward; the game must teach true blocking).
- Enemy acts-per-turn is the main difficulty dial (1 → 3 across a run).
- Mutating fight state + seeded RNG. Determinism is good enough for now; strict
  decision-log replay arrives with saves.
- Sprites are 12×12 pixel maps validated by a unit test (row lengths, palette chars).
