import { isPawn, isSlider, movesFor, pieceAt, threatsFor } from '../game/board';
import type { FightState, Telegraph, Vec } from '../game/types';
import { ICONS, type IconName } from './icons';
import { drawRankBadge, drawSprite } from './sprites';

export const TILE = 16;

export interface FX {
  at: Vec;
  kind: 'poof' | 'shaken' | 'bonk' | 'ward' | 'cloak';
  t: number; // frames elapsed
  /** cloak: where the rescued friend drifted to, so the drift can be drawn */
  to?: Vec;
}

/**
 * How long each effect lives, in frames. A trinket save gets roughly twice the
 * life of a scuffle: it is the one moment where the rules appear to break — a
 * telegraphed capture simply doesn't happen — so it has to hold the eye long
 * enough to be read, not just glimpsed.
 */
export const FX_LIFE: Record<FX['kind'], number> = {
  poof: 26,
  shaken: 26,
  bonk: 26,
  ward: 54,
  cloak: 54,
};

/** id -> fractional board-cell position, for the enemy-move tween. */
export type PosOverrides = Map<number, Vec>;

export interface View {
  selected: number | null;
  hover: Vec | null;
  fx: FX[];
  /** while set, drawn instead of s.pieces' real positions (mid-tween) */
  posOverrides?: PosOverrides;
  /** while set, drawn instead of s.telegraphs (the round that's resolving) */
  telegraphOverride?: Telegraph[];
  /** dev x-ray: draw shrouded telegraphs as real arrows */
  revealVeiled?: boolean;
  /** the region's two checker greens for the board tiles */
  ground?: [string, string];
  /** a piece in hand: drawn last so it rides over everything it passes */
  carried?: number;
}

const GRASS_A = '#87aa56';
const GRASS_B = '#7b9e4b';

export function draw(ctx: CanvasRenderingContext2D, s: FightState, v: View, time: number) {
  // ground — the region's checker; the Deep Bramble greens are the fallback
  const [grassA, grassB] = v.ground ?? [GRASS_A, GRASS_B];
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? grassA : grassB;
      ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
    }
  }

  // enemy telegraphs: arrow + marked target square
  const telegraphs = v.telegraphOverride ?? s.telegraphs;
  for (const t of telegraphs) {
    const e = s.pieces.find((p) => p.id === t.pieceId);
    if (!e) continue;
    if (t.veiled && !v.revealVeiled) {
      // shrouded: it HAS committed — the player just doesn't get the arrow
      questionGlyph(ctx, e.x, e.y);
      continue;
    }
    if (!t.to) {
      // nowhere to go. The Heart digging in is a stand, not a nap — it gets
      // bracing roots; everyone else gets an honest snooze.
      if (e.kind === 'heart') digGlyph(ctx, e.x, e.y);
      else sleepGlyph(ctx, e.x, e.y);
      continue;
    }
    // red only for a real attack: a friend on the target square that this
    // enemy actually threatens. A friend merely blocking a pawn's forward
    // step stays purple — that arrow is going to bonk, not bite.
    const from = v.posOverrides?.get(e.id) ?? e;
    const aims = t.alt ? [t.to, t.alt] : [t.to];
    for (const aim of aims) {
      // A slider takes the first friend anywhere along its committed ray — even
      // past the aimed square — so draw the whole lane, not a stub to one cell.
      // The lane's end is where the threat really stops: the friend it bites, or
      // the last square before an own-plant / the board edge.
      if (isSlider(e.kind)) {
        const lane = sliderLane(s, from, aim);
        if (lane.bite) {
          // a friend sits on the lane now — the slider takes the first one it
          // reaches, so the arrow lands where it bites.
          arrow(ctx, from, lane.end, '#e05252');
          corners(ctx, lane.end.x, lane.end.y, '#e05252');
        } else {
          // quiet move: it *covers* the whole lane but will actually step onto
          // the committed square `aim`. Arrow to where it moves; wash the
          // overshoot it still bites (the "could pounce here" read) so the
          // whole rank/file/diagonal still reads as dangerous.
          arrow(ctx, from, aim, '#7a5fae');
          corners(ctx, aim.x, aim.y, '#7a5fae');
          laneWash(ctx, aim, lane.end);
        }
        continue;
      }
      const occ = pieceAt(s, aim.x, aim.y);
      const targetsFriend =
        occ?.side === 'friend' && threatsFor(s, e).some((q) => q.x === aim.x && q.y === aim.y);
      const col = targetsFriend ? '#e05252' : '#7a5fae';
      arrow(ctx, from, aim, col);
      corners(ctx, aim.x, aim.y, col);
    }
  }

  // the spread clock's warning: a thistle will sprout here next turn
  if (s.pendingSprout) {
    const p = s.pendingSprout;
    corners(ctx, p.x, p.y, '#8fc460');
    // a tiny wiggling shoot, breaking soil on the pixel grid
    const wob = Math.floor(time / 300) % 2;
    ctx.fillStyle = '#8fc460';
    ctx.fillRect(p.x * TILE + 7, p.y * TILE + 9, 2, 4);
    ctx.fillRect(p.x * TILE + 5 + wob, p.y * TILE + 7, 2, 2);
    ctx.fillRect(p.x * TILE + 9 - wob, p.y * TILE + 8, 2, 2);
  }

  // Selected friend: its legal moves. The default hint promises "glowing
  // squares", so they must actually glow — a fat dot with a dark offset
  // shadow for a plain step, gold catch-brackets where a bramble creature can
  // be taken, and a slow shimmer on the wash (the idle-bob clock) so live
  // choices read as live even in a still screenshot.
  if (v.selected != null) {
    const p = s.pieces.find((q) => q.id === v.selected);
    if (p) {
      const shimmer = Math.floor(time / 450) % 2 === 0;
      for (const m of movesFor(s, p)) {
        ctx.fillStyle = shimmer ? 'rgba(255, 217, 102, 0.44)' : 'rgba(255, 217, 102, 0.32)';
        ctx.fillRect(m.x * TILE + 1, m.y * TILE + 1, TILE - 2, TILE - 2);
        if (pieceAt(s, m.x, m.y)) {
          // a catch: brackets, not a dot — the square already has a face in it
          corners(ctx, m.x, m.y, '#ffd966');
        } else {
          ctx.fillStyle = '#241533';
          ctx.fillRect(m.x * TILE + 7, m.y * TILE + 7, 4, 4);
          ctx.fillStyle = '#ffd966';
          ctx.fillRect(m.x * TILE + 6, m.y * TILE + 6, 4, 4);
        }
      }
      corners(ctx, p.x, p.y, '#ffd966');
    }
  }

  // hover: everywhere the tapped creature could reach — deliberately styled
  // apart from the committed-attack marker (soft wash + center dot, no
  // corners/arrow) so "could pounce here" never reads as "will move here".
  // Pawns' empty diagonals aren't shown — an empty square nothing can be
  // taken from reads as noise, not information.
  if (v.hover) {
    const p = pieceAt(s, v.hover.x, v.hover.y);
    if (p) {
      const bramble = p.side === 'bramble';
      const wash = bramble ? 'rgba(224, 122, 82, 0.22)' : 'rgba(120, 170, 255, 0.22)';
      const dot = bramble ? '#e07a52' : '#78aaff';
      for (const t of threatsFor(s, p)) {
        if (isPawn(p.kind) && t.x !== p.x && !pieceAt(s, t.x, t.y)) continue;
        ctx.fillStyle = wash;
        ctx.fillRect(t.x * TILE + 1, t.y * TILE + 1, TILE - 2, TILE - 2);
        ctx.fillStyle = dot;
        ctx.fillRect(t.x * TILE + 7, t.y * TILE + 7, 2, 2);
      }
    }
  }

  // A save's ground wash goes UNDER the pieces: the rescued friend should sit in
  // a pool of lantern light, not behind a curtain of sparks.
  for (const f of v.fx) {
    if (f.kind !== 'ward' && f.kind !== 'cloak') continue;
    const home = f.kind === 'cloak' ? (f.to ?? f.at) : f.at;
    const fade = Math.min(1, (FX_LIFE[f.kind] - f.t) / 14);
    ctx.fillStyle = `rgba(255, 217, 102, ${0.34 * fade})`;
    ctx.fillRect(home.x * TILE + 1, home.y * TILE + 1, TILE - 2, TILE - 2);
  }

  // pieces, with a 1px integer idle bob (never fractional — pixel grid is sacred).
  // A carried piece goes last: it should pass over its neighbours, not under.
  const order =
    v.carried == null
      ? s.pieces
      : [...s.pieces.filter((p) => p.id !== v.carried), ...s.pieces.filter((p) => p.id === v.carried)];
  for (const p of order) {
    const pos = v.posOverrides?.get(p.id) ?? p;
    const px = Math.round(pos.x * TILE);
    const py = Math.round(pos.y * TILE);
    // no ground marker — the sprites themselves carry the team read
    // (warm critters vs. dusky plants), and anything painted under the feet
    // ends up looking like a plinth
    const bob = (Math.floor(time / 450) + p.id) % 2 === 0 ? 0 : -1;
    drawSprite(ctx, p.kind, px + 2, py + 2 + bob);
    // the rank chip rides along the tile's bottom edge, not on the critter, so
    // it stays put while they bob — a steady place to read "these two are the
    // same". Inset from the corner so it never buries a selection marker.
    drawRankBadge(ctx, p.kind, p.side, px + 2, py + 11);
  }

  // capture / shaken / blocked effects
  for (const f of v.fx) {
    if (f.kind === 'ward' || f.kind === 'cloak') {
      saveFx(ctx, f);
      continue;
    }
    const cx = f.at.x * TILE + 8;
    const cy = f.at.y * TILE + 8;
    const r = 1 + Math.floor(f.t / 4);
    const cols =
      f.kind === 'poof'
        ? ['#f0b0c0', '#f2f0e4', '#ffd966']
        : f.kind === 'bonk'
          ? ['#ffd966', '#f2f0e4']
          : ['#b8c4d8', '#8a94a8'];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const px = cx + Math.round(Math.cos(a) * r);
      const py = cy + Math.round(Math.sin(a) * r);
      ctx.fillStyle = cols[(i + f.t) % cols.length];
      ctx.fillRect(px, py, 1, 1);
    }
  }
}

const SAVE_GOLD = '#ffd966';
const SAVE_CREAM = '#f6f3e8';

/**
 * A trinket save, drawn loud. This is the one event where the game appears to
 * cheat — a capture was telegraphed in red, and then the friend is still there
 * (Ward) or somewhere else entirely (Cloak). The old effect was the same small
 * grey scuffle used for a bump, which is why it read as "nothing happened".
 *
 * So: a gold burst that outlives every other effect, the trinket's own HUD icon
 * popping over the square so the cause is named in the same art the badge uses,
 * and — for the Cloak — a dotted trail drawn from where the friend was caught to
 * where it drifted home, so the teleport has a line you can follow.
 */
function saveFx(ctx: CanvasRenderingContext2D, f: FX) {
  const life = FX_LIFE[f.kind];
  const home = f.kind === 'cloak' ? (f.to ?? f.at) : f.at;
  // the drift: dots laid down from the capture square toward home, revealed a
  // few at a time so the eye is pulled along the path rather than teleported
  if (f.kind === 'cloak' && f.to && (f.to.x !== f.at.x || f.to.y !== f.at.y)) {
    const ax = f.at.x * TILE + 8;
    const ay = f.at.y * TILE + 8;
    const bx = f.to.x * TILE + 8;
    const by = f.to.y * TILE + 8;
    const dist = Math.hypot(bx - ax, by - ay);
    const lead = (f.t / 16) * dist; // the spark's head, in pixels along the path
    for (let d = 4; d <= dist - 4; d += 5) {
      if (d > lead) break;
      const px = Math.round(ax + ((bx - ax) * d) / dist);
      const py = Math.round(ay + ((by - ay) * d) / dist);
      // the tail dims behind the spark so the direction of travel is unmistakable
      const age = lead - d;
      ctx.fillStyle = age < 12 ? SAVE_CREAM : SAVE_GOLD;
      const s = age < 12 ? 2 : 1;
      ctx.fillRect(px, py, s, s);
    }
  }
  // rings: two, one chasing the other out of the square that was saved
  const cx = home.x * TILE + 8;
  const cy = home.y * TILE + 8;
  for (const delay of [0, 10]) {
    const age = f.t - delay;
    if (age < 0 || age > 30) continue;
    const r = 2 + Math.floor(age / 3);
    ctx.fillStyle = age > 20 ? SAVE_GOLD : SAVE_CREAM;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      ctx.fillRect(cx + Math.round(Math.cos(a) * r), cy + Math.round(Math.sin(a) * r), 1, 1);
    }
  }
  // a held gold frame on the square the friend is standing on now — after the
  // burst clears, this is what says "look here, this one is still yours"
  if (Math.floor(f.t / 5) % 2 === 0 || f.t > 40) corners(ctx, home.x, home.y, SAVE_GOLD);
  // the trinket's own icon, rising and fading over the square
  const rise = Math.min(6, Math.floor(f.t / 4));
  const iconY = home.y * TILE - 6 - rise;
  ctx.globalAlpha = f.t > life - 12 ? (life - f.t) / 12 : 1;
  pixelIcon(ctx, f.kind === 'ward' ? 'leaf' : 'cloak', home.x * TILE + 2, Math.max(-2, iconY));
  ctx.globalAlpha = 1;
}

/**
 * Paint a 12×12 UI icon straight onto the board, on whole pixels, over a dark
 * offset shadow — a gold icon on bright grass is unreadable without one.
 */
function pixelIcon(ctx: CanvasRenderingContext2D, name: IconName, px: number, py: number) {
  const icon = ICONS[name];
  for (const [shade, ox, oy] of [[true, 1, 1], [false, 0, 0]] as const) {
    icon.rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const c = icon.colors[row[x]];
        if (!c) continue;
        ctx.fillStyle = shade ? '#241533' : c;
        ctx.fillRect(px + x + ox, py + y + oy, 1, 1);
      }
    });
  }
}

/**
 * How far a slider's committed ray actually reaches, mirroring landingFor: it
 * walks from the mover along the aimed direction and stops at the first friend
 * it would bite (that square is the end), or at the last empty square before an
 * own-plant / the board edge. `bite` is set when a friend sits on the lane.
 */
function sliderLane(s: FightState, from: Vec, to: Vec): { end: Vec; bite: Vec | null } {
  const fx = Math.round(from.x);
  const fy = Math.round(from.y);
  const dx = Math.sign(to.x - fx);
  const dy = Math.sign(to.y - fy);
  let end: Vec = { x: fx, y: fy };
  let bite: Vec | null = null;
  // No direction means no lane to walk. This happens mid-tween: `from` is the
  // mover's interpolated position, and when it rounds onto an (empty) `to` the
  // step below would be (0,0) and the loop would never advance — a hard freeze.
  if (dx === 0 && dy === 0) return { end, bite };
  let x = fx + dx;
  let y = fy + dy;
  while (x >= 0 && y >= 0 && x < s.w && y < s.h) {
    const occ = pieceAt(s, x, y);
    if (occ) {
      if (occ.side === 'friend') {
        bite = { x, y };
        end = { x, y };
      }
      break; // own-plant or a friend: the lane ends here either way
    }
    end = { x, y };
    x += dx;
    y += dy;
  }
  return { end, bite };
}

/**
 * Faint "I also cover this" wash over the squares a quiet slider overshoots —
 * from the square past its committed landing out to the lane's end. Mirrors the
 * hover threat wash (soft fill + center dot) so it reads as "could pounce here,"
 * distinct from the arrow's "will move here."
 */
function laneWash(ctx: CanvasRenderingContext2D, from: Vec, end: Vec) {
  const dx = Math.sign(end.x - from.x);
  const dy = Math.sign(end.y - from.y);
  if (dx === 0 && dy === 0) return;
  let x = from.x + dx;
  let y = from.y + dy;
  // Bounded walk. `from`/`end` come from committed telegraphs re-projected onto
  // a board that may have shifted mid-tween (interpolated origins), so never
  // trust `x===end` alone to terminate — a non-collinear pair would spin the
  // whole main thread. Cap at the longest a board lane can be.
  for (let step = 0; step < 32; step++) {
    ctx.fillStyle = 'rgba(122, 95, 174, 0.20)';
    ctx.fillRect(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2);
    ctx.fillStyle = '#7a5fae';
    ctx.fillRect(x * TILE + 7, y * TILE + 7, 2, 2);
    if (x === end.x && y === end.y) break;
    x += dx;
    y += dy;
  }
}

function corners(ctx: CanvasRenderingContext2D, x: number, y: number, col: string) {
  const px = x * TILE;
  const py = y * TILE;
  ctx.fillStyle = col;
  for (const [cx, cy, dx, dy] of [
    [px, py, 1, 1],
    [px + TILE - 1, py, -1, 1],
    [px, py + TILE - 1, 1, -1],
    [px + TILE - 1, py + TILE - 1, -1, -1],
  ] as const) {
    ctx.fillRect(cx, cy, 1, 1);
    ctx.fillRect(cx + dx, cy, 1, 1);
    ctx.fillRect(cx, cy + dy, 1, 1);
  }
}

/**
 * Chunky dotted telegraph path. Leapers get their true L — the long leg,
 * then the turn — so the shape of the hop is the thing players memorize.
 * Every leg is axis-aligned or a perfect diagonal, so the dots and the
 * arrowhead always sit crisply on the pixel grid.
 */
function arrow(ctx: CanvasRenderingContext2D, from: Vec, to: Vec, col: string) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const cells: Vec[] =
    dx !== 0 && dy !== 0 && Math.abs(dx) !== Math.abs(dy)
      ? Math.abs(dx) > Math.abs(dy)
        ? [from, { x: to.x, y: from.y }, to]
        : [from, { x: from.x, y: to.y }, to]
      : [from, to];
  const pts = cells.map((c) => ({ x: c.x * TILE + 8, y: c.y * TILE + 8 }));
  ctx.fillStyle = col;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    if (dist < 1) continue;
    const ux = (b.x - a.x) / dist;
    const uy = (b.y - a.y) / dist;
    const last = i === pts.length - 2;
    const start = i === 0 ? 6 : 3; // clear the mover's own sprite first
    const end = last ? dist - 7 : dist - 2; // leave room for the head / elbow
    for (let d = start; d <= end; d += 4) {
      ctx.fillRect(Math.round(a.x + ux * d) - 1, Math.round(a.y + uy * d) - 1, 2, 2);
    }
    if (!last) ctx.fillRect(Math.round(b.x) - 1, Math.round(b.y) - 1, 2, 2); // the elbow
    else arrowHead(ctx, b, Math.sign(Math.round(b.x - a.x)), Math.sign(Math.round(b.y - a.y)));
  }
}

/** Crisp pixel arrowhead pointing along an axis or diagonal (sx,sy ∈ -1..1). */
function arrowHead(ctx: CanvasRenderingContext2D, at: Vec, sx: number, sy: number) {
  const tx = at.x - sx * 4;
  const ty = at.y - sy * 4;
  const px = -sy;
  const py = sx;
  for (let i = 0; i < 4; i++) {
    const w = Math.min(i, 2);
    for (let j = -w; j <= w; j++) {
      ctx.fillRect(tx - sx * i + px * j, ty - sy * i + py * j, 1, 1);
    }
  }
}

/** A "?" over a shrouded enemy: it has a plan, you just can't read it. */
function questionGlyph(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const rows = ['.##.', '#..#', '...#', '..#.', '....', '..#.'];
  glyph(ctx, rows, x * TILE + 10, y * TILE, '#efe9f7');
}

/** Shared pixel-map painter: dark drop shadow, then the light glyph. */
function glyph(ctx: CanvasRenderingContext2D, rows: string[], px: number, py: number, light: string) {
  for (const [fill, ox, oy] of [
    ['#241533', 1, 1],
    [light, 0, 0],
  ] as const) {
    ctx.fillStyle = fill;
    rows.forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx++) {
        if (row[rx] === '#') ctx.fillRect(px + rx + ox, py + ry + oy, 1, 1);
      }
    });
  }
}

/** A "zZ" over an enemy that is holding still this round. */
function sleepGlyph(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // one small z, one big Z — unmistakably a snooze (the old 3px version
  // famously read as "a little sideways h")
  const rows = [
    '......####',
    '........#.',
    '.......#..',
    '......####',
    '.#####....',
    '....#.....',
    '...#......',
    '..#.......',
    '.#####....',
  ];
  glyph(ctx, rows, x * TILE + 5, y * TILE - 1, '#efe9f7');
}

/** Roots curling out at the Heart's feet: dug in, braced, going nowhere. */
function digGlyph(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const rows = [
    '#...#...#..#',
    '.#..#..#..#.',
    '..#########.',
  ];
  glyph(ctx, rows, x * TILE + 2, y * TILE + 12, '#8fc460');
}
