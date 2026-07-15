import './style.css';
import { movesFor, pieceAt } from './game/board';
import { enemies, type PromotionKind } from './game/fight';
import { FIGHTS, KIND_INFO, TRINKETS, type RunState } from './game/run';
import { apply, newSession, replay, type LogEntry, type Session } from './game/session';
import type { FightState, Kind, Telegraph, Vec } from './game/types';
import { draw, TILE, type FX, type PosOverrides } from './render/scene';
import { drawSprite } from './render/sprites';

const OBJECTIVE = 'Catch every bramble creature to win the clearing.';
const DEFAULT_HINT = 'Tap a friend (on the board or below), then tap a glowing square to move them.';
const PAUSE_MS = 340; // beat after your move, before the bramble acts
const TWEEN_MS = 190; // how long their slide/leap takes to draw
const PLAYER_TWEEN_MS = 120; // your own piece sliding into place
const SAVE_KEY = 'overgrown.save.v1';

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

let sess: Session | null = null;
// convenient views into the session (same object references)
let run: RunState | null = null;
let fight: FightState | null = null;
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
/** set while resolving if something noteworthy happened — shown as the next hint */
let blockedNote: string | null = null;

// ---------- session & save ----------

/** Apply a decision to the session and keep the save current. */
function doEntry(e: LogEntry): boolean {
  if (!sess) return false;
  if (!apply(sess, e)) return false;
  run = sess.run;
  fight = sess.fight;
  persist();
  return true;
}

function persist() {
  if (!sess) return;
  try {
    if (sess.stage === 'over') localStorage.removeItem(SAVE_KEY);
    else localStorage.setItem(SAVE_KEY, JSON.stringify({ seed: sess.run.seed, log: sess.log }));
  } catch {
    /* storage full or blocked — the run just won't save */
  }
}

/** Rebuild the saved session, or null if there isn't one (or it won't replay). */
function loadSave(): Session | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as { seed: number; log: LogEntry[] };
    if (typeof data.seed !== 'number' || !Array.isArray(data.log)) throw new Error('bad save');
    const s = replay(data.seed, data.log);
    return s.stage === 'over' ? null : s;
  } catch {
    localStorage.removeItem(SAVE_KEY);
    return null;
  }
}

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
  const saved = loadSave();
  const choices: Choice[] = [];
  if (saved) {
    const friends = saved.run.companions.filter((c) => !c.shaken).length + 1;
    choices.push({
      label: 'Keep going',
      sub: `Clearing ${saved.run.fightIndex + 1} of ${FIGHTS.length}, ${friends} of you on the path.`,
      fn: () => {
        sess = saved;
        stageUi();
      },
    });
  }
  choices.push({
    label: saved ? 'Start fresh' : 'Set out',
    sub: saved ? 'The old path grows over.' : undefined,
    fn: startRun,
  });
  showOverlay(
    'Overgrown 🌼',
    'The meadow is overgrown and the Keeper’s lantern is lit. Lead your friends, ' +
      'read the bramble’s intentions, and take the meadow back one clearing at a time.',
    choices,
  );
}

function startRun() {
  sess = newSession(Date.now() % 2147483647);
  persist();
  stageUi();
}

/** Show whatever screen the session's stage calls for. */
function stageUi() {
  if (!sess) return;
  run = sess.run;
  fight = sess.fight;
  switch (sess.stage) {
    case 'intro':
      fightIntro();
      break;
    case 'fight':
    case 'promotion':
      enterFight(true);
      break;
    case 'post':
      endOfFightUi();
      break;
    case 'found':
      trinketFound();
      break;
    case 'camp':
      campStop();
      break;
    case 'over':
      endOfRunUi();
      break;
  }
}

function fightIntro() {
  if (!run) return;
  const spec = FIGHTS[run.fightIndex];
  showOverlay(
    `Clearing ${run.fightIndex + 1}: ${spec.name}`,
    `${spec.intro}<span class="objective">🌼 ${spec.objective ?? OBJECTIVE}</span>`,
    [
      {
        label: 'Onward',
        fn: () => {
          doEntry({ t: 'begin' });
          enterFight(false);
        },
      },
    ],
  );
}

/** Set up the board UI for the session's current fight (fresh or resumed). */
function enterFight(resume: boolean) {
  if (!sess || !sess.fight) return;
  fight = sess.fight;
  companionPieceId = new Map(sess.lineup.map((compIdx, j) => [compIdx, 2 + j]));
  phase = 'player';
  selected = null;
  inspect = null;
  fx = [];
  tweens = [];
  frozenTelegraphs = null;
  blockedNote = null;
  canvas.width = fight.w * TILE;
  canvas.height = fight.h * TILE;
  document.querySelector('#board-wrap')!.classList.remove('idle');
  requestAnimationFrame(sizeCanvas);
  hintEl.textContent = DEFAULT_HINT;
  refreshHud();
  if (resume && sess.stage === 'promotion') {
    promotionChoice();
    return;
  }
  if (resume && sess.resolveDue) {
    beginEnemyTurn();
    return;
  }
  maybeAutoWait();
}

/**
 * Stalemate guard: if nobody can move, say so loudly and let the bramble
 * take its turn rather than soft-locking the fight.
 */
function maybeAutoWait() {
  if (!sess || !fight || fight.status !== 'playing' || phase !== 'player') return;
  if (sess.resolveDue || sess.stage !== 'fight') return;
  if (fight.pieces.some((p) => p.side === 'friend' && movesFor(fight!, p).length > 0)) return;
  hintEl.textContent = 'Everyone is hemmed in — nowhere to step! Hold tight…';
  setTimeout(beginEnemyTurn, 900);
}

/** The fight just ended in the session — show the aftermath. */
function endOfFightUi() {
  if (!sess || !run) return;
  if (sess.stage === 'over') {
    endOfRunUi();
    return;
  }
  // stage 'post': clearing won, maybe a recruit is watching
  const shakenNames = run.companions.filter((c) => c.shaken).map((c) => c.name);
  const shakenNote = shakenNames.length
    ? ` ${shakenNames.join(' and ')} ${shakenNames.length > 1 ? 'are' : 'is'} a bit shaken and will sit the next one out.`
    : '';
  const body = `The brambles scatter into flowers.${shakenNote}`;

  if (!sess.recruitOffers) {
    showOverlay('Clearing won!', body + ' Camp is full of friends already.', [
      {
        label: 'Onward',
        fn: () => {
          doEntry({ t: 'skip' });
          stageUi();
        },
      },
    ]);
    return;
  }

  showOverlay(
    'Clearing won!',
    body + ' Someone shy is watching from the tall grass…',
    [
      ...sess.recruitOffers.map((kind) => ({
        label: `Befriend the ${KIND_INFO[kind].title}`,
        sub: KIND_INFO[kind].blurb,
        fn: () => {
          doEntry({ t: 'recruit', kind });
          stageUi();
        },
      })),
      {
        label: 'Travel light',
        sub: 'No new friends this time.',
        fn: () => {
          doEntry({ t: 'skip' });
          stageUi();
        },
      },
    ],
  );
}

function endOfRunUi() {
  if (!run) return;
  if (run.status === 'lost') {
    showOverlay(
      'The lantern goes out',
      `The brambles got the Keeper in ${fight?.name ?? 'the meadow'}. Everyone walks home for tea and tries again tomorrow.`,
      [{ label: 'Try again', fn: startRun }],
    );
    return;
  }
  const friends = run.companions.filter((c) => !c.shaken).length;
  showOverlay(
    'The meadow is quiet 🌼',
    'The Bramble Heart bursts into a thousand flowers. Somewhere behind you, someone puts a kettle on. ' +
      `You won the whole thing — ${FIGHTS.length} clearings taken back, ` +
      `and ${friends + 1} of you walking home for tea.`,
    [{ label: 'New run', fn: startRun }],
  );
  rainPetals();
}

function trinketFound() {
  if (!sess) return;
  showOverlay(
    'Something glints in the grass ✨',
    'Half-buried by the path. It hums a little. You can only carry one more thing.',
    sess.trinketOffers.map((id) => ({
      label: `${TRINKETS[id].icon} ${TRINKETS[id].title}`,
      sub: TRINKETS[id].blurb,
      fn: () => {
        doEntry({ t: 'trinket', id });
        stageUi();
      },
    })),
  );
}

function campStop() {
  if (!sess || !run) return;
  const shaken = run.companions.filter((c) => c.shaken).map((c) => c.name);
  const snackable = run.companions.some((c) => !c.spry);
  const choices: Choice[] = [];
  if (shaken.length) {
    choices.push({
      label: 'Warm mash 🍲',
      sub: `${shaken.join(' and ')} perk${shaken.length > 1 ? '' : 's'} right up and rejoin${shaken.length > 1 ? '' : 's'} the band.`,
      fn: () => {
        doEntry({ t: 'heal' });
        stageUi();
      },
    });
  }
  if (snackable) {
    choices.push({
      label: 'Honeycake 🍯',
      sub: 'One friend gets a spring in their step — for good. (A plain sidestep, any direction.)',
      fn: honeycakeChoice,
    });
  }
  for (const id of sess.trinketOffers) {
    choices.push({
      label: `${TRINKETS[id].icon} Take the ${TRINKETS[id].title}`,
      sub: `Spotted at the edge of the firelight. ${TRINKETS[id].blurb}`,
      fn: () => {
        doEntry({ t: 'trinket', id });
        stageUi();
      },
    });
  }
  choices.push({
    label: 'Rest quietly',
    sub: 'Just the crackle of the fire.',
    fn: () => {
      doEntry({ t: 'rest' });
      stageUi();
    },
  });
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
          doEntry({ t: 'snack', idx: i });
          stageUi();
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
        doEntry({ t: 'promote', kind });
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
  return phase === 'enemy' ? '🌱 the bramble moves…' : `🌼 your move · turn ${fight.turn}`;
}

function refreshHud() {
  if (!run || !fight) return;
  hudName.textContent = `${fight.name} (${run.fightIndex + 1}/${FIGHTS.length})`;
  hudTurn.textContent = phaseLabel();
  hudTurn.className = fight.status !== 'playing' ? 'done' : phase;
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
  if (!sess || !fight || phase !== 'player') return;
  const mover = fight.pieces.find((p) => p.id === pieceId);
  const from = mover ? { x: mover.x, y: mover.y } : null;
  if (!doEntry({ t: 'move', id: pieceId, to })) return;
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
  if (!sess || !fight) return;
  if (sess.stage === 'promotion') {
    promotionChoice();
    return;
  }
  if (sess.stage !== 'fight') {
    setTimeout(endOfFightUi, 650);
    return;
  }
  if (!sess.resolveDue) {
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
  const snapTelegraphs = fight.telegraphs.map((t) => ({ ...t }));
  // "nothing will move" is its own beat: walled-off brambles, or the Heart
  // digging in — say it out loud instead of playing a silent pause
  const anyAction = snapTelegraphs.some((t) => t.to);
  hintEl.textContent = anyAction ? "Watch the bramble's move…" : 'The bramble stirs…';
  refreshHud();

  const snapPositions = new Map<number, Vec>(
    fight.pieces.filter((p) => p.side === 'bramble').map((p) => [p.id, { x: p.x, y: p.y }]),
  );
  frozenTelegraphs = snapTelegraphs;

  setTimeout(() => {
    if (!fight) return;
    blockedNote = anyAction ? null : 'The bramble holds still — nothing moves this turn. Go!';
    doEntry({ t: 'resolve' });
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
        if (fight!.status !== 'playing') setTimeout(endOfFightUi, 350);
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
