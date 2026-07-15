import './style.css';
import { movesFor, pieceAt } from './game/board';
import {
  createFight,
  enemies,
  playerHasMove,
  playerMove,
  promote,
  resolveEnemyTurn,
  takeFreeMove,
  type PromotionKind,
} from './game/fight';
import {
  afterFightWon,
  buildFightConfig,
  campDue,
  campHeal,
  campSnack,
  FIGHTS,
  KIND_INFO,
  newRun,
  offerRecruits,
  offerTrinkets,
  recruit,
  ROSTER_CAP,
  takeTrinket,
  TRINKETS,
  type RunState,
  type TrinketId,
} from './game/run';
import type { FightState, Kind, Telegraph, Vec } from './game/types';
import { draw, TILE, type FX, type PosOverrides } from './render/scene';
import { drawSprite } from './render/sprites';

const OBJECTIVE = 'Catch every bramble creature to win the clearing.';
const DEFAULT_HINT = 'Tap a friend (on the board or below), then tap a glowing square to move them.';
const PAUSE_MS = 340; // beat after your move, before the bramble acts
const TWEEN_MS = 190; // how long their slide/leap takes to draw
const PLAYER_TWEEN_MS = 120; // your own piece sliding into place

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header id="hud">
    <div id="hud-row"><span id="fightname">Overgrown</span><span id="trinkets"></span><span id="turn"></span></div>
    <div id="goal"></div>
    <div id="legend">
      <span><i class="sw go"></i>your moves</span>
      <span><i class="sw move"></i>their move</span>
      <span><i class="sw hit"></i>their attack!</span>
    </div>
  </header>
  <div id="board-area">
    <div class="sun"></div>
    <div id="board-wrap" class="idle">
      <div id="phaseflag"></div>
      <canvas id="board" width="96" height="96"></canvas>
    </div>
  </div>
  <div id="hint"></div>
  <div id="roster"></div>
  <div id="overlay" class="hidden"></div>
`;

const canvas = document.querySelector<HTMLCanvasElement>('#board')!;
const ctx = canvas.getContext('2d')!;
const boardAreaEl = document.querySelector<HTMLDivElement>('#board-area')!;
const hudName = document.querySelector<HTMLSpanElement>('#fightname')!;
const hudTurn = document.querySelector<HTMLSpanElement>('#turn')!;
const goalEl = document.querySelector<HTMLDivElement>('#goal')!;
const trinketsEl = document.querySelector<HTMLSpanElement>('#trinkets')!;
const phaseFlagEl = document.querySelector<HTMLDivElement>('#phaseflag')!;
const hintEl = document.querySelector<HTMLDivElement>('#hint')!;
const rosterEl = document.querySelector<HTMLDivElement>('#roster')!;
const overlayEl = document.querySelector<HTMLDivElement>('#overlay')!;

type Phase = 'player' | 'enemy';

let run: RunState | null = null;
let fight: FightState | null = null;
let lineup: number[] = [];
/** companion index (in run.companions) -> its live piece id this fight */
let companionPieceId = new Map<number, number>();
let phase: Phase = 'player';
let selected: number | null = null;
let inspect: Vec | null = null;
let fx: FX[] = [];
let tweens: { id: number; from: Vec; to: Vec }[] = [];
let tweenStart = 0;
let tweenDur = TWEEN_MS;
let frozenTelegraphs: Telegraph[] | null = null;
/** set while resolving if the bramble got stuffed — shown as the next hint */
let blockedNote: string | null = null;

// ---------- overlays ----------

interface Choice {
  label: string;
  sub?: string;
  fn: () => void;
}

function showOverlay(title: string, body: string, choices: Choice[]) {
  overlayEl.innerHTML = `<div class="card"><h2>${title}</h2><p>${body}</p><div class="btns"></div></div>`;
  const btns = overlayEl.querySelector('.btns')!;
  for (const c of choices) {
    const b = document.createElement('button');
    b.innerHTML = c.sub ? `${c.label}<small>${c.sub}</small>` : c.label;
    b.onclick = () => {
      overlayEl.classList.add('hidden');
      c.fn();
    };
    btns.append(b);
  }
  overlayEl.classList.remove('hidden');
}

// ---------- run flow ----------

function title() {
  showOverlay(
    'Overgrown 🌼',
    'The meadow is overgrown and the Keeper’s lantern is lit. Lead your friends, ' +
      'read the bramble’s intentions, and take the meadow back one clearing at a time.',
    [{ label: 'Set out', fn: startRun }],
  );
}

function startRun() {
  run = newRun(Date.now() % 2147483647);
  fightIntro();
}

function fightIntro() {
  if (!run) return;
  const spec = FIGHTS[run.fightIndex];
  showOverlay(
    `Clearing ${run.fightIndex + 1}: ${spec.name}`,
    `${spec.intro}<span class="objective">🌼 ${spec.objective ?? OBJECTIVE}</span>`,
    [{ label: 'Onward', fn: beginFight }],
  );
}

function beginFight() {
  if (!run) return;
  const built = buildFightConfig(run);
  lineup = built.lineup;
  companionPieceId = new Map(lineup.map((compIdx, j) => [compIdx, 2 + j]));
  fight = createFight(built.cfg, run.rng);
  phase = 'player';
  selected = null;
  inspect = null;
  fx = [];
  tweens = [];
  frozenTelegraphs = null;
  canvas.width = fight.w * TILE;
  canvas.height = fight.h * TILE;
  document.querySelector('#board-wrap')!.classList.remove('idle');
  requestAnimationFrame(sizeCanvas);
  hintEl.textContent = DEFAULT_HINT;
  refreshHud();
  maybeAutoWait();
}

/**
 * Stalemate guard: if nobody can move, say so loudly and let the bramble
 * take its turn rather than soft-locking the fight.
 */
function maybeAutoWait() {
  if (!fight || fight.status !== 'playing' || phase !== 'player') return;
  if (playerHasMove(fight)) return;
  hintEl.textContent = 'Everyone is hemmed in — nowhere to step! Hold tight…';
  setTimeout(beginEnemyTurn, 900);
}

function endOfFight() {
  if (!run || !fight) return;
  if (fight.status === 'lost') {
    showOverlay(
      'The lantern goes out',
      `The brambles got the Keeper in ${fight.name}. Everyone walks home for tea and tries again tomorrow.`,
      [{ label: 'Try again', fn: startRun }],
    );
    return;
  }

  // settle roster: who survived (and keep any mid-fight evolutions)
  const alive = new Set<number>();
  for (const [compIdx, pieceId] of companionPieceId) {
    const piece = fight.pieces.find((p) => p.id === pieceId && p.side === 'friend');
    if (piece) {
      alive.add(compIdx);
      run.companions[compIdx].kind = piece.kind;
    }
  }
  const shakenNames = lineup.filter((i) => !alive.has(i)).map((i) => run!.companions[i].name);
  afterFightWon(run, lineup, alive);

  if (run.status === 'won') {
    const friends = run.companions.filter((c) => !c.shaken).length;
    showOverlay(
      'The meadow is quiet 🌼',
      'The Bramble Heart bursts into a thousand flowers. Somewhere behind you, someone puts a kettle on. ' +
        `You won the whole thing — ${FIGHTS.length} clearings taken back, ` +
        `and ${friends + 1} of you walking home for tea.`,
      [{ label: 'New run', fn: startRun }],
    );
    rainPetals();
    return;
  }

  const shakenNote = shakenNames.length
    ? ` ${shakenNames.join(' and ')} ${shakenNames.length > 1 ? 'are' : 'is'} a bit shaken and will sit the next one out.`
    : '';
  const body = `The brambles scatter into flowers.${shakenNote}`;

  if (run.companions.length >= ROSTER_CAP) {
    showOverlay('Clearing won!', body + ' Camp is full of friends already.', [
      { label: 'Onward', fn: nextStop },
    ]);
    return;
  }

  const offers = offerRecruits(run);
  showOverlay(
    'Clearing won!',
    body + ' Someone shy is watching from the tall grass…',
    [
      ...offers.map((kind) => ({
        label: `Befriend the ${KIND_INFO[kind].title}`,
        sub: KIND_INFO[kind].blurb,
        fn: () => {
          recruit(run!, kind);
          nextStop();
        },
      })),
      { label: 'Travel light', sub: 'No new friends this time.', fn: nextStop },
    ],
  );
}

/** Between fights: a find in the grass after the first clearing, campfires later. */
function nextStop() {
  if (!run) return;
  if (run.fightIndex === 1) trinketFound();
  else if (campDue(run)) campStop();
  else fightIntro();
}

function trinketFound() {
  if (!run) return;
  const offers = offerTrinkets(run, 2);
  if (!offers.length) return fightIntro();
  showOverlay(
    'Something glints in the grass ✨',
    'Half-buried by the path. It hums a little. You can only carry one more thing.',
    offers.map((id) => ({
      label: `${TRINKETS[id].icon} ${TRINKETS[id].title}`,
      sub: TRINKETS[id].blurb,
      fn: () => {
        takeTrinket(run!, id);
        fightIntro();
      },
    })),
  );
}

function campStop() {
  if (!run) return;
  const shaken = run.companions.filter((c) => c.shaken).map((c) => c.name);
  const snackable = run.companions
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => !c.spry);
  const choices: Choice[] = [];
  if (shaken.length) {
    choices.push({
      label: 'Warm mash 🍲',
      sub: `${shaken.join(' and ')} perk${shaken.length > 1 ? '' : 's'} right up and rejoin${shaken.length > 1 ? '' : 's'} the band.`,
      fn: () => {
        campHeal(run!);
        fightIntro();
      },
    });
  }
  if (snackable.length) {
    choices.push({
      label: 'Honeycake 🍯',
      sub: 'One friend gets a spring in their step — for good. (A plain sidestep, any direction.)',
      fn: honeycakeChoice,
    });
  }
  const found = offerTrinkets(run, 1);
  if (found.length) {
    const id: TrinketId = found[0];
    choices.push({
      label: `${TRINKETS[id].icon} Take the ${TRINKETS[id].title}`,
      sub: `Spotted at the edge of the firelight. ${TRINKETS[id].blurb}`,
      fn: () => {
        takeTrinket(run!, id);
        fightIntro();
      },
    });
  }
  choices.push({ label: 'Rest quietly', sub: 'Just the crackle of the fire.', fn: fightIntro });
  showOverlay(
    'Campfire',
    'A quiet hollow off the path. The kettle whistles. There’s time for exactly one comfort.',
    choices,
  );
}

function honeycakeChoice() {
  if (!run) return;
  showOverlay(
    'Honeycake 🍯',
    'Who gets it? (No take-backs — it is a very good cake.)',
    run.companions
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => !c.spry)
      .map(({ c, i }) => ({
        label: c.name,
        sub: `${KIND_INFO[c.kind].title} — gains a plain one-step move in any direction.`,
        fn: () => {
          campSnack(run!, i);
          fightIntro();
        },
      })),
  );
}

/** Flower confetti over the current overlay. Purely ceremonial. */
function rainPetals() {
  const flowers = ['🌼', '🌸', '💮', '🌷'];
  for (let i = 0; i < 28; i++) {
    const p = document.createElement('span');
    p.className = 'petal';
    p.textContent = flowers[i % flowers.length];
    p.style.left = `${(i * 37 + 11) % 100}%`;
    p.style.animationDelay = `${(i % 7) * 0.45}s`;
    p.style.animationDuration = `${3 + (i % 5) * 0.6}s`;
    overlayEl.append(p);
  }
}

function promotionChoice() {
  const options: PromotionKind[] = ['hopper', 'slink', 'rumble'];
  // the Duchess only answers late in the run
  if (run && run.fightIndex >= 4) options.push('duchess');
  showOverlay(
    'Something blossoms ✨',
    'Crossing the whole meadow changes a critter. Who do they become?',
    options.map((kind) => ({
      label: KIND_INFO[kind].title,
      sub: KIND_INFO[kind].blurb,
      fn: () => {
        promote(fight!, kind);
        drainEvents();
        refreshHud();
        proceedAfterPlayerAction();
      },
    })),
  );
}

// ---------- hud ----------

function phaseLabel(): string {
  if (!fight) return '';
  if (fight.status === 'lost') return 'lantern out';
  if (fight.status === 'won') return 'clearing won!';
  return phase === 'enemy' ? "the bramble moves…" : `your move · turn ${fight.turn}`;
}

function refreshHud() {
  if (!run || !fight) return;
  hudName.textContent = `${fight.name} (${run.fightIndex + 1}/${FIGHTS.length})`;
  hudTurn.textContent = phaseLabel();
  const heart = fight.pieces.find((p) => p.kind === 'heart');
  const left = enemies(fight).length - (heart ? 1 : 0);
  goalEl.textContent =
    fight.status === 'won'
      ? 'Clearing won! 🌼'
      : heart
        ? `Corner the Bramble Heart — nowhere safe to step!${left ? ` 🌿 ${left} guards` : ''}`
        : `${OBJECTIVE} 🌿 ${left} left`;
  phaseFlagEl.textContent = phase === 'enemy' ? "🌱 the bramble's move" : '';
  phaseFlagEl.classList.toggle('show', phase === 'enemy' && fight.status === 'playing');
  trinketsEl.innerHTML = '';
  for (const id of run.trinkets) {
    const t = document.createElement('span');
    t.textContent = TRINKETS[id].icon;
    t.title = `${TRINKETS[id].title} — ${TRINKETS[id].blurb}`;
    trinketsEl.append(t);
  }
  renderRoster();
}

function renderRoster() {
  rosterEl.innerHTML = '';
  if (!run || !fight) return;
  rosterEl.append(rosterButton('The Keeper', 'keeper', 1, false));
  for (let i = 0; i < run.companions.length; i++) {
    const c = run.companions[i];
    const pieceId = companionPieceId.get(i);
    const alive = pieceId != null && fight.pieces.some((p) => p.id === pieceId);
    rosterEl.append(
      rosterButton(c.name, c.kind, pieceId ?? -1, c.shaken || !alive, c.shaken ? '💤' : c.spry ? '🍯' : undefined),
    );
  }
}

function rosterButton(name: string, kind: Kind, pieceId: number, disabled: boolean, badge?: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'roster-btn' + (selected === pieceId ? ' selected' : '');
  b.disabled = disabled || phase !== 'player' || !fight || fight.status !== 'playing';
  const mini = document.createElement('canvas');
  mini.className = 'mini';
  mini.width = 12;
  mini.height = 12;
  drawSprite(mini.getContext('2d')!, kind, 0, 0);
  b.append(mini);
  const label = document.createElement('span');
  label.className = 'rb-name';
  label.textContent = badge ? `${name} ${badge}` : name;
  b.append(label);
  if (KIND_INFO[kind].title !== name) {
    const sub = document.createElement('span');
    sub.className = 'rb-kind';
    sub.textContent = KIND_INFO[kind].title;
    b.append(sub);
  }
  b.onclick = () => selectPiece(pieceId);
  return b;
}

function describe(kind: Kind): string {
  const info = KIND_INFO[kind];
  return `${info.title}: ${info.blurb}`;
}

// ---------- selection & movement ----------

function selectPiece(pieceId: number) {
  if (!fight || phase !== 'player' || fight.status !== 'playing') return;
  const p = fight.pieces.find((q) => q.id === pieceId);
  if (!p) return;
  inspect = { x: p.x, y: p.y };
  selected = p.side === 'friend' ? p.id : null;
  hintEl.textContent = describe(p.kind);
  refreshHud();
}

function attemptMove(pieceId: number, to: Vec) {
  if (!fight || phase !== 'player') return;
  const mover = fight.pieces.find((p) => p.id === pieceId);
  const from = mover ? { x: mover.x, y: mover.y } : null;
  if (!playerMove(fight, pieceId, to)) return;
  if (from) {
    tweens = [{ id: pieceId, from, to }];
    tweenStart = performance.now();
    tweenDur = PLAYER_TWEEN_MS;
  }
  selected = null;
  inspect = null;
  drainEvents();
  refreshHud();
  proceedAfterPlayerAction();
}

/** After any player action settles: promotion first, then win/loss, then a
 * banked Second Breakfast move, then the bramble's turn. */
function proceedAfterPlayerAction() {
  if (!fight) return;
  if (fight.pendingPromotion != null) {
    promotionChoice();
    return;
  }
  if (fight.status !== 'playing') {
    setTimeout(endOfFight, 650);
    return;
  }
  if (takeFreeMove(fight)) {
    hintEl.textContent = 'Second Breakfast! 🥞 Take one more move.';
    refreshHud();
    maybeAutoWait();
    return;
  }
  beginEnemyTurn();
}

/**
 * Pause on the pre-resolve board so the player registers the threat, resolve
 * the enemy telegraphs, then tween pieces into their new squares — a
 * distinct, watchable "their turn" beat instead of an instant state swap.
 */
function beginEnemyTurn() {
  if (!fight) return;
  phase = 'enemy';
  hintEl.textContent = "Watch the bramble's move…";
  refreshHud();

  const snapTelegraphs = fight.telegraphs.map((t) => ({ ...t }));
  const snapPositions = new Map<number, Vec>(
    fight.pieces.filter((p) => p.side === 'bramble').map((p) => [p.id, { x: p.x, y: p.y }]),
  );
  frozenTelegraphs = snapTelegraphs;

  setTimeout(() => {
    if (!fight) return;
    blockedNote = null;
    resolveEnemyTurn(fight);
    drainEvents();

    tweens = [];
    for (const t of snapTelegraphs) {
      if (!t.to) continue;
      const from = snapPositions.get(t.pieceId);
      const stillThere = fight.pieces.find((p) => p.id === t.pieceId);
      if (!from || !stillThere) continue;
      if (stillThere.x !== from.x || stillThere.y !== from.y) {
        tweens.push({ id: t.pieceId, from, to: { x: stillThere.x, y: stillThere.y } });
      }
    }
    tweenStart = performance.now();
    tweenDur = TWEEN_MS;
    refreshHud();

    setTimeout(
      () => {
        tweens = [];
        frozenTelegraphs = null;
        phase = 'player';
        if (fight!.status === 'playing') hintEl.textContent = blockedNote ?? DEFAULT_HINT;
        refreshHud();
        if (fight!.status !== 'playing') setTimeout(endOfFight, 350);
        else maybeAutoWait();
      },
      tweens.length ? TWEEN_MS : 60,
    );
  }, PAUSE_MS);
}

// ---------- input ----------

function cellFromEvent(ev: MouseEvent): Vec | null {
  if (!fight) return null;
  const r = canvas.getBoundingClientRect();
  const x = Math.floor(((ev.clientX - r.left) / r.width) * fight.w);
  const y = Math.floor(((ev.clientY - r.top) / r.height) * fight.h);
  if (x < 0 || y < 0 || x >= fight.w || y >= fight.h) return null;
  return { x, y };
}

canvas.addEventListener('click', (ev) => {
  if (!fight || fight.status !== 'playing' || phase !== 'player') return;
  const c = cellFromEvent(ev);
  if (!c) return;

  if (selected != null) {
    const sel = fight.pieces.find((p) => p.id === selected);
    if (sel && movesFor(fight, sel).some((m) => m.x === c.x && m.y === c.y)) {
      attemptMove(selected, c);
      return;
    }
  }

  const p = pieceAt(fight, c.x, c.y);
  inspect = c;
  if (p) {
    selected = p.side === 'friend' ? p.id : null;
    hintEl.textContent = describe(p.kind);
  } else {
    selected = null;
    inspect = null;
    hintEl.textContent = DEFAULT_HINT;
  }
  refreshHud();
});

canvas.addEventListener('mousemove', (ev) => {
  if (!fight || phase !== 'player') return;
  const c = cellFromEvent(ev);
  if (c && selected == null) inspect = c;
});

function drainEvents() {
  if (!fight) return;
  for (const ev of fight.events) {
    if (ev.type === 'blocked') {
      fx.push({ at: ev.at, kind: 'bonk', t: 0 });
      blockedNote = `You blocked the ${KIND_INFO[ev.kind].title}! It grumbles and stays put.`;
    } else if (ev.type === 'cornered') {
      fx.push({ at: ev.at, kind: 'poof', t: 0 });
    } else if (ev.type === 'cloaked') {
      fx.push({ at: ev.at, kind: 'shaken', t: 0 });
      blockedNote = `The Dandelion Cloak whisks ${
        ev.kind === 'keeper' ? 'the Keeper' : `the ${KIND_INFO[ev.kind].title}`
      } safely home! 🧣`;
    } else {
      fx.push({ at: ev.at, kind: ev.type === 'capture' ? 'poof' : 'shaken', t: 0 });
    }
  }
  fight.events = [];
}

// ---------- sizing & render loop ----------

function sizeCanvas() {
  if (!fight) return;
  const area = boardAreaEl.getBoundingClientRect();
  const availW = Math.max(60, area.width - 8);
  const availH = Math.max(60, area.height - 8);
  const scale = Math.max(1, Math.floor(Math.min(availW / canvas.width, availH / canvas.height)));
  const w = `${canvas.width * scale}px`;
  if (canvas.style.width === w) return; // no-op rescales feed the ResizeObserver loop
  canvas.style.width = w;
  canvas.style.height = `${canvas.height * scale}px`;
}

window.addEventListener('resize', sizeCanvas);
window.addEventListener('orientationchange', () => requestAnimationFrame(sizeCanvas));
if ('ResizeObserver' in window) new ResizeObserver(sizeCanvas).observe(boardAreaEl);

function frame(time: number) {
  if (fight) {
    let overrides: PosOverrides | undefined;
    if (tweens.length) {
      const t = Math.min(1, (performance.now() - tweenStart) / tweenDur);
      overrides = new Map(tweens.map((tw) => [tw.id, lerp(tw.from, tw.to, t)]));
    }
    draw(
      ctx,
      fight,
      { selected, hover: inspect, fx, posOverrides: overrides, telegraphOverride: frozenTelegraphs ?? undefined },
      time,
    );
    for (const f of fx) f.t++;
    fx = fx.filter((f) => f.t < 26);
  }
  requestAnimationFrame(frame);
}

function lerp(a: Vec, b: Vec, t: number): Vec {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

requestAnimationFrame(frame);
title();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
