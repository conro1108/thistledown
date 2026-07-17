import { describe, expect, it } from 'vitest';
import {
  createFight,
  playerHasMove,
  playerMove,
  promote,
  resolveEnemyTurn,
  takeFreeMove,
  type FightConfig,
  type Spawn,
} from './fight';
import { mulberry32 } from './rng';
import type { FightState } from './types';

function fight(
  friends: Spawn[],
  enemies: Spawn[],
  actsPerTurn = 1,
  w = 6,
  h = 6,
  extra: Partial<FightConfig> = {},
): FightState {
  return createFight({ name: 't', w, h, friends, enemies, actsPerTurn, ...extra }, mulberry32(7));
}

function idAt(s: FightState, x: number, y: number): number {
  const p = s.pieces.find((q) => q.x === x && q.y === y);
  if (!p) throw new Error(`no piece at ${x},${y}`);
  return p.id;
}

describe('fight loop', () => {
  it('capturing the last enemy wins', () => {
    const s = fight(
      [{ kind: 'keeper', x: 0, y: 5 }, { kind: 'sprout', x: 2, y: 4 }],
      [{ kind: 'thistle', x: 3, y: 3 }],
    );
    expect(playerMove(s, idAt(s, 2, 4), { x: 3, y: 3 })).toBe(true);
    expect(s.status).toBe('won');
    expect(s.pieces.filter((p) => p.side === 'bramble')).toHaveLength(0);
  });

  it('telegraphs respect actsPerTurn', () => {
    const s = fight(
      [{ kind: 'keeper', x: 0, y: 5 }],
      [
        { kind: 'thistle', x: 0, y: 0 },
        { kind: 'thistle', x: 2, y: 0 },
        { kind: 'thistle', x: 4, y: 0 },
      ],
      2,
    );
    expect(s.telegraphs).toHaveLength(2);
  });

  it('Dandelion Cloak: the first caught friend retreats to the home row instead', () => {
    const s = fight(
      [{ kind: 'keeper', x: 0, y: 5 }, { kind: 'sprout', x: 4, y: 4 }],
      [{ kind: 'thistle', x: 3, y: 3 }],
      1,
      6,
      6,
      { cloak: true },
    );
    expect(s.telegraphs[0].to).toEqual({ x: 4, y: 4 });
    playerMove(s, idAt(s, 0, 5), { x: 0, y: 4 });
    resolveEnemyTurn(s);
    const sprout = s.pieces.find((p) => p.kind === 'sprout')!;
    expect(sprout.y).toBe(5); // whisked to the home row
    expect(s.cloakLeft).toBe(0);
    expect(s.events.some((ev) => ev.type === 'cloaked')).toBe(true);
    expect(s.events.some((ev) => ev.type === 'shaken')).toBe(false);
    // the thistle still lands where it was headed
    expect(s.pieces.find((p) => p.kind === 'thistle')).toMatchObject({ x: 4, y: 4 });
  });

  it('Dandelion Cloak never saves the keeper — losing him still ends the fight', () => {
    const s = fight(
      [{ kind: 'keeper', x: 4, y: 4 }, { kind: 'sprout', x: 0, y: 4 }],
      [{ kind: 'thistle', x: 3, y: 3 }],
      1,
      6,
      6,
      { cloak: true },
    );
    expect(s.telegraphs[0].to).toEqual({ x: 4, y: 4 });
    playerMove(s, idAt(s, 0, 4), { x: 0, y: 3 });
    resolveEnemyTurn(s);
    expect(s.status).toBe('lost');
    expect(s.cloakLeft).toBe(1); // untouched — the charge is still there for a companion
  });

  it('Second Breakfast: takeFreeMove grants exactly one extra move', () => {
    const s = fight(
      [{ kind: 'keeper', x: 0, y: 5 }],
      [{ kind: 'thistle', x: 5, y: 0 }],
      1,
      6,
      6,
      { secondBreakfast: true },
    );
    expect(takeFreeMove(s)).toBe(true);
    expect(takeFreeMove(s)).toBe(false);
    const plain = fight([{ kind: 'keeper', x: 0, y: 5 }], [{ kind: 'thistle', x: 5, y: 0 }]);
    expect(takeFreeMove(plain)).toBe(false);
  });

  it('Second Breakfast: the extra move is a stretch, not a snatch', () => {
    const s = fight(
      [{ kind: 'keeper', x: 0, y: 5 }, { kind: 'rumble', x: 2, y: 5 }],
      [{ kind: 'thistle', x: 2, y: 0 }, { kind: 'thistle', x: 5, y: 0 }],
      1,
      6,
      6,
      { secondBreakfast: true },
    );
    expect(playerMove(s, idAt(s, 0, 5), { x: 0, y: 4 })).toBe(true);
    expect(takeFreeMove(s)).toBe(true);
    // the rumble could take the thistle up column 2 — but not on a free move
    expect(playerMove(s, idAt(s, 2, 5), { x: 2, y: 0 })).toBe(false);
    expect(playerMove(s, idAt(s, 2, 5), { x: 2, y: 1 })).toBe(true);
    expect(s.freeMoveActive).toBe(false); // captures come back after the stretch
  });

  it('Acorn Whistle: a sprout promoting into a hopper comes out spry', () => {
    const s = fight(
      [{ kind: 'keeper', x: 0, y: 5 }, { kind: 'sprout', x: 5, y: 1 }],
      [{ kind: 'thistle', x: 0, y: 0 }],
      1,
      6,
      6,
      { whistle: true },
    );
    playerMove(s, idAt(s, 5, 1), { x: 5, y: 0 });
    expect(s.pendingPromotion).not.toBeNull();
    promote(s, 'hopper');
    expect(s.pieces.find((p) => p.kind === 'hopper')!.spry).toBe(true);
  });

  it('a thistle reaching the friends’ home row twists into a gloom', () => {
    const s = fight([{ kind: 'keeper', x: 0, y: 4 }], [{ kind: 'thistle', x: 5, y: 4 }]);
    expect(s.telegraphs[0].to).toEqual({ x: 5, y: 5 }); // its forward push, onto the home row
    playerMove(s, idAt(s, 0, 4), { x: 0, y: 3 });
    resolveEnemyTurn(s);
    const g = s.pieces.find((p) => p.side === 'bramble')!;
    expect(g).toMatchObject({ x: 5, y: 5, kind: 'gloom' });
    expect(s.events.some((ev) => ev.type === 'twisted')).toBe(true);
  });

  it('a friend pawn does not twist — it blossoms via the promotion choice', () => {
    const s = fight(
      [{ kind: 'keeper', x: 0, y: 5 }, { kind: 'sprout', x: 5, y: 1 }],
      [{ kind: 'thistle', x: 0, y: 0 }],
    );
    playerMove(s, idAt(s, 5, 1), { x: 5, y: 0 });
    expect(s.pendingPromotion).not.toBeNull();
    expect(s.events.some((ev) => ev.type === 'twisted')).toBe(false);
  });

  it('cornering the Bramble Heart wins: covered square + no safe step', () => {
    // rumbles cover column 0 (incl. the heart), column 1, and row 1 — every
    // square the heart stands on or could step to is threatened.
    const s = fight(
      [
        { kind: 'keeper', x: 3, y: 3 },
        { kind: 'rumble', x: 0, y: 3 },
        { kind: 'rumble', x: 1, y: 3 },
        { kind: 'rumble', x: 3, y: 1 },
      ],
      [{ kind: 'heart', x: 0, y: 0 }],
      1,
      4,
      4,
    );
    expect(playerMove(s, idAt(s, 3, 3), { x: 2, y: 3 })).toBe(true);
    expect(s.status).toBe('won');
    expect(s.events.some((ev) => ev.type === 'cornered')).toBe(true);
    expect(s.pieces.some((p) => p.kind === 'heart')).toBe(false); // poofed
  });

  it('the square behind the heart on a slider lane counts as covered (x-ray)', () => {
    // rumble on row 0 checks the heart at (1,0); its ray stops at the heart, so
    // the square directly behind it — (0,0) — must still count as covered. A
    // second rumble seals row 1. Every real escape is threatened: this is mate.
    const s = fight(
      [
        { kind: 'keeper', x: 3, y: 3 },
        { kind: 'rumble', x: 3, y: 0 }, // row 0: threatens through the heart to (0,0)
        { kind: 'rumble', x: 3, y: 1 }, // row 1: (2,1),(1,1),(0,1)
      ],
      [{ kind: 'heart', x: 1, y: 0 }],
      1,
      4,
      4,
    );
    // any neutral move — the net is already closed
    expect(playerMove(s, idAt(s, 3, 3), { x: 3, y: 2 })).toBe(true);
    expect(s.status).toBe('won');
    expect(s.events.some((ev) => ev.type === 'cornered')).toBe(true);
  });

  it('not cornered while a bramble piece can capture the checker', () => {
    // rumble at (0,3) checks down column 0; rumble at (1,3) seals column 1.
    // Old rule: cornered. But the bramble creeper at (3,0) can take the
    // checking rumble along the (3,0)-(0,3) diagonal — the check is answerable.
    const s = fight(
      [
        { kind: 'keeper', x: 3, y: 3 },
        { kind: 'rumble', x: 0, y: 3 },
        { kind: 'rumble', x: 1, y: 3 },
      ],
      [{ kind: 'heart', x: 0, y: 0 }, { kind: 'creeper', x: 3, y: 0 }],
      1,
      4,
      4,
    );
    playerMove(s, idAt(s, 3, 3), { x: 3, y: 2 });
    expect(s.status).toBe('playing');
  });

  it('not cornered while a bramble piece can block the checking lane', () => {
    // same net, but the golem at (2,1) can slide to (0,1) and block column 0
    const s = fight(
      [
        { kind: 'keeper', x: 3, y: 3 },
        { kind: 'rumble', x: 0, y: 3 },
        { kind: 'rumble', x: 1, y: 3 },
      ],
      [{ kind: 'heart', x: 0, y: 0 }, { kind: 'golem', x: 2, y: 1 }],
      1,
      4,
      4,
    );
    playerMove(s, idAt(s, 3, 3), { x: 3, y: 2 });
    expect(s.status).toBe('playing');
  });

  it('a checked heart with no flee square presses a defender into service', () => {
    // the position above, from the top: the golem must telegraph the block
    const s = fight(
      [
        { kind: 'keeper', x: 3, y: 3 },
        { kind: 'rumble', x: 0, y: 3 },
        { kind: 'rumble', x: 1, y: 3 },
      ],
      [{ kind: 'heart', x: 0, y: 0 }, { kind: 'golem', x: 2, y: 1 }],
      1,
      4,
      4,
    );
    const golem = s.pieces.find((p) => p.kind === 'golem')!;
    const t = s.telegraphs.find((q) => q.pieceId === golem.id);
    expect(t?.to).toEqual({ x: 0, y: 1 });
  });

  it('cornered when the defenders present cannot actually help', () => {
    // a thistle with no legal move is no rescue — the net still closes
    const s = fight(
      [
        { kind: 'keeper', x: 3, y: 3 },
        { kind: 'rumble', x: 0, y: 3 },
        { kind: 'rumble', x: 1, y: 3 },
      ],
      [{ kind: 'heart', x: 0, y: 0 }, { kind: 'thistle', x: 3, y: 2 }],
      1,
      4,
      4,
    );
    playerMove(s, idAt(s, 3, 3), { x: 2, y: 3 });
    expect(s.status).toBe('won');
    expect(s.events.some((ev) => ev.type === 'cornered')).toBe(true);
  });

  it('a heart with a safe square is not cornered', () => {
    const s = fight(
      [
        { kind: 'keeper', x: 3, y: 3 },
        { kind: 'rumble', x: 0, y: 3 }, // column 0 only
        { kind: 'rumble', x: 3, y: 1 }, // row 1 only
      ],
      [{ kind: 'heart', x: 0, y: 0 }],
      1,
      4,
      4,
    );
    // (1,0) is uncovered — the heart can still slip out
    playerMove(s, idAt(s, 3, 3), { x: 2, y: 3 });
    expect(s.status).toBe('playing');
  });

  it('the heart avoids threatened squares, standing still if nowhere is safe', () => {
    // every escape square is covered but its own square is safe: it stays put
    const s = fight(
      [
        { kind: 'keeper', x: 3, y: 3 },
        { kind: 'rumble', x: 1, y: 3 }, // covers (1,0) and (1,1)
        { kind: 'rumble', x: 3, y: 1 }, // covers (0,1) and (1,1)
      ],
      [{ kind: 'heart', x: 0, y: 0 }],
      1,
      4,
      4,
    );
    // it telegraphs "holding still" (a null target) rather than nothing
    const ht = s.telegraphs.find((t) => t.pieceId === idAt(s, 0, 0));
    expect(ht).toBeDefined();
    expect(ht!.to).toBeNull();
    playerMove(s, idAt(s, 3, 3), { x: 2, y: 2 });
    resolveEnemyTurn(s);
    expect(s.pieces.find((p) => p.kind === 'heart')).toMatchObject({ x: 0, y: 0 });
    expect(s.status).toBe('playing');
  });

  it('playerHasMove detects a hemmed-in band (stalemate guard)', () => {
    // 1-wide corridor: keeper boxed by his own sprout, sprout blocked head-on
    // by a thistle it can't capture forward. Nobody on either side can move.
    const s = fight(
      [{ kind: 'keeper', x: 0, y: 2 }, { kind: 'sprout', x: 0, y: 1 }],
      [{ kind: 'thistle', x: 0, y: 0 }],
      1,
      1,
      3,
    );
    expect(playerHasMove(s)).toBe(false);
    // the wait is safe: enemy turn resolves (thistle is stuck too) and play continues
    resolveEnemyTurn(s);
    expect(s.status).toBe('playing');
    expect(s.turn).toBe(2);
  });

  it('playerHasMove is true in an ordinary fight', () => {
    const s = fight([{ kind: 'keeper', x: 0, y: 5 }], [{ kind: 'thistle', x: 5, y: 0 }]);
    expect(playerHasMove(s)).toBe(true);
  });

  it('the whole side plays its best move: a capture is telegraphed over a drift, even from a "not its turn" enemy', () => {
    const s = fight(
      [{ kind: 'keeper', x: 0, y: 5 }, { kind: 'sprout', x: 4, y: 4 }],
      [
        { kind: 'thistle', x: 0, y: 0 }, // spawned first, but can only drift
        { kind: 'thistle', x: 3, y: 3 }, // has a forward-diagonal capture on (4,4)
      ],
      1,
    );
    expect(s.telegraphs).toHaveLength(1);
    expect(s.telegraphs[0].to).toEqual({ x: 4, y: 4 });
    expect(s.telegraphs[0].pieceId).toBe(idAt(s, 3, 3));
  });

  it('an enemy telegraphing a friend captures it on resolve (friend becomes shaken, not game over)', () => {
    const s = fight(
      [{ kind: 'keeper', x: 0, y: 5 }, { kind: 'sprout', x: 4, y: 4 }],
      [{ kind: 'thistle', x: 3, y: 3 }],
    );
    // thistle's best option is capturing the sprout at (4,4)
    expect(s.telegraphs[0].to).toEqual({ x: 4, y: 4 });
    playerMove(s, idAt(s, 0, 5), { x: 0, y: 4 });
    expect(s.turn).toBe(1); // enemy turn hasn't resolved yet — that's a separate step now
    resolveEnemyTurn(s);
    expect(s.status).toBe('playing');
    expect(s.pieces.find((p) => p.kind === 'sprout')).toBeUndefined();
    expect(s.pieces.find((p) => p.kind === 'thistle')!.y).toBe(4);
    expect(s.events.some((ev) => ev.type === 'shaken')).toBe(true);
  });

  it('a red attack tracks its piece: a slider takes a target that sidesteps to another lane it covers', () => {
    const s = fight(
      [{ kind: 'keeper', x: 5, y: 4 }, { kind: 'duchess', x: 1, y: 1 }],
      [{ kind: 'creeper', x: 3, y: 3 }],
    );
    // the creeper (diagonal slider) telegraphs the bite on the duchess up-left
    expect(s.telegraphs[0].to).toEqual({ x: 1, y: 1 });
    playerMove(s, idAt(s, 1, 1), { x: 5, y: 1 }); // slide onto its OTHER diagonal — still in reach
    resolveEnemyTurn(s);
    const creeper = s.pieces.find((p) => p.kind === 'creeper')!;
    expect(creeper).toMatchObject({ x: 5, y: 1 }); // it followed the target across lanes
    expect(s.pieces.find((p) => p.kind === 'duchess')).toBeUndefined();
    expect(s.events.some((ev) => ev.type === 'shaken')).toBe(true);
  });

  it('a red attack still misses a target that dodges clear of every square it covers', () => {
    const s = fight(
      [{ kind: 'keeper', x: 5, y: 4 }, { kind: 'duchess', x: 1, y: 1 }],
      [{ kind: 'creeper', x: 3, y: 3 }],
    );
    expect(s.telegraphs[0].to).toEqual({ x: 1, y: 1 });
    playerMove(s, idAt(s, 1, 1), { x: 0, y: 1 }); // off every diagonal the creeper covers
    resolveEnemyTurn(s);
    const creeper = s.pieces.find((p) => p.kind === 'creeper')!;
    expect(creeper).toMatchObject({ x: 1, y: 1 }); // it landed on the empty aimed square
    expect(s.pieces.find((p) => p.kind === 'duchess')).toBeDefined(); // the dodge worked
  });

  it('the Heart pursues a piece that steps to another square it attacks (but not behind a defender)', () => {
    const s = fight(
      [{ kind: 'keeper', x: 5, y: 5 }, { kind: 'hopper', x: 3, y: 3 }],
      [{ kind: 'heart', x: 2, y: 2 }],
    );
    expect(s.telegraphs[0].to).toEqual({ x: 3, y: 3 }); // its bite on the hopper
    playerMove(s, idAt(s, 3, 3), { x: 1, y: 2 }); // a knight hop to another heart-adjacent square
    resolveEnemyTurn(s);
    expect(s.status).toBe('playing');
    expect(s.pieces.find((p) => p.kind === 'heart')).toMatchObject({ x: 1, y: 2 });
    expect(s.pieces.find((p) => p.kind === 'hopper')).toBeUndefined();
  });

  it('losing the keeper loses the fight', () => {
    const s = fight(
      [{ kind: 'keeper', x: 4, y: 4 }, { kind: 'sprout', x: 0, y: 4 }],
      [{ kind: 'thistle', x: 3, y: 3 }],
    );
    expect(s.telegraphs[0].to).toEqual({ x: 4, y: 4 });
    playerMove(s, idAt(s, 0, 4), { x: 0, y: 3 });
    resolveEnemyTurn(s);
    expect(s.status).toBe('lost');
  });

  it('blocking a thistle head-on stops it (telegraphs re-check legality)', () => {
    const s = fight(
      [{ kind: 'keeper', x: 5, y: 5 }, { kind: 'sprout', x: 2, y: 4 }],
      [{ kind: 'thistle', x: 2, y: 2 }],
    );
    expect(s.telegraphs[0].to).toEqual({ x: 2, y: 3 });
    playerMove(s, idAt(s, 2, 4), { x: 2, y: 3 }); // step into its path
    resolveEnemyTurn(s);
    const thistle = s.pieces.find((p) => p.kind === 'thistle')!;
    expect(thistle.x).toBe(2);
    expect(thistle.y).toBe(2); // it stayed put
    expect(s.pieces.find((p) => p.kind === 'sprout')).toBeDefined();
    // the game keeps going — and tells the player their block worked
    expect(s.events.some((ev) => ev.type === 'blocked' && ev.kind === 'thistle')).toBe(true);
    expect(s.turn).toBe(2);
    // the sole thistle is still walled in, so it has no legal move to telegraph —
    // no phantom null telegraph. It re-telegraphs the moment a lane opens up.
    expect(s.telegraphs).toHaveLength(0);
  });

  it('a thistle telegraphing a forward push still bites a friend that steps onto its diagonal', () => {
    const s = fight(
      [{ kind: 'keeper', x: 5, y: 5 }, { kind: 'hopper', x: 2, y: 5 }],
      [{ kind: 'thistle', x: 2, y: 2 }],
    );
    // nothing to bite yet, so it telegraphs the straight-ahead push
    expect(s.telegraphs[0].to).toEqual({ x: 2, y: 3 });
    playerMove(s, idAt(s, 2, 5), { x: 1, y: 3 }); // hop onto its forward-left diagonal
    resolveEnemyTurn(s);
    const thistle = s.pieces.find((p) => p.kind === 'thistle')!;
    expect(thistle).toMatchObject({ x: 1, y: 3 }); // it took the bite instead of pushing forward
    expect(s.pieces.find((p) => p.kind === 'hopper')).toBeUndefined();
    expect(s.events.some((ev) => ev.type === 'shaken')).toBe(true);
  });

  it('a thistle whose diagonal capture target dodges away pushes forward instead of idling', () => {
    const s = fight(
      [{ kind: 'keeper', x: 5, y: 5 }, { kind: 'sprout', x: 3, y: 4 }],
      [{ kind: 'thistle', x: 2, y: 3 }],
    );
    expect(s.telegraphs[0].to).toEqual({ x: 3, y: 4 });
    playerMove(s, idAt(s, 3, 4), { x: 3, y: 3 }); // step away, not into its path
    resolveEnemyTurn(s);
    const thistle = s.pieces.find((p) => p.kind === 'thistle')!;
    expect(thistle.x).toBe(2);
    expect(thistle.y).toBe(4); // it pushed straight ahead instead of standing idle
    expect(s.pieces.find((p) => p.kind === 'sprout')).toBeDefined(); // the dodge worked
    expect(s.events.some((ev) => ev.type === 'blocked')).toBe(false);
  });

  it('a thistle whose diagonal target dodges away stands idle if the forward push is also blocked', () => {
    const s = fight(
      [
        { kind: 'keeper', x: 5, y: 5 },
        { kind: 'sprout', x: 3, y: 4 },
        { kind: 'hopper', x: 2, y: 4 }, // sits directly in front of the thistle
      ],
      [{ kind: 'thistle', x: 2, y: 3 }],
    );
    expect(s.telegraphs[0].to).toEqual({ x: 3, y: 4 });
    playerMove(s, idAt(s, 3, 4), { x: 3, y: 3 }); // dodge away
    resolveEnemyTurn(s);
    const thistle = s.pieces.find((p) => p.kind === 'thistle')!;
    expect(thistle.x).toBe(2);
    expect(thistle.y).toBe(3); // no legal forward push either, so it's genuinely stuck
    expect(s.events.some((ev) => ev.type === 'blocked' && ev.kind === 'thistle')).toBe(true);
  });

  it("interposing into a slider's lane costs you the piece — it takes the blocker, not a free block", () => {
    // creeper (diagonal slider) at (1,1) aims down-right at the sprout on (4,4)
    const s = fight(
      [
        { kind: 'keeper', x: 0, y: 5 },
        { kind: 'sprout', x: 4, y: 4 },
        { kind: 'hopper', x: 0, y: 1 }, // off every creeper diagonal, so it isn't a rival target
      ],
      [{ kind: 'creeper', x: 1, y: 1 }],
    );
    expect(s.telegraphs[0].to).toEqual({ x: 4, y: 4 });
    playerMove(s, idAt(s, 0, 1), { x: 2, y: 2 }); // hop squarely into the creeper's lane
    resolveEnemyTurn(s);
    const creeper = s.pieces.find((p) => p.kind === 'creeper')!;
    expect(creeper.x).toBe(2);
    expect(creeper.y).toBe(2); // it lunged onto the interposer
    expect(s.pieces.find((p) => p.kind === 'hopper')).toBeUndefined(); // and took it
    expect(s.pieces.find((p) => p.kind === 'sprout')).toBeDefined(); // the original target survives
    expect(s.events.some((ev) => ev.type === 'shaken' && ev.kind === 'hopper')).toBe(true);
    expect(s.events.some((ev) => ev.type === 'blocked')).toBe(false);
  });

  it("sliding the target along a slider's lane doesn't escape — it follows down the lane and takes it", () => {
    // creeper at (1,1) aims down-right at the slink sitting on its diagonal
    const s = fight(
      [
        { kind: 'keeper', x: 0, y: 5 }, // off the creeper's diagonals
        { kind: 'slink', x: 3, y: 3 },
      ],
      [{ kind: 'creeper', x: 1, y: 1 }],
    );
    expect(s.telegraphs[0].to).toEqual({ x: 3, y: 3 });
    playerMove(s, idAt(s, 3, 3), { x: 4, y: 4 }); // slide further down the SAME diagonal to "dodge"
    resolveEnemyTurn(s);
    const creeper = s.pieces.find((p) => p.kind === 'creeper')!;
    expect(creeper.x).toBe(4);
    expect(creeper.y).toBe(4); // it chased down the lane
    expect(s.pieces.find((p) => p.kind === 'slink')).toBeUndefined(); // and caught it
    expect(s.events.some((ev) => ev.type === 'shaken' && ev.kind === 'slink')).toBe(true);
    expect(s.events.some((ev) => ev.type === 'blocked')).toBe(false);
  });

  it('stepping OFF the lane really does escape — the slider lands on its empty target square', () => {
    const s = fight(
      [
        { kind: 'keeper', x: 0, y: 5 },
        { kind: 'slink', x: 3, y: 3 },
      ],
      [{ kind: 'creeper', x: 1, y: 1 }],
    );
    expect(s.telegraphs[0].to).toEqual({ x: 3, y: 3 });
    playerMove(s, idAt(s, 3, 3), { x: 4, y: 2 }); // sidestep off the down-right diagonal
    resolveEnemyTurn(s);
    const creeper = s.pieces.find((p) => p.kind === 'creeper')!;
    expect(creeper.x).toBe(3);
    expect(creeper.y).toBe(3); // it slid to the now-empty telegraphed square
    expect(s.pieces.find((p) => p.kind === 'slink')).toBeDefined(); // the slink got away clean
    expect(s.events.some((ev) => ev.type === 'shaken')).toBe(false);
  });

  it('a hopper can capture a golem sitting on the back rank', () => {
    const s = fight(
      [{ kind: 'keeper', x: 0, y: 5 }, { kind: 'hopper', x: 2, y: 2 }],
      [{ kind: 'golem', x: 3, y: 0 }, { kind: 'thistle', x: 5, y: 3 }],
    );
    expect(playerMove(s, idAt(s, 2, 2), { x: 3, y: 0 })).toBe(true);
    expect(s.pieces.find((p) => p.kind === 'golem')).toBeUndefined();
    expect(s.status).toBe('playing'); // thistle still up
  });

  it('a sprout reaching the far edge freezes the turn until promotion', () => {
    const s = fight(
      [{ kind: 'keeper', x: 0, y: 5 }, { kind: 'sprout', x: 2, y: 1 }],
      [{ kind: 'thistle', x: 5, y: 4 }],
    );
    const sproutId = idAt(s, 2, 1);
    playerMove(s, sproutId, { x: 2, y: 0 });
    expect(s.pendingPromotion).toBe(sproutId);
    expect(s.turn).toBe(1); // enemy turn has not resolved
    expect(playerMove(s, idAt(s, 0, 5), { x: 0, y: 4 })).toBe(false); // input locked
    expect(promote(s, 'rumble')).toBe(true);
    expect(s.pieces.find((p) => p.id === sproutId)!.kind).toBe('rumble');
    expect(s.turn).toBe(1); // still separate: resolveEnemyTurn is its own step
    expect(s.pendingPromotion).toBeNull();
    resolveEnemyTurn(s);
    expect(s.turn).toBe(2);
  });

  it('the Heart flees at resolve when your move covers its square (the king rule)', () => {
    const s = fight(
      [{ kind: 'keeper', x: 3, y: 3 }, { kind: 'rumble', x: 2, y: 2 }],
      [{ kind: 'heart', x: 0, y: 0 }],
      1,
      4,
      4,
    );
    // the heart commits to drifting toward the keeper…
    expect(s.telegraphs.find((t) => t.pieceId === idAt(s, 0, 0))!.to).toEqual({ x: 1, y: 1 });
    // …then the rumble slides to (2,0), covering the heart's square mid-round
    playerMove(s, idAt(s, 2, 2), { x: 2, y: 0 });
    expect(s.status).toBe('playing'); // checked, not cornered — (0,1) and (1,1) are open
    resolveEnemyTurn(s);
    const h = s.pieces.find((p) => p.kind === 'heart')!;
    expect({ x: h.x, y: h.y }).toEqual({ x: 1, y: 1 }); // it scrambled out, toward the keeper
    expect(s.events.some((ev) => ev.type === 'flee' && ev.kind === 'heart')).toBe(true);
  });

  it('the Heart balks at resolve rather than stepping onto a square you just covered', () => {
    const s = fight(
      [{ kind: 'keeper', x: 3, y: 3 }, { kind: 'rumble', x: 2, y: 3 }],
      [{ kind: 'heart', x: 0, y: 0 }],
      1,
      4,
      4,
    );
    // committed to (1,1) while it was safe…
    expect(s.telegraphs.find((t) => t.pieceId === idAt(s, 0, 0))!.to).toEqual({ x: 1, y: 1 });
    // …then the rumble slides to (1,3) and covers the whole 1-column
    playerMove(s, idAt(s, 2, 3), { x: 1, y: 3 });
    resolveEnemyTurn(s);
    expect(s.pieces.find((p) => p.kind === 'heart')).toMatchObject({ x: 0, y: 0 }); // it stayed put
    expect(s.events.some((ev) => ev.type === 'blocked' && ev.kind === 'heart')).toBe(true);
    expect(s.status).toBe('playing');
  });

  it('capturing a telegraphed enemy is a stolen turn — a tempo event fires', () => {
    const s = fight(
      [{ kind: 'keeper', x: 0, y: 5 }, { kind: 'hopper', x: 2, y: 3 }],
      [
        { kind: 'thistle', x: 1, y: 1 }, // nearest the keeper: it gets the telegraph
        { kind: 'thistle', x: 4, y: 1 },
      ],
      1,
    );
    expect(s.telegraphs[0].pieceId).toBe(idAt(s, 1, 1));
    playerMove(s, idAt(s, 2, 3), { x: 1, y: 1 });
    expect(s.events.some((ev) => ev.type === 'tempo' && ev.kind === 'thistle')).toBe(true);
  });

  it('capturing an idle enemy is a plain capture, not a stolen turn', () => {
    const s = fight(
      [{ kind: 'keeper', x: 0, y: 5 }, { kind: 'hopper', x: 3, y: 3 }],
      [
        { kind: 'thistle', x: 1, y: 1 },
        { kind: 'thistle', x: 4, y: 1 }, // not telegraphed this round
      ],
      1,
    );
    expect(s.telegraphs[0].pieceId).toBe(idAt(s, 1, 1));
    playerMove(s, idAt(s, 3, 3), { x: 4, y: 1 });
    expect(s.events.some((ev) => ev.type === 'capture')).toBe(true);
    expect(s.events.some((ev) => ev.type === 'tempo')).toBe(false);
  });

  it('capturing a telegraphed enemy cancels its telegraph', () => {
    const s = fight(
      [{ kind: 'keeper', x: 0, y: 5 }, { kind: 'hopper', x: 2, y: 3 }],
      [
        { kind: 'thistle', x: 1, y: 1 },
        { kind: 'thistle', x: 4, y: 1 },
      ],
      2,
    );
    playerMove(s, idAt(s, 2, 3), { x: 1, y: 1 });
    resolveEnemyTurn(s);
    expect(s.status).toBe('playing');
    expect(s.pieces.filter((p) => p.side === 'bramble')).toHaveLength(1);
    // new telegraphs only reference living enemies
    for (const t of s.telegraphs) {
      expect(s.pieces.some((p) => p.id === t.pieceId)).toBe(true);
    }
  });
});

/**
 * Telegraph degradation — the difficulty spine of the later regions.
 * Fickle enemies commit to TWO squares and take whichever looks tastier when
 * the dust settles; shrouded (veiled) enemies commit like anyone else but the
 * player isn't shown the arrow, only the creature's reach on inspection.
 */
describe('fickle and shrouded telegraphs', () => {
  it('a fickle creeper telegraphs its best two options', () => {
    const s = fight(
      [
        { kind: 'keeper', x: 5, y: 5 },
        { kind: 'hopper', x: 0, y: 2 }, // the fatter prize, up the left diagonal
        { kind: 'sprout', x: 3, y: 3 }, // the consolation, down the right one
      ],
      [{ kind: 'creeper', x: 1, y: 1, fickle: true }],
    );
    expect(s.telegraphs[0].to).toEqual({ x: 0, y: 2 });
    expect(s.telegraphs[0].alt).toEqual({ x: 3, y: 3 });
  });

  it('fickle: when the first prize dodges away, it takes the second', () => {
    const s = fight(
      [
        { kind: 'keeper', x: 5, y: 5 },
        { kind: 'hopper', x: 0, y: 2 },
        { kind: 'sprout', x: 3, y: 3 },
      ],
      [{ kind: 'creeper', x: 1, y: 1, fickle: true }],
    );
    playerMove(s, idAt(s, 0, 2), { x: 1, y: 4 }); // hopper leaps clear
    resolveEnemyTurn(s);
    const creeper = s.pieces.find((p) => p.kind === 'creeper')!;
    expect({ x: creeper.x, y: creeper.y }).toEqual({ x: 3, y: 3 }); // took the alt
    expect(s.pieces.find((p) => p.kind === 'sprout')).toBeUndefined();
    expect(s.pieces.find((p) => p.kind === 'hopper')).toBeDefined();
  });

  it('fickle: when the first prize stays put, it takes the first', () => {
    const s = fight(
      [
        { kind: 'keeper', x: 5, y: 5 },
        { kind: 'hopper', x: 0, y: 2 },
        { kind: 'sprout', x: 3, y: 3 },
      ],
      [{ kind: 'creeper', x: 1, y: 1, fickle: true }],
    );
    playerMove(s, idAt(s, 5, 5), { x: 5, y: 4 }); // unrelated keeper shuffle
    resolveEnemyTurn(s);
    const creeper = s.pieces.find((p) => p.kind === 'creeper')!;
    expect({ x: creeper.x, y: creeper.y }).toEqual({ x: 0, y: 2 });
    expect(s.pieces.find((p) => p.kind === 'hopper')).toBeUndefined();
    expect(s.pieces.find((p) => p.kind === 'sprout')).toBeDefined();
  });

  it('a shrouded enemy commits like anyone else — the flag just rides the telegraph', () => {
    const s = fight(
      [{ kind: 'keeper', x: 0, y: 5 }, { kind: 'sprout', x: 4, y: 4 }],
      [{ kind: 'thistle', x: 3, y: 3, veiled: true }],
    );
    expect(s.telegraphs[0].veiled).toBe(true);
    expect(s.telegraphs[0].to).toEqual({ x: 4, y: 4 });
    playerMove(s, idAt(s, 0, 5), { x: 0, y: 4 });
    resolveEnemyTurn(s);
    expect(s.pieces.find((p) => p.kind === 'sprout')).toBeUndefined(); // it struck all the same
  });

  it('a fickle enemy with only one move telegraphs no phantom alt', () => {
    // corner creeper with its lone diagonal cut short by its own golem
    const s = fight(
      [{ kind: 'keeper', x: 0, y: 2 }],
      [
        { kind: 'creeper', x: 0, y: 0, fickle: true },
        { kind: 'golem', x: 2, y: 2 },
      ],
      2,
      3,
      3,
    );
    const t = s.telegraphs.find((q) => q.pieceId === idAt(s, 0, 0))!;
    expect(t.to).toEqual({ x: 1, y: 1 });
    expect(t.alt == null).toBe(true);
  });
});

/**
 * The spread clock: linger too long and the bramble sends reinforcements.
 * A marked square one turn ahead (fair warning), then a thistle sprouts.
 * This is what makes stalling — camping blocked pawns, farming promotions —
 * cost something, without putting a hard timer on anyone.
 */
describe('the bramble spreads', () => {
  const CLOCK = { spread: { after: 2, every: 2, cap: 5 } };

  it('marks a square with fair warning, then sprouts a thistle there', () => {
    const s = fight(
      [{ kind: 'keeper', x: 0, y: 5 }],
      [{ kind: 'thistle', x: 5, y: 0 }],
      1,
      6,
      6,
      CLOCK,
    );
    expect(s.pendingSprout).toBeNull();
    resolveEnemyTurn(s); // turn becomes 2 = `after`: the warning appears
    expect(s.pendingSprout).not.toBeNull();
    expect(s.pendingSprout!.y).toBe(0);
    expect(s.events.some((ev) => ev.type === 'stir')).toBe(true);
    const spot = { ...s.pendingSprout! };
    s.events = [];
    resolveEnemyTurn(s); // and next turn it sprouts
    expect(s.pendingSprout).toBeNull();
    expect(s.events.some((ev) => ev.type === 'sprouted')).toBe(true);
    const sprouted = s.pieces.filter((p) => p.side === 'bramble' && p.kind === 'thistle');
    expect(sprouted.some((p) => p.x === spot.x && p.y === spot.y)).toBe(true);
    expect(sprouted).toHaveLength(2);
  });

  it('a friend standing on the marked square smothers the sprout', () => {
    const s = fight(
      [{ kind: 'keeper', x: 0, y: 5 }, { kind: 'duchess', x: 3, y: 5 }],
      [{ kind: 'thistle', x: 5, y: 0 }],
      1,
      6,
      6,
      CLOCK,
    );
    resolveEnemyTurn(s);
    const spot = s.pendingSprout!;
    // park the duchess right on the warning square
    const duchess = s.pieces.find((p) => p.kind === 'duchess')!;
    duchess.x = spot.x;
    duchess.y = spot.y;
    s.events = [];
    resolveEnemyTurn(s);
    expect(s.pendingSprout).toBeNull();
    expect(s.events.some((ev) => ev.type === 'smothered')).toBe(true);
    expect(s.events.some((ev) => ev.type === 'sprouted')).toBe(false);
    expect(s.pieces.filter((p) => p.kind === 'thistle')).toHaveLength(1);
  });

  it('the cap holds the line — no marks once the bramble is at strength', () => {
    const s = fight(
      [{ kind: 'keeper', x: 0, y: 5 }],
      [
        { kind: 'thistle', x: 5, y: 0 },
        { kind: 'thistle', x: 3, y: 0 },
      ],
      1,
      6,
      6,
      { spread: { after: 2, every: 2, cap: 2 } },
    );
    resolveEnemyTurn(s);
    resolveEnemyTurn(s);
    resolveEnemyTurn(s);
    resolveEnemyTurn(s);
    expect(s.pendingSprout).toBeNull();
    expect(s.pieces.filter((p) => p.side === 'bramble').length).toBeLessThanOrEqual(2);
  });

  it('no spread config, no reinforcements — ever', () => {
    const s = fight([{ kind: 'keeper', x: 0, y: 5 }], [{ kind: 'thistle', x: 5, y: 0 }]);
    for (let i = 0; i < 20 && s.status === 'playing'; i++) resolveEnemyTurn(s);
    expect(s.pieces.filter((p) => p.side === 'bramble').length).toBeLessThanOrEqual(1);
    expect(s.pendingSprout).toBeNull();
  });

  it('a sprouted thistle gets a fresh id nothing else wears', () => {
    const s = fight(
      [{ kind: 'keeper', x: 0, y: 5 }],
      [{ kind: 'thistle', x: 5, y: 0 }],
      1,
      6,
      6,
      CLOCK,
    );
    resolveEnemyTurn(s);
    resolveEnemyTurn(s);
    const ids = s.pieces.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

/**
 * The dials sharpen how the bramble weighs its moves. foresight sees the
 * player's reply (recaptures; free-tempo pre-captures), caution keeps pieces
 * off squares the friends cover. Naive dials (all zero) reproduce the old
 * greedy behavior — that's region 1, where getting punished IS the lesson.
 */
describe('the bramble mind (AI dials)', () => {
  const SHARP = { dials: { foresight: 1, caution: 1 } };

  it('naive: a thistle gifts itself — telegraphs a capture of a defended piece it stands attacked by', () => {
    // keeper defends the sprout; the sprout attacks the thistle. Taking is a
    // pure tempo gift (the player just takes the thistle first), and the old
    // greedy AI takes it every time. Regression-pin that for naive dials.
    const s = fight(
      [{ kind: 'keeper', x: 5, y: 5 }, { kind: 'sprout', x: 4, y: 4 }],
      [{ kind: 'thistle', x: 3, y: 3 }],
    );
    expect(s.telegraphs[0].to).toEqual({ x: 4, y: 4 });
  });

  it('sharp: the same thistle declines the gift and pushes on instead', () => {
    const s = fight(
      [{ kind: 'keeper', x: 5, y: 5 }, { kind: 'sprout', x: 4, y: 4 }],
      [{ kind: 'thistle', x: 3, y: 3 }],
      1,
      6,
      6,
      SHARP,
    );
    expect(s.telegraphs[0].to).toEqual({ x: 3, y: 4 });
  });

  it('sharp: a golem will not trade itself for a defended sprout', () => {
    // golem's lane reaches the sprout, but the keeper guards it: 50 for 10 is
    // a terrible trade, so a sharp golem grinds closer instead
    const s = fight(
      [{ kind: 'keeper', x: 5, y: 5 }, { kind: 'sprout', x: 4, y: 4 }],
      [{ kind: 'golem', x: 4, y: 0 }],
      1,
      6,
      6,
      SHARP,
    );
    expect(s.telegraphs[0].to).not.toEqual({ x: 4, y: 4 });
  });

  it('naive: the same golem takes the defended sprout anyway', () => {
    const s = fight(
      [{ kind: 'keeper', x: 5, y: 5 }, { kind: 'sprout', x: 4, y: 4 }],
      [{ kind: 'golem', x: 4, y: 0 }],
    );
    expect(s.telegraphs[0].to).toEqual({ x: 4, y: 4 });
  });

  it('caution: a tumbleweed will not land on a covered square just to get closer', () => {
    // (2,3) is the closest leap to the keeper but the sprout covers it
    const naive = fight(
      [{ kind: 'keeper', x: 2, y: 5 }, { kind: 'sprout', x: 1, y: 4 }],
      [{ kind: 'tumbleweed', x: 3, y: 1 }],
    );
    expect(naive.telegraphs[0].to).toEqual({ x: 2, y: 3 });
    const sharp = fight(
      [{ kind: 'keeper', x: 2, y: 5 }, { kind: 'sprout', x: 1, y: 4 }],
      [{ kind: 'tumbleweed', x: 3, y: 1 }],
      1,
      6,
      6,
      SHARP,
    );
    expect(sharp.telegraphs[0].to).not.toEqual({ x: 2, y: 3 });
  });

  it('sharp: a winning trade is still taken — pawn snags a defended slink', () => {
    // slink (30) for thistle (10) is worth it even with the keeper recapturing;
    // and the thistle is defended by the creeper, so pre-capturing it costs the
    // player more than it saves — no reason to hold back
    const s = fight(
      [{ kind: 'keeper', x: 4, y: 4 }, { kind: 'slink', x: 3, y: 3 }],
      [
        { kind: 'thistle', x: 2, y: 2 },
        { kind: 'creeper', x: 1, y: 1 },
      ],
      1,
      6,
      6,
      SHARP,
    );
    expect(s.telegraphs[0].to).toEqual({ x: 3, y: 3 });
    expect(s.telegraphs[0].pieceId).toBe(idAt(s, 2, 2));
  });

  it('sharp: the keeper is always worth it, guarded or not', () => {
    const s = fight(
      [{ kind: 'keeper', x: 4, y: 5 }, { kind: 'slink', x: 2, y: 3 }],
      [{ kind: 'golem', x: 4, y: 0 }],
      1,
      6,
      6,
      SHARP,
    );
    expect(s.telegraphs[0].to).toEqual({ x: 4, y: 5 });
  });
});
