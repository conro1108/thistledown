# Overgrown — Design Doc

Named for the state of the meadow you're reclaiming, fight by fight.
Deliberately zero chess in the name — the con only works if the box doesn't say chess.

## The pitch

A cozy pixel-art tactics roguelike. You're a small Keeper leading a band of woodland
critters through a meadow that's been overgrown by the Bramble. Each critter happens to
move exactly like a chess piece — but nobody ever says the word "chess." Fights are
short tactical puzzles on small boards with fully telegraphed enemy moves. Between
fights you recruit new friends, brew upgrades at the campfire, and push toward the
Bramble Heart at the end of each region.

Sister game to Cozy Sprites: same aesthetic universe, same 16×16 pixel sensibility, same
dry/warm tone. Where Cozy Sprites is a check-in-every-few-hours game, this is a
sit-down-for-40-minutes game.

## Design pillars

1. **It's chess vocabulary, not chess.** Movement patterns, capture-by-landing,
   promotion, and mating nets are the atoms — but the objectives, board shapes, and
   asymmetric sides mean it never feels like "here's chess."
2. **Perfect information, zero reading required.** Every enemy telegraphs its next move
   (Into the Breach style). Tap any creature and its threatened squares light up. The
   entire chess-teaching agenda lives in this one feature: players absorb "what does a
   knight attack" by seeing it a thousand times, never by being told.
3. **Cozy, not grim.** Nothing dies. Enemies poof into flowers. Your pieces get
   "tuckered out" and scamper back to camp when captured. Losing a run is going home
   for tea.
4. **Short, dense fights.** 5–15 turns per fight, ~16 fights per run, a run is
   30–60 minutes. Every turn should have a real decision.

## The stealth chess curriculum

The ulterior motive, made explicit (in this doc only — never in game):

| Game mechanic | Chess concept it secretly teaches |
|---|---|
| Each critter's movement pattern | Piece movement, learned one piece at a time |
| Threat-square highlighting, always available | Board vision / "what is attacked" |
| Standing on a square a friend can reach | Defended pieces; recapture |
| Enemy telegraphs | Thinking one move ahead; threats |
| "Fork," "Pin," "Skewer" as named critter skills with juicy VFX | Tactical motifs, by name, celebrated |
| Pawn-critter reaching the far edge mid-fight → evolves | Promotion |
| Keeper + Rook-critter combo move (unlock) | Castling |
| Bosses can't be captured, only **cornered** (no safe squares left) | Checkmate as a concept, not a rule |
| Late-game "old trick" unlock for the pawn-critter | En passant, as an easter egg |

The arc: every piece type appears as an **enemy first**. You spend a few fights learning
to dodge knight-moves before you ever get to recruit a knight. Reading a piece's threats
defensively is exactly the skill chess beginners lack — and here it's survival, so it
gets learned for real. Then the recruit moment ("the Hopper wants to join you!") feels
like taming a wild animal you've grown to respect.

By the end of one full run, a player who has never touched chess knows all six piece
movements, promotion, the idea of checkmate, and three tactical motifs by name. If they
ever sit down at a real board, it will feel familiar. That's the whole con.

## Core combat

- Turn-based on small boards: **5×5 early, up to 8×8 late**. Boards have terrain —
  ponds (impassable), tall grass (hides telegraph until adjacent — introduced late, and
  sparingly), flower tiles (buffs), mud (a piece landing there stops any further
  effects/skills that turn).
- **Pure chess capture, both directions**: land on a square, take what's there. No HP,
  no damage math (exceptions only for bosses). This is the cleanest possible teaching
  loop and keeps turns fast.
- You move **one critter per turn**, enemies each act on theirs (mostly one enemy moves
  per turn early; more per turn later — this is a difficulty dial).
- Enemy intent shown as a ghosted arrow/square. Early enemies commit to their telegraph;
  later regions introduce enemies that pick between two telegraphed options, then
  "clever" ones that re-aim if you block them (a gentle on-ramp toward opponents who
  respond to you — i.e., toward chess). Capturing the enemy that was about to move
  **steals the bramble's turn** — that's the Into the Breach reward loop, and the game
  celebrates it loudly rather than letting it read as the AI doing nothing.
- **Captured friends aren't dead** — they're out for the rest of the fight and come back
  "shaken" (skip the next fight unless you spend a campfire treat on them). Losing your
  Keeper ends the run.
- **Win conditions rotate**: clear all enemies, escort a snail to the exit square,
  survive N turns while the Bramble spreads, protect the seedling, steal the acorn and
  get out, corner the miniboss. Variety here is what keeps it from feeling like chess.

## Your side: the critters

Working roster — every one maps to a piece, flavored so the movement feels *natural to
the animal* rather than arbitrary:

| Critter | Piece | Flavor logic |
|---|---|---|
| **Sprout** (hedgehog) | Pawn | Waddles forward one step; pokes diagonally with its spines |
| **Hopper** (rabbit) | Knight | Leaps in an L, over anything — of course it does |
| **Slink** (fox? ferret?) | Bishop | Slips diagonally through the grass |
| **Rumble** (badger) | Rook | Bulldozes in straight lines |
| **Duchess** (deer? heron?) | Queen | Elegant, goes anywhere; rare and late |
| **The Keeper** (you — a tiny lantern-holder) | King | One step any direction; must survive |

Recruit order across a run roughly follows real chess piece values, so power progression
and chess intuition align for free: pawns → knight/bishop → rook → queen.

Each critter has **personality** (Cozy Sprites DNA): idle animations, one-liners at the
campfire, a favorite snack. Names ("Pickle", "Other Pickle") are **campfire flavor
only** — the fight UI and all mechanics speak in critter types ("a Sprout", "your
Hopper"), because that's how players actually think and it's the vocabulary that maps
to pieces. Nobody buffs "Waddle"; they buff a Sprout.

## The enemy: the Bramble

Enemies are gloom-tangled plants and grumpy constructs, so it never reads as
critters-vs-critters:

- **Thistles** — pawn-movers (introduced region 1)
- **Tumbleweeds** — knight-movers (region 1–2)
- **Vine creepers** — bishop-movers
- **Root golems** — rook-movers
- **The Gloom** — queen-mover, region 3+ miniboss tier
- **Bramble Hearts** — bosses. Can't be captured; you win by leaving them **no safe
  square** (checkmate), or by fight-specific gimmicks (sever the three roots feeding it,
  etc.). Boss fights are where mating-net intuition gets built. The Heart plays by the
  **king rule at resolve time**: its telegraph is intent, not a promise — threaten its
  square and it flees immediately; cover its destination and it balks. Checks are
  forcing moves, which is what makes the mating net teachable.
- Spice enemies that break chess on purpose: a **Sundew** that doesn't move but pulls
  the nearest critter one square closer each turn; **Spore puffs** that split when
  captured; a **Cuckoo** that copies the movement of the last critter you moved.

## Run structure

Slay-the-Spire-shaped, kept simple:

- **4 regions** (Meadow → Thicket → Tanglewood → the Deep Bramble), each a short
  branching node map: ~4 fights, 1 event, 1 camp, 1 boss. Full run ≈ 16 fights,
  45–75 min. (Started at 3 regions/12 fights; playtest verdict was "it stopped
  right as it was starting to get fun" — the extra region is where fickle,
  shrouded, and 3-acts get room to breathe, plus a second cornering boss.)
- **Camp** between fights: heal shaken friends, feed snacks (a small buff to one
  critter that lasts a few clearings, then fades), swap trinkets, tiny dialogue
  vignettes. Camp is the cozy valve — the breather that makes the tactics feel earned.
- **Power decay**: snacks and movement upgrades are *temporary* — each lasts a few
  clearings from the fire it's picked up at, then wears off. Trinkets alone are
  permanent (the run-defining relics). Recruits arrive every *other* clearing, not
  after every one. Together this keeps power from monotonically ballooning across a
  long run and keeps campfire choices meaningful late instead of a done deal.
- **Events**: little illustrated choose-one scenes. Risk/reward, jokes, occasional
  free recruit.
- **Trinkets** (relics): run-defining passives. *Dandelion Cloak* — once per fight, a
  captured friend instead retreats to your back rank. *Acorn Whistle* — Hoppers can
  make a plain one-step move. *Second Breakfast* — your first move each fight comes
  with an extra non-capturing move (a stretch, not a snatch — the full double-move
  version proved wildly OP). Aim for ~30 at launch.
- **Upgrades to movement** are the most interesting design space: a Sprout that can
  also step diagonally forward, a Rumble that can turn one corner mid-charge, a Slink
  that hops over one friendly. Each upgrade is a *variant* of the real piece — players
  end up understanding the base movement better by seeing it bent.
- **Promotion in-fight**: any Sprout reaching the far edge picks an evolution on the
  spot (mirrors Cozy Sprites' evolution moment — same little jingle, even).

## Difficulty & meta progression

- **In-run power**: recruits, movement upgrades, trinkets, snacks. This is the main
  progression and it resets every run.
- **Difficulty ramp within a run**: bigger boards, more enemies acting per turn,
  terrain, minibosses — and two axes that carry the teaching arc:
  - **AI dials** (foresight/caution/bloodlust/temperature): region 1's bramble
    is naive on purpose — it gifts tempo and walks into danger, and punishing it
    is the lesson. Later regions reason about exchanges on real piece values.
    Strength-of-play is a tunable dial, not a rewrite.
  - **Telegraph degradation**: full arrows → fickle (two committed arrows,
    takes the better) → shrouded (committed but unshown; tap-to-inspect reach
    is the read). The training wheels come off gradually — by region 3 the
    player is doing real threat calculation, which is the whole point.
- **The spread clock**: linger too long in any fight and marked squares sprout
  fresh thistles (smotherable by standing on them). Stalling is never free, so
  "unresolved" positions resolve themselves.
- **Meta progression stays light** (skill should be the real unlock): new starting
  companions and Keeper variants (a Keeper who starts with a Hopper but no Sprouts; a
  Keeper who can swap places with an adjacent friend once per fight — hi, castling),
  a bestiary/journal, cosmetic campsite décor. **No stat inflation** — unlocks are
  sideways, not upward, so a friend's first run and your fiftieth are the same game.
- **Ascension-style heat levels** after a first win, for the person in the household
  who turns out to be a shark.
- **Daily seed** eventually — same run for everyone, great for spouse/friend rivalry.

## Onboarding (no tutorial screens)

Run 1, fight 1 is a 5×5 board, the Keeper, two Sprouts, and two Thistles that walk
straight into your spines. Every mechanic is introduced by a fight that's *about* it,
Into-the-Breach style. Text budget per new concept: one speech bubble. If a mechanic
needs a paragraph, redesign the mechanic.

## Tone & art

- Same pixel scale and palette family as Cozy Sprites (16×16 creatures, chunky UI),
  golden-hour meadow light, Bramble regions go dusky purple-green rather than scary.
- Same voice: warm with a dry streak. The Keeper's lantern flickers when you hover a
  bad move. Critter dialogue leans Cozy Sprites-cursed ("Other Pickle has eaten a rock.
  She is fine.").
- WebAudio chiptune, reuse learnings from Cozy Sprites' audio layer. Captures get a
  *pop-into-flowers* sound, not a hit sound.
- Possible crossover wink: a retired Cozy Sprites adult occasionally wanders through
  the campsite background.

## Tech plan

Deliberately the Cozy Sprites stack — it's proven, you both know it, and there's no
framework tax:

- **Vite + vanilla TypeScript, no framework.** Canvas renderer for board/sprites, DOM
  for menus/overlays. `tsc && vite build` → static `dist/` → **Vercel zero-config**
  (framework preset: Vite). No server, no API routes.
- **Layout mirrors Cozy Sprites**:
  - `src/game/` — pure, DOM-free logic, unit-tested: board state, movement/threat
    generation, enemy AI (telegraph → resolve), win conditions, run/map state,
    trinket effects, **seeded RNG** (runs must be deterministic — enables daily seeds,
    replays, and bug reports that reproduce).
  - `src/render/` — canvas pixel renderer. Port the `drawSpriteQuantized` discipline
    and the integer-scaling hard rule from Cozy Sprites day one.
  - `src/ui/` — screens, input, audio.
  - `src/main.ts` — orchestration.
- **Tests from the scaffold** (per house rules): Vitest, colocated `*.test.ts`.
  Movement/threat generation, enemy AI resolution, win-condition checks, and trinket
  interactions are all pure functions — exactly the "logic worth protecting." Property
  test worth writing early: no legal move generator ever returns an off-board or
  self-capture square.
- **Saves**: localStorage — a small meta profile plus a mid-run snapshot (serialize run
  seed + decision log, not raw board state; replaying the log reconstructs the run and
  makes save format nearly migration-proof).
- **Input**: mouse + tap from day one (tap critter → see moves+threats → tap square).
  Desktop-first layout since it's a sit-down game, but nothing that breaks on a phone.
- **PWA/offline**: later, copy the Cozy Sprites approach.

## Milestones

- **M0 — Find the fun (prototype).** One hardcoded 6×6 fight: Keeper + 2 Sprouts + a
  Hopper vs. Thistles + a Tumbleweed. Telegraphs, threat highlighting, capture, win/lose.
  Placeholder squares for art. *Kill criterion: if moving pieces around with telegraphs
  isn't fun here, no amount of roguelike structure will save it.*
- **M1 — The run.** Node map, 1 region, recruiting, camp, snacks, 5–6 trinkets, first
  boss with the cornering rule, run win/loss, mid-run save.
- **M2 — The game.** All 6 piece types on both sides, 4 regions, spice enemies,
  promotion, movement upgrades, ~30 trinkets, events, real pixel art and sound.
- **M3 — The polish.** Meta unlocks, bestiary, ascension, juice pass, PWA, daily seed.
  Wife test: hand it over with zero explanation and watch.

## Open questions (for the two of you over dinner)

1. Nothing-dies commitment: do *bosses* also poof into flowers, or is a bit of drama
   allowed at region ends?
2. One-critter-per-turn (recommended, chess-like, fast) vs. move-everyone-per-turn
   (Into the Breach, heavier)? M0 should try the first; only revisit if it feels thin.
3. How hard should the true final boss lean into an actual mating net? There's a
   version where the last fight is nearly-real chess and it lands as a graduation
   moment — and a version where that breaks the spell.
4. Does the Cozy Sprites crossover stay a background wink, or can a retired pet be a
   recruitable secret unit?
