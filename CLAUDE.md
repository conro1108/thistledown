# CLAUDE.md

Overgrown — a cozy pixel-art tactics roguelike that secretly teaches chess.
DESIGN.md is the source of truth for game design; PLAN.md tracks milestones.

## Commands

- `npm run dev` — Vite dev server
- `npm test` — Vitest, colocated `*.test.ts`
- `npm run build` — `tsc && vite build` → static `dist/` (Vercel zero-config)

## Architecture

- `src/game/` — pure, DOM-free logic (board/movement, fight loop, run state,
  seeded RNG). A handful of regression tests cover win/loss, telegraph
  resolve, and run generation. Keep the suite small; don't add edge-case tests.
- `src/render/` — canvas pixel renderer. Sprites are 12×12 char maps in
  `sprites.ts`.
- `src/main.ts` — orchestration: DOM, input, overlays, animation timing.

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
