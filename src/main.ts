import './style.css';
import { movesFor, pieceAt } from './game/board';
import { createFight, playerMove } from './game/fight';
import {
  afterFightWon,
  buildFightConfig,
  FIGHTS,
  KIND_INFO,
  newRun,
  offerRecruits,
  recruit,
  ROSTER_CAP,
  type RunState,
} from './game/run';
import type { FightState, Kind, Vec } from './game/types';
import { draw, TILE, type FX } from './render/scene';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div id="hud"><span id="fightname">Thistledown</span><span id="turn"></span></div>
  <div id="board-wrap"><canvas id="board" width="96" height="96"></canvas></div>
  <div id="hint"></div>
  <div id="roster"></div>
  <div id="overlay" class="hidden"></div>
`;

const canvas = document.querySelector<HTMLCanvasElement>('#board')!;
const ctx = canvas.getContext('2d')!;
const hudName = document.querySelector<HTMLSpanElement>('#fightname')!;
const hudTurn = document.querySelector<HTMLSpanElement>('#turn')!;
const hintEl = document.querySelector<HTMLDivElement>('#hint')!;
const rosterEl = document.querySelector<HTMLDivElement>('#roster')!;
const overlayEl = document.querySelector<HTMLDivElement>('#overlay')!;

const DEFAULT_HINT =
  'Click a friend to see where they can go. Hover anything to see every square it can reach.';

let run: RunState | null = null;
let fight: FightState | null = null;
let lineup: number[] = [];
let selected: number | null = null;
let hover: Vec | null = null;
let fx: FX[] = [];

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
    'Thistledown 🌼',
    'The meadow is overgrown and the Keeper’s lantern is lit. Lead your friends, ' +
      'read the bramble’s intentions, and take the meadow back one clearing at a time. ' +
      'Nothing dies out here — promise.',
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
  showOverlay(`Clearing ${run.fightIndex + 1}: ${spec.name}`, spec.intro, [
    { label: 'Onward', fn: beginFight },
  ]);
}

function beginFight() {
  if (!run) return;
  const built = buildFightConfig(run);
  lineup = built.lineup;
  fight = createFight(built.cfg, run.rng);
  selected = null;
  hover = null;
  fx = [];
  canvas.width = fight.w * TILE;
  canvas.height = fight.h * TILE;
  sizeCanvas();
  hintEl.textContent = DEFAULT_HINT;
  refreshHud();
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

  // settle roster: who survived the fight?
  const alive = new Set<number>();
  lineup.forEach((compIdx, j) => {
    if (fight!.pieces.some((p) => p.id === 2 + j && p.side === 'friend')) alive.add(compIdx);
  });
  const shakenNames = lineup
    .filter((i) => !alive.has(i))
    .map((i) => run!.companions[i].name);
  afterFightWon(run, lineup, alive);

  if (run.status === 'won') {
    showOverlay(
      'The meadow is quiet 🌼',
      'The Gloom pops into a thousand flowers. Somewhere behind you, someone puts a kettle on. You won the whole thing.',
      [{ label: 'New run', fn: startRun }],
    );
    return;
  }

  const shakenNote = shakenNames.length
    ? ` ${shakenNames.join(' and ')} ${shakenNames.length > 1 ? 'are' : 'is'} a bit shaken and will sit the next one out.`
    : '';
  const body = `The brambles scatter into flowers.${shakenNote}`;

  if (run.companions.length >= ROSTER_CAP) {
    showOverlay('Clearing won!', body + ' Camp is full of friends already.', [
      { label: 'Onward', fn: fightIntro },
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
          fightIntro();
        },
      })),
      { label: 'Travel light', sub: 'No new friends this time.', fn: fightIntro },
    ],
  );
}

// ---------- hud ----------

function refreshHud() {
  if (!run || !fight) return;
  hudName.textContent = `${fight.name} (${run.fightIndex + 1}/${FIGHTS.length})`;
  hudTurn.textContent = `turn ${fight.turn}`;
  const chips = [`<span class="chip">🏮 The Keeper</span>`];
  for (const c of run.companions) {
    chips.push(
      `<span class="chip${c.shaken ? ' shaken' : ''}">${c.name} the ${KIND_INFO[c.kind].title}${c.shaken ? ' 💤' : ''}</span>`,
    );
  }
  rosterEl.innerHTML = chips.join('');
}

function describe(kind: Kind): string {
  const info = KIND_INFO[kind];
  return `${info.title}: ${info.blurb}`;
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
  if (!fight || fight.status !== 'playing') return;
  const c = cellFromEvent(ev);
  if (!c) return;

  if (selected != null) {
    const sel = fight.pieces.find((p) => p.id === selected);
    if (sel && movesFor(fight, sel).some((m) => m.x === c.x && m.y === c.y)) {
      playerMove(fight, selected, c);
      selected = null;
      drainEvents();
      refreshHud();
      if (fight.status !== 'playing') setTimeout(endOfFight, 650);
      return;
    }
  }

  const p = pieceAt(fight, c.x, c.y);
  if (p && p.side === 'friend') {
    selected = p.id;
    hintEl.textContent = describe(p.kind);
  } else {
    selected = null;
    hintEl.textContent = p ? describe(p.kind) : DEFAULT_HINT;
  }
});

canvas.addEventListener('mousemove', (ev) => {
  if (!fight) return;
  hover = cellFromEvent(ev);
  if (hover && selected == null) {
    const p = pieceAt(fight, hover.x, hover.y);
    hintEl.textContent = p ? describe(p.kind) : DEFAULT_HINT;
  }
});

canvas.addEventListener('mouseleave', () => {
  hover = null;
});

function drainEvents() {
  if (!fight) return;
  for (const ev of fight.events) {
    fx.push({ at: ev.at, kind: ev.type === 'capture' ? 'poof' : 'shaken', t: 0 });
  }
  fight.events = [];
}

// ---------- sizing & render loop ----------

function sizeCanvas() {
  if (!fight) return;
  const avail = Math.min(window.innerWidth - 48, 560);
  const scale = Math.max(2, Math.floor(avail / canvas.width));
  canvas.style.width = `${canvas.width * scale}px`;
}

window.addEventListener('resize', sizeCanvas);

function frame(time: number) {
  if (fight) {
    draw(ctx, fight, { selected, hover, fx }, time);
    for (const f of fx) f.t++;
    fx = fx.filter((f) => f.t < 26);
    if (fight.status === 'playing') hudTurn.textContent = `turn ${fight.turn}`;
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
title();
