# Overgrown — Implementation Plan

Living doc: check things off, reorder freely. DESIGN.md holds the vision; this holds the
build order. Rule: thin vertical slice first, then features by priority. Don't overspec
ahead of what's built.

## Approach

- Vite + vanilla TypeScript, canvas renderer, Vitest colocated tests.
- `src/game/` is pure and DOM-free (all logic tested there); `src/render/` draws;
  `src/main.ts` wires. Deploy: static `dist/` via `npm run build`, Vercel Vite preset.

## Done

**Core loop** — engine (movement + threats for all kinds), fight loop (telegraph →
player move → resolve → re-telegraph, win/lose), canvas renderer, input + HUD.

**The run** — recruit between fights, Shaken (captured friends sit out one fight),
run win/lose, promotion (a sprout reaching the far edge evolves for the run).

**The ladder** — **6 regions × 4 clearings = 24 fights** (Meadow → Thicket →
Tanglewood → Deep Bramble → Rotwood → Worldroot), a boss per region (Heart Sapling,
Gloom Hollow, Thorned Heart, Bramble Heart, Rotting Heart, Worldheart). Each clearing
is a template: authored `core` enemies (the lesson) + a points `budget` rolled per run
from a region pool on a dedicated RNG stream, so play choices never shift the ladder.
Camps before bosses; region-shaped recruit pools; roster cap 6.

**Difficulty axes** (independent, not just enemy count):
- Acts-per-turn 1 → 4 across regions.
- AI dials (`AiDials`): foresight (recapture math + preemption), caution, bloodlust,
  temperature. Region 1 stays naive on purpose — punishing the greedy bramble is the lesson.
  AI plays the whole side's best move; one-ply scorer with exchange awareness, not a search.
- Telegraph degradation: full → fickle (two arrows, better one resolves) →
  shrouded/veiled (committed but unshown; tap-to-inspect reach is the read).
- Spread clock (anti-stall): past `after` turns a far-edge square is marked, then a
  thistle sprouts; standing on the mark smothers it. Killed the promotion-farm.
- Board size.

**Progression items** — Camps (Warm mash heals shaken / Honeycake makes one companion
spry). Trinkets (Dandelion Cloak, Acorn Whistle, Second Breakfast); free pick after
clearing 1, more at camps.

**Shared choice-scene UI** — recruits/camp/trinkets/honeycake/promotion all use one
card-picker: tap to study (sprite, blurb, 5×5 movement preview), explicit confirm.

**Mobile UX** — split engine (`playerMove` / `resolveEnemyTurn`) so enemy moves are a
watchable beat; full `100dvh` flex layout with cozy sky backdrop; roster is real
`<button>`s with selection/disabled states; persistent goal line + 3-swatch legend;
tap-to-inspect any piece's threat squares. Stalemate guard (`playerHasMove()` auto-waits, loudly).

**Save** — `session.ts` decision-log state machine (seed + log in localStorage, replayed
to reconstruct — never raw board state). Title screen "Keep going" resumes mid-fight.
Key bumped whenever an engine change breaks replay; unreplayable logs are discarded.

**PWA** — `manifest.webmanifest`, hand-rolled pixel icons (`scripts/make-icons.mjs`,
from-scratch PNG encoder), iOS meta. `public/sw.js` network-first + cache fallback;
bump `CACHE` to invalidate. Confirmed installing/launching standalone on iPhone.

**Sound** — `audio.ts`, a tiny WebAudio chiptune synth (no assets). Pure
`soundForEvent` maps every FightEvent to a note figure (captures *pop*, a
shaken friend *oofs*, tempo/rescue *sparkle*, a twist *alarms*); move-clicks,
piece-pick blips, win/lose jingles. Deduped per drain, gentle master gain,
persisted mute toggle in the HUD, iOS-safe unlock on first gesture.

## P2 — Open

- [ ] **Real art pass** — current sprites are placeholders-with-charm.
- [ ] **Balance pass on the 24-fight ladder** — dial curve, budgets, spread timings,
      and dual-boss difficulty are all first guesses. Playtest and tune.

## P3 — Later

Events, node-map branching, meta unlocks, bestiary, ascension, daily seed, persistent
battle log, Capacitor/native wrapper (not started).
