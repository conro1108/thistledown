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
- [x] Enemy AI plays the whole side's best move (was round-robin activation,
      which visibly left free captures on the table)
- [x] Stalemate guard: `playerHasMove()` + the UI auto-waits, loudly, when
      the whole band is hemmed in
- [x] Camp (before clearings 3 and 5, pick one comfort): Warm mash heals all
      shaken now; Honeycake makes one companion permanently *spry* — a plain
      non-capturing one-step, so attack patterns stay true to the piece
- [x] First trinkets: Dandelion Cloak (once per fight a caught friend — the
      Keeper included — retreats to the home row), Acorn Whistle (hoppers are
      spry), Second Breakfast (first move each fight can be two moves). Free
      pick-of-two after clearing 1; one more may appear at each camp
- [x] Boss: The Bramble Heart (7th fight). Steps like a keeper, can't be
      landed on; beaten when its square and every escape square are covered.
      It dreads covered squares and stands still rather than step into danger
- [x] Mid-run save: `session.ts` decision-log state machine (seed + log in
      localStorage, replayed to reconstruct — never raw board state); title
      screen offers "Keep going", resumes mid-fight
- [x] **AI dials** (`AiDials` on the fight): foresight (recapture math on real
      piece values + "the player will just take me first" preemption — kills the
      pawn-chain free-tempo ride), caution (won't hang itself on covered
      squares), bloodlust, temperature. Region 1 stays naive on purpose:
      punishing the greedy bramble is the lesson
- [x] **Spread clock** (anti-stall): past `after` turns a far-edge square is
      marked, next turn a thistle sprouts there (every `every`, up to `cap`).
      Standing on the mark smothers it. Blocking stays a tactic; camping a dead
      position stopped being free (this was the promotion-farm fix)
- [x] **Telegraph degradation**: fickle enemies (two committed arrows, takes
      the better at resolve) and shrouded/veiled ones (committed but unshown —
      a "?", with tap-to-inspect reach as the read). The difficulty spine of
      regions 2–3
- [x] **3 regions × 4 clearings** (Meadow → Thicket → Deep Bramble), boss per
      region (Heart Sapling / the Gloom / the Bramble Heart). Each clearing is
      a template: authored `core` enemies (the lesson) + a points `budget`
      (piece values as cost) rolled per run from a region pool, on a dedicated
      RNG stream so play choices never shift the ladder. Camps before bosses;
      region-shaped recruit pools; roster cap 6
- [x] **Choice scenes**: recruits/camp/trinkets/honeycake/promotion all share
      one card-picker — tap to study (sprite, blurb, 5×5 movement preview),
      explicit confirm
- [ ] Sound: WebAudio chiptune, captures pop into flowers
- [ ] Real art pass (current sprites are placeholders-with-charm)
- [ ] Balance pass on the 12-fight ladder (dial curve, budgets, spread
      timings, dual-boss difficulty are all first guesses — playtest and tune)

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
- [x] Actually installing this on an iPhone and confirming it launches
      standalone — confirmed working
- [ ] Capacitor/native wrapper is a "maybe someday," not started

## Decisions so far

- **Name: Overgrown** (not chess-y on purpose).
- Pure capture both ways, no HP (bosses will be the exception later).
- Telegraphs are re-checked for legality when they resolve — so blocking a thistle
  head-on works (pawns can't capture forward; the game must teach true blocking).
- Difficulty scales on several independent axes, not just enemy count:
  acts-per-turn (1 → 3), AI dials (naive → sharp), telegraph degradation
  (full → fickle → shrouded), spread-clock pressure, board size.
- The AI stays a one-ply scorer with exchange awareness — deliberately not a
  search. Its mistakes are the early curriculum; its dials are the late one.
- Saves: key bumped (v3) whenever engine changes break decision-log replay;
  loadSave discards logs that no longer replay.
- Mutating fight state + seeded RNG. Determinism is good enough for now; strict
  decision-log replay arrives with saves.
- Sprites are 12×12 pixel maps validated by a unit test (row lengths, palette chars).
