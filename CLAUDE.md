# CLAUDE.md

Overgrown — a cozy pixel-art tactics roguelike that secretly teaches chess.
DESIGN.md is the source of truth for game design; PLAN.md tracks milestones.

## Commands

- `npm run dev` — Vite dev server
- `npm test` — Vitest, colocated `*.test.ts`
- `npm run build` — `tsc && vite build` → static `dist/` (Vercel zero-config)

## Architecture

Go straight to the file; don't grep `src/` for a concept.

| Want to change… | File |
|---|---|
| Board geometry, piece movement, threats, upgrades, the pin | `src/game/board.ts` |
| Fight loop, enemy AI, telegraphs, spread clock, Heart cornering, fork/swap/ward | `src/game/fight.ts` |
| Which clearings exist, their enemies/dials/intro text | `src/game/ladder.ts` |
| Run state, recruits, trinkets, upgrades, camp, spawn placement, critter blurbs | `src/game/run.ts` |
| Decision log, stages, replay, save format | `src/game/session.ts` |
| Shared types (`FightState`, `Piece`, `Kind`, events) | `src/game/types.ts` |
| Board drawing, fx, telegraph arrows | `src/render/scene.ts`; sprites in `sprites.ts`, UI icons in `icons.ts` |
| Region palettes / meadow backdrop | `src/render/themes.ts`, `backdrop.ts` |
| Sound | `src/audio.ts` |
| Screens & cards (title, intro, aftermath, camp, promotion) | `src/ui/screens.ts` (`stageUi` dispatches on `sess.stage`) |
| Card/overlay builders, theming, petals | `src/ui/overlay.ts` |
| Status line, trinket badges, roster chips, critter text | `src/ui/hud.ts` |
| Player move → enemy beat → hints/fx from events | `src/ui/turn.ts` |
| Tap/drag input, sound button | `src/ui/input.ts` |
| Canvas sizing, rAF loop | `src/ui/render.ts` |
| Save/scores/coach/journal in localStorage | `src/ui/storage.ts` |
| Trail map, clearing cast, title journal strip | `src/ui/trail.ts` |
| Look-back (replay history) | `src/ui/history.ts` |
| Dev panel | `src/ui/dev.ts` |
| Shared mutable UI state (`S.sess`, `S.fight`, `S.phase`…), timing constants | `src/ui/state.ts` |
| DOM shell & element refs | `src/ui/dom.ts` |
| Layout/CSS | `src/style.css` |

`src/game/` is pure and DOM-free; `src/ui/` modules import each other freely
(function-level cycles are fine — nothing runs at import time except `dom.ts`
building the shell). `src/main.ts` just boots. Tests are a few colocated
regressions in `src/game/*.test.ts`; keep the suite small.

## Hard rules

- **Integer pixel scaling only.** Sprites draw on whole pixels; the canvas
  scales by integer factors. No fractional offsets on the pixel grid.
- **Determinism.** All game logic randomness goes through the seeded RNG on
  the state (`mulberry32`), never `Math.random()`.
- **Never say "chess"** in any player-facing text. Critters, brambles,
  clearings — the vocabulary is the whole con.

## Gotchas

- Layout is a fixed flex column; `#board-area` must stay `flex-basis: 0` and
  `#hint` fixed-height, or the ResizeObserver → integer-rescale loop makes the
  board visibly "zoom".
- `#overlay` must keep a z-index above `#board-wrap` or the canvas eats taps.
- Enemy turns resolve against *committed* telegraphs that re-check legality at
  resolve time — a blocked enemy stays put and emits a `blocked` event. That's
  a feature (blocking is a tactic), not a bug; keep the UI feedback loud.
