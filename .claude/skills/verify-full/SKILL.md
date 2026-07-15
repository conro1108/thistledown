---
name: verify-full
description: Build, launch, and drive Overgrown in a real browser to verify visual/rendering/interaction changes end-to-end. Expensive — use only for changes that need to be seen, or when asked.
---

# Verifying Overgrown (full, browser-driven)

Use this only when a change touches rendering/visuals (canvas scene, sprites,
telegraph arrows, animations), layout/sizing, or turn-timing/feel — and the
light `verify` skill (typecheck + unit tests) isn't enough to trust it. This
drives a real browser and reads back screenshots, which is significantly more
expensive — don't reach for it by default, and don't run it for every small
tweak during active playtesting.

1. `npx vite --port 5173` (background). App at http://localhost:5173/.
2. Drive with `playwright-core` (already a devDependency — no browser
   download needed). Resolve it with `createRequire('/Users/connorrowe/projects/chess_rogue/package.json')`
   so the import works from a scratchpad script; a local chromium build isn't
   installed, so launch the headless shell directly:
   ```js
   const exe = `${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
   const browser = await chromium.launch({ executablePath: exe });
   ```
   Viewport ~420×820 (phone-shaped — this is a mobile-first layout).
3. There's no state-seeding hook (no localStorage save yet) — drive the run
   for real: click through the title card → intro card → tap a friend on the
   canvas → tap a destination square. Canvas taps are just mouse clicks
   scaled into board-cell coordinates from `#board`'s bounding box (board is
   `fight.w`×`fight.h` cells, see `TILE` in `src/render/scene.ts`).

## Gotchas
- Overlays (`#overlay .card`) block canvas taps until dismissed — click the
  overlay's button, not the board, to advance intro/promotion/end-of-fight
  screens.
- After a move, wait out the full beat before asserting: `PAUSE_MS` (bramble
  thinks) + tween time, currently ~340ms + ~190ms, plus your own move's
  ~120ms tween. ~1s total is safe.
- The canvas is integer-scaled (`sizeCanvas` in `main.ts`); if you're
  checking the "board zoom" class of bug, screenshot across several turns and
  diff the canvas's `boundingBox()` size — it must stay constant.
- All game randomness goes through the seeded RNG on `FightState`/`RunState`,
  but a browser session still uses `Date.now()` as the run seed (see
  `startRun()` in `main.ts`), so exact piece layouts vary run to run — assert
  against fight 1's fixed enemy spawns (`FIGHTS[0]` in `src/game/run.ts`), not
  hardcoded coordinates from a specific past run.

## Keep it cheap even here
- Take the minimum number of screenshots needed to confirm the specific
  change — not one per state "just in case".
- Reuse/adapt a driver script across a session instead of rewriting one from
  scratch each time you verify.
