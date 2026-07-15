---
name: verify
description: Quick sanity check for Overgrown — typecheck, build, and unit tests. No browser.
---

# Verifying Overgrown (light)

1. `npm run build` — `tsc` typecheck + Vite build. Catches most breakage.
2. `npm test` — Vitest unit tests (game logic in `src/game/*.test.ts`,
   sprite shape checks in `src/render/sprites.test.ts`).

That's it — no browser, no screenshots. This is the default during active
playtesting: fast, cheap, and enough for game-logic and copy tweaks.

For changes that need to actually be *seen* to confirm they're right (canvas
rendering, animation timing, layout/sizing, anything about how a tap feels),
the `verify-full` skill drives a real headless browser — but it's much more
expensive (screenshots burn a lot of tokens), so ask before reaching for it
rather than deciding unilaterally.
