# Thistledown — Implementation Plan

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
- [ ] Camp: heal shaken early, snacks (small permanent buffs)
- [ ] First trinkets (3–5, run-defining passives)
- [ ] Region-2/3 boss with the cornering (no-safe-square) rule
- [ ] Mid-run save (localStorage; serialize seed + decision log)
- [ ] Sound: WebAudio chiptune, captures pop into flowers
- [ ] Real art pass (current sprites are placeholders-with-charm)
- [ ] Stalemate guard (a "wait" action, or detect no-legal-moves)
- [ ] Balance pass on the fight ladder (current numbers are a guess)

## P3 — Later

Events, node-map branching, meta unlocks, bestiary, ascension, daily seed, PWA,
mobile layout pass, Cozy Sprites cameo.

## Decisions so far

- **Name: Thistledown** (not chess-y on purpose).
- Pure capture both ways, no HP (bosses will be the exception later).
- Telegraphs are re-checked for legality when they resolve — so blocking a thistle
  head-on works (pawns can't capture forward; the game must teach true blocking).
- Enemy acts-per-turn is the main difficulty dial (1 → 3 across a run).
- Mutating fight state + seeded RNG. Determinism is good enough for now; strict
  decision-log replay arrives with saves.
- Sprites are 12×12 pixel maps validated by a unit test (row lengths, palette chars).
