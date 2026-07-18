import './style.css';
import { movesFor, pieceAt } from './game/board';
import { enemies, NAIVE_DIALS, type PromotionKind } from './game/fight';
import {
  KIND_INFO,
  REGION_NAMES,
  regionOf,
  scaleDials,
  TRINKETS,
  UPGRADES,
  type RunState,
  type TrinketId,
} from './game/run';
import {
  apply,
  movesThisClearing,
  newSession,
  replay,
  retryFight,
  totalMoves,
  type LogEntry,
  type Session,
} from './game/session';
import type { FightState, Kind, Telegraph, UpgradeId, Vec } from './game/types';
import { drawBackdrop } from './render/backdrop';
import { iconEl, iconHTML, type IconName } from './render/icons';
import { draw, TILE, type FX, type PosOverrides } from './render/scene';
import { themeFor, type RegionTheme } from './render/themes';
import { drawSprite } from './render/sprites';
import { isMuted, playSfx, soundForEvent, toggleMute, unlockAudio, type SoundName } from './audio';

/** Each trinket's pixel icon — a UI pairing, kept out of the pure game module. */
const TRINKET_ICONS: Record<TrinketId, IconName> = {
  cloak: 'cloak',
  whistle: 'acorn',
  breakfast: 'pancakes',
  ward: 'leaf',
  riser: 'teacup',
  luck: 'sparkle',
  dew: 'blossom',
  map: 'scales',
  trail: 'fern',
};

/** Each movement upgrade's pixel icon — a card face for the campfire. */
const UPGRADE_ICONS: Record<UpgradeId, IconName> = {
  thornstep: 'sprout',
  rootgrip: 'leaf',
  springheel: 'acorn',
  sidestep: 'fern',
  underbrush: 'bloom',
  pivot: 'scales',
};

/** A one-line move phrase for the compact recruit cards (KIND_INFO blurbs run long). */
const MOVE_TAG: Partial<Record<Kind, string>> = {
  sprout: 'Steps ahead, pokes on the slant',
  hopper: 'Leaps in an L, over anything',
  slink: 'Glides on the diagonals',
  rumble: 'Barrels in straight lines',
  duchess: 'Goes anywhere, any distance',
};

const OBJECTIVE = 'Catch every bramble creature to win the clearing.';
const DEFAULT_HINT = 'Tap a friend (on the board or below), then tap a glowing square to move them.';
const PAUSE_MS = 340; // beat after your move, before the bramble acts
const TWEEN_MS = 190; // how long their slide/leap takes to draw
const PLAYER_TWEEN_MS = 120; // your own piece sliding into place
// v5: movement upgrades + expanded, region-gated trinkets shift the run's RNG
// draw order, so older decision logs no longer replay faithfully — let them go
const SAVE_KEY = 'overgrown.save.v5';
const SCORES_KEY = 'overgrown.scores.v1';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header id="hud">
    <span id="fightname">Overgrown</span>
    <span id="hud-right"><button id="sound-btn" class="trinket" title="Sound">${iconHTML(isMuted() ? 'muted' : 'sound', 'p15')}</button><button id="dev-btn" class="trinket" title="Dev">${iconHTML('wrench', 'p15')}</button><button id="history-btn" class="trinket hidden" title="Look back">${iconHTML('rewind', 'p15')}</button><span id="trinkets"></span></span>
  </header>
  <div id="board-area">
    <canvas id="backdrop" width="1" height="1"></canvas>
    <div id="board-wrap" class="idle">
      <canvas id="board" width="96" height="96"></canvas>
    </div>
    <div id="history-bar" class="hidden">
      <button id="hist-prev">‹</button>
      <span id="hist-label"></span>
      <button id="hist-next">›</button>
      <button id="hist-live">Back to now</button>
    </div>
  </div>
  <div id="status">
    <div id="status-line"></div>
    <div id="hint"></div>
  </div>
  <div id="roster"></div>
  <div id="overlay" class="hidden"></div>
`;

const canvas = document.querySelector<HTMLCanvasElement>('#board')!;
const ctx = canvas.getContext('2d')!;
const backdropEl = document.querySelector<HTMLCanvasElement>('#backdrop')!;
const backdropCtx = backdropEl.getContext('2d')!;
const boardAreaEl = document.querySelector<HTMLDivElement>('#board-area')!;
const hudName = document.querySelector<HTMLSpanElement>('#fightname')!;
const trinketsEl = document.querySelector<HTMLSpanElement>('#trinkets')!;
const statusEl = document.querySelector<HTMLDivElement>('#status')!;
const statusLineEl = document.querySelector<HTMLDivElement>('#status-line')!;
const hintEl = document.querySelector<HTMLDivElement>('#hint')!;
const rosterEl = document.querySelector<HTMLDivElement>('#roster')!;
const overlayEl = document.querySelector<HTMLDivElement>('#overlay')!;
const historyBtn = document.querySelector<HTMLButtonElement>('#history-btn')!;
const devBtn = document.querySelector<HTMLButtonElement>('#dev-btn')!;
const soundBtn = document.querySelector<HTMLButtonElement>('#sound-btn')!;
const historyBar = document.querySelector<HTMLDivElement>('#history-bar')!;
const histPrev = document.querySelector<HTMLButtonElement>('#hist-prev')!;
const histNext = document.querySelector<HTMLButtonElement>('#hist-next')!;
const histLabel = document.querySelector<HTMLSpanElement>('#hist-label')!;
const histLive = document.querySelector<HTMLButtonElement>('#hist-live')!;

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
/** the enemy the player just caught mid-lunge (its telegraph died with it) */
let tempoKind: Kind | null = null;
/** looking back through this clearing's moves (view-only, replay-built) */
let history: { states: { f: FightState; label: string }[]; idx: number } | null = null;

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
  if (!sess || devDirty) return; // a hand-tuned log wouldn't replay
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

// ---------- hiscores: fewest moves, per clearing and per whole run ----------

/** Personal bests, persisted across runs: fewest moves to clear each named
 * clearing, and fewest total moves to win a whole run. */
interface Scores {
  clearings: Record<string, number>;
  run?: number;
}

function loadScores(): Scores {
  try {
    const raw = localStorage.getItem(SCORES_KEY);
    const s = raw ? (JSON.parse(raw) as Partial<Scores>) : null;
    if (s && typeof s === 'object') return { clearings: s.clearings ?? {}, run: s.run };
  } catch {
    /* corrupt or blocked — start the board fresh */
  }
  return { clearings: {} };
}

function saveScores(s: Scores) {
  try {
    localStorage.setItem(SCORES_KEY, JSON.stringify(s));
  } catch {
    /* fine — the record just won't persist */
  }
}

/**
 * Fold a result into the saved bests. Returns the best now on file and whether
 * this run just set it. Hand-tuned (dev-dirty) sessions never touch the board —
 * a record you dialed up in the dev panel isn't a record.
 */
function recordClearing(name: string, moves: number): { best?: number; improved: boolean } {
  const scores = loadScores();
  const prev = scores.clearings[name];
  if (devDirty) return { best: prev, improved: false };
  const improved = prev === undefined || moves < prev;
  if (improved) {
    scores.clearings[name] = moves;
    saveScores(scores);
  }
  return { best: improved ? moves : prev, improved };
}

function recordRun(moves: number): { best?: number; improved: boolean } {
  const scores = loadScores();
  const prev = scores.run;
  if (devDirty) return { best: prev, improved: false };
  const improved = prev === undefined || moves < prev;
  if (improved) {
    scores.run = moves;
    saveScores(scores);
  }
  return { best: improved ? moves : prev, improved };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

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

// ---------- choice scenes ----------

interface SceneOption {
  /** the card's face: a critter sprite… */
  kind?: Kind;
  /** …or a pixel icon (trinkets, campfire comforts) */
  icon?: IconName;
  label: string;
  detail: string;
  /** short move phrase shown under the name in the compact 'row' layout */
  caption?: string;
  fn: () => void;
}

/**
 * The between-fights picker: one tap commits, no preview box, no confirm step.
 *
 * Two layouts share this builder. The default 'list' stacks wide rows (sprite +
 * name + blurb) — used by the campfire and trinket scenes. The 'row' layout
 * lays out square cards side by side (sprite + name + short caption), and for
 * critters that glide in straight lines it paints a faint +/×/✳ of movement
 * rays behind the sprite — a quiet, wordless hint of reach. Steppers and
 * leapers get no such background; their one-line caption already says it.
 */
function showChoiceScene(
  title: string,
  body: string,
  options: SceneOption[],
  layout: 'list' | 'row' = 'list',
) {
  overlayEl.innerHTML = `<div class="card"><h2></h2><p class="scene-body"></p>
    <div class="opts"></div></div>`;
  // titles and bodies are app-authored strings that may carry inline icons
  overlayEl.querySelector('h2')!.innerHTML = title;
  overlayEl.querySelector('.scene-body')!.innerHTML = body;
  const optsEl = overlayEl.querySelector('.opts')!;
  if (layout === 'row') optsEl.classList.add('row');
  for (const o of options) {
    const b = document.createElement('button');
    b.className = 'opt';
    // a faint movement watermark behind slider critters (row layout only)
    const bgType = layout === 'row' && o.kind ? moveBgType(o.kind) : null;
    if (bgType) {
      const bg = document.createElement('canvas');
      bg.className = 'movebg';
      bg.width = 24;
      bg.height = 24;
      drawMoveBg(bg.getContext('2d')!, bgType);
      b.append(bg);
    }
    if (o.kind) {
      const cv = document.createElement('canvas');
      cv.className = 'face';
      cv.width = 12;
      cv.height = 12;
      drawSprite(cv.getContext('2d')!, o.kind, 0, 0);
      b.append(cv);
    } else {
      b.append(iconEl(o.icon ?? 'question', 'face'));
    }
    const nm = document.createElement('span');
    nm.className = 'name';
    nm.textContent = o.label;
    b.append(nm);
    if (layout === 'row') {
      if (o.caption) {
        const cap = document.createElement('span');
        cap.className = 'cap';
        cap.textContent = o.caption;
        b.append(cap);
      }
    } else {
      const blurb = document.createElement('span');
      blurb.className = 'blurb';
      blurb.textContent = o.detail;
      b.append(blurb);
    }
    b.onclick = () => {
      overlayEl.classList.add('hidden');
      o.fn();
    };
    optsEl.append(b);
  }
  overlayEl.classList.remove('hidden');
}

/** Which faint movement watermark, if any, a critter earns behind its card. */
function moveBgType(kind: Kind): '+' | 'x' | '*' | null {
  if (kind === 'rumble' || kind === 'golem') return '+'; // straight-line sliders
  if (kind === 'slink' || kind === 'creeper') return 'x'; // diagonal sliders
  if (kind === 'duchess' || kind === 'gloom') return '*'; // glide any direction
  return null; // steppers, leapers, kings: caption alone
}

/**
 * A faint background of movement rays for a card: '+' orthogonal, '×' diagonal,
 * '✳' both. Drawn center-out with little arrowheads on a 24×24 buffer, integer-
 * scaled and dimmed by CSS so it reads as a watermark, not a diagram.
 */
function drawMoveBg(c: CanvasRenderingContext2D, type: '+' | 'x' | '*') {
  const mid = 12;
  c.fillStyle = '#ffd966';
  const px = (x: number, y: number) => c.fillRect(x, y, 1, 1);
  const ray = (dx: number, dy: number) => {
    let x = mid;
    let y = mid;
    for (let i = 0; i < 9; i++) {
      x += dx;
      y += dy;
      px(x, y);
    }
    px(x - dx - dy, y - dy + dx); // arrowhead, flaring back from the tip
    px(x - dx + dy, y - dy - dx);
  };
  const dirs = type === '+' ? ORTHO_D : type === 'x' ? DIAG_D : [...ORTHO_D, ...DIAG_D];
  for (const [dx, dy] of dirs) ray(dx, dy);
}

const ORTHO_D = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const DIAG_D = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

// ---------- run flow ----------

function title() {
  applyRegionTheme(themeFor(0)); // the title sits at the meadow's edge
  // a run you never actually played (no moves yet) isn't worth resuming —
  // don't make the player choose between two identical fresh starts
  const loaded = loadSave();
  const saved = loaded && loaded.log.some((e) => e.t === 'move') ? loaded : null;
  const choices: Choice[] = [];
  if (saved) {
    const friends = saved.run.companions.filter((c) => !c.shaken).length + 1;
    choices.push({
      label: 'Keep going',
      sub: `Clearing ${saved.run.fightIndex + 1} of ${saved.run.fights.length}, ${friends} of you on the path.`,
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
  const runBest = loadScores().run;
  const bestNote = runBest !== undefined ? ` <span class="objective">${iconHTML('trophy')} Best run: ${plural(runBest, 'move')}</span>` : '';
  showOverlay(
    `Overgrown ${iconHTML('daisy', 'p2')}`,
    'The meadow is overgrown and the Keeper’s lantern is lit. Lead your friends, ' +
      'read the bramble’s intentions, and take the meadow back one clearing at a time.' +
      bestNote,
    choices,
  );
}

function startRun() {
  sess = newSession(Date.now() % 2147483647);
  persist();
  stageUi();
}

/** Rewind to the top of the clearing that just went wrong and try it again. */
function retryClearing() {
  if (!sess) return;
  sess = retryFight(sess);
  persist();
  stageUi();
}

/** Show whatever screen the session's stage calls for. */
/** Repaint the overlay/card chrome in the current region's palette. */
function applyRegionTheme(theme: RegionTheme) {
  const root = document.documentElement.style;
  root.setProperty('--panel-solid', theme.css.panel);
  root.setProperty('--panel-2', theme.css.panel2);
  root.setProperty('--edge', theme.css.edge);
  root.setProperty('--overlay-bg', theme.css.scrim);
  root.setProperty('--accent', theme.css.accent);
}

function stageUi() {
  if (!sess) return;
  run = sess.run;
  fight = sess.fight;
  applyRegionTheme(themeFor(regionOf(run.fightIndex)));
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
  const spec = run.fights[run.fightIndex];
  showOverlay(
    `${REGION_NAMES[regionOf(run.fightIndex)]} · ${spec.name}`,
    `${spec.intro}<span class="objective">${iconHTML('daisy')} ${spec.objective ?? OBJECTIVE}</span>`,
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
  tempoKind = null;
  history = null;
  historyBar.classList.add('hidden');
  canvas.width = fight.w * TILE;
  canvas.height = fight.h * TILE;
  document.querySelector('#board-wrap')!.classList.remove('idle');
  requestAnimationFrame(sizeCanvas);
  hintEl.innerHTML = DEFAULT_HINT;
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
  hintEl.innerHTML = 'Everyone is hemmed in — nowhere to step! Hold tight…';
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
  const shaken = run.companions.filter((c) => c.shaken).map((c) => c.kind);
  const shakenNote = shaken.length
    ? `${cap(listKinds(shaken))} ${shaken.length > 1 ? 'sit' : 'sits'} the next one out.`
    : '';
  // fewest-moves record for the clearing that just fell
  const moves = movesThisClearing(sess);
  const rec = recordClearing(fight?.name ?? 'this clearing', moves);
  const movesNote = rec.improved
    ? `Cleared in ${plural(moves, 'move')} — a new best! ${iconHTML('sparkle')}`
    : rec.best !== undefined
      ? `Cleared in ${plural(moves, 'move')} (best ${rec.best}).`
      : `Cleared in ${plural(moves, 'move')}.`;
  // a quiet secondary line: the record, then who's sitting out
  const note = [movesNote, shakenNote].filter(Boolean).join(' ');
  const noteLine = note ? `<span class="scene-note">${note}</span>` : '';

  if (!sess.recruitOffers) {
    showOverlay('Clearing won!', `Camp is full of friends already.${noteLine}`, [
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

  showChoiceScene(
    'Clearing won!',
    `Someone shy is watching from the tall grass…${noteLine}`,
    [
      ...sess.recruitOffers.map((kind) => ({
        kind,
        label: KIND_INFO[kind].title,
        detail: KIND_INFO[kind].blurb,
        caption: MOVE_TAG[kind] ?? '',
        fn: () => {
          doEntry({ t: 'recruit', kind });
          stageUi();
        },
      })),
      {
        icon: 'leaf' as IconName,
        label: 'Travel light',
        detail: 'No new friends this time — a smaller band moves quicker through the grass.',
        caption: 'Smaller band, quicker going',
        fn: () => {
          doEntry({ t: 'skip' });
          stageUi();
        },
      },
    ],
    'row',
  );
}

/** Capitalize the first letter — for notes that used to sit mid-sentence. */
function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function endOfRunUi() {
  if (!run) return;
  if (run.status === 'lost') {
    showOverlay(
      'The lantern goes out',
      `The brambles got the Keeper in ${fight?.name ?? 'the meadow'}. Everyone walks home for tea.`,
      [
        {
          label: 'Retry this clearing',
          sub: 'Back to the start of this fight — same friends, same meadow.',
          fn: retryClearing,
        },
        { label: 'Start over', sub: 'A whole new meadow from the top.', fn: startRun },
      ],
    );
    return;
  }
  const friends = run.companions.filter((c) => !c.shaken).length;
  const moves = sess ? totalMoves(sess) : 0;
  const rec = recordRun(moves);
  const runNote = rec.improved
    ? ` And in just ${plural(moves, 'move')} — a new record! ${iconHTML('trophy')}`
    : rec.best !== undefined
      ? ` You did it in ${plural(moves, 'move')} (best ${rec.best}).`
      : ` You did it in ${plural(moves, 'move')}.`;
  showOverlay(
    `The meadow is quiet ${iconHTML('daisy', 'p2')}`,
    'The Bramble Heart bursts into a thousand flowers. Somewhere behind you, someone puts a kettle on. ' +
      `You won the whole thing — ${run.fights.length} clearings taken back, ` +
      `and ${friends + 1} of you walking home for tea.${runNote}`,
    [{ label: 'New run', fn: startRun }],
  );
  rainPetals();
}

function trinketFound() {
  if (!sess) return;
  showChoiceScene(
    `Something glints in the grass ${iconHTML('sparkle', 'p2')}`,
    'Half-buried by the path. It hums a little. You can only carry one more thing.',
    sess.trinketOffers.map((id) => ({
      icon: TRINKET_ICONS[id],
      label: TRINKETS[id].title,
      detail: TRINKETS[id].blurb,
      fn: () => {
        doEntry({ t: 'trinket', id });
        stageUi();
      },
    })),
  );
}

function campStop() {
  if (!sess || !run) return;
  const shaken = run.companions.filter((c) => c.shaken).map((c) => c.kind);
  const snackable = run.companions.some((c) => !c.spry);
  const choices: SceneOption[] = [];
  if (shaken.length) {
    choices.push({
      icon: 'stew',
      label: 'Warm mash',
      detail: `${listKinds(shaken)} perk${shaken.length > 1 ? '' : 's'} right up and rejoin${shaken.length > 1 ? '' : 's'} the band.`,
      fn: () => {
        doEntry({ t: 'heal' });
        stageUi();
      },
    });
  }
  if (snackable) {
    choices.push({
      icon: 'honey',
      label: 'Honeycake',
      detail: 'One friend gets a spring in their step — for good. (A plain sidestep, any direction.)',
      fn: honeycakeChoice,
    });
  }
  for (const id of sess.trinketOffers) {
    choices.push({
      icon: TRINKET_ICONS[id],
      label: TRINKETS[id].title,
      detail: `Spotted at the edge of the firelight. ${TRINKETS[id].blurb}`,
      fn: () => {
        doEntry({ t: 'trinket', id });
        stageUi();
      },
    });
  }
  for (const id of sess.upgradeOffers) {
    choices.push({
      icon: UPGRADE_ICONS[id],
      label: UPGRADES[id].title,
      detail: `A trick learned by the fire. ${UPGRADES[id].blurb}`,
      fn: () => {
        doEntry({ t: 'upgrade', id });
        stageUi();
      },
    });
  }
  choices.push({
    icon: 'fire',
    label: 'Rest quietly',
    detail: 'Just the crackle of the fire.',
    fn: () => {
      doEntry({ t: 'rest' });
      stageUi();
    },
  });
  showChoiceScene(
    'Campfire',
    'A quiet hollow off the path. The kettle whistles. There’s time for exactly one comfort.',
    choices,
  );
}

function honeycakeChoice() {
  if (!run) return;
  showChoiceScene(
    `Honeycake ${iconHTML('honey', 'p2')}`,
    'Who gets it? (No take-backs — it is a very good cake.)',
    run.companions
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => !c.spry)
      .map(({ c, i }) => ({
        kind: c.kind,
        label: c.name,
        detail: `${c.name} the ${KIND_INFO[c.kind].title} gains a plain one-step move in any direction — for good.`,
        fn: () => {
          doEntry({ t: 'snack', idx: i });
          stageUi();
        },
      })),
  );
}

/** Flower confetti over the current overlay. Purely ceremonial. */
function rainPetals() {
  const flowers: IconName[] = ['daisy', 'blossom', 'bloom', 'tulip'];
  for (let i = 0; i < 28; i++) {
    const p = document.createElement('span');
    p.className = 'petal';
    p.append(iconEl(flowers[i % flowers.length]));
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
  showChoiceScene(
    `Something blossoms ${iconHTML('sparkle', 'p2')}`,
    'Crossing the whole meadow changes a critter. Who do they become?',
    options.map((kind) => ({
      kind,
      label: KIND_INFO[kind].title,
      detail: KIND_INFO[kind].blurb,
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
  if (fight.status === 'lost') return `${iconHTML('zzz')} the lantern goes out`;
  if (fight.status === 'won') return `${iconHTML('daisy')} clearing won!`;
  return phase === 'enemy'
    ? `${iconHTML('sprout')} the bramble moves…`
    : `${iconHTML('daisy')} your move · turn ${fight.turn}`;
}

/** The short tail of the status line: what's left to do. */
function goalLabel(): string {
  if (!fight || fight.status !== 'playing') return '';
  const heart = fight.pieces.find((p) => p.kind === 'heart');
  const left = enemies(fight).length - (heart ? 1 : 0);
  if (heart) return left ? `${iconHTML('fern')} ${left} guard${left > 1 ? 's' : ''}` : 'corner the Heart!';
  return `${iconHTML('fern')} ${left} to catch`;
}

function refreshHud() {
  if (!run || !fight) return;
  hudName.textContent = `${fight.name} · ${run.fightIndex + 1}/${run.fights.length}`;
  const goal = goalLabel();
  statusLineEl.innerHTML = goal ? `${phaseLabel()} · ${goal}` : phaseLabel();
  statusEl.className = fight.status !== 'playing' ? fight.status : phase;
  historyBtn.classList.toggle(
    'hidden',
    devDirty || !sess || sess.stage !== 'fight' || fight.status !== 'playing',
  );
  historyBtn.disabled = phase !== 'player';
  devBtn.classList.remove('hidden');
  trinketsEl.innerHTML = '';
  for (const id of run.trinkets) {
    // a real button: title= tooltips don't exist on a phone
    const t = document.createElement('button');
    t.className = 'trinket';
    t.append(iconEl(TRINKET_ICONS[id], 'p15'));
    t.onclick = () =>
      showOverlay(`${iconHTML(TRINKET_ICONS[id], 'p2')} ${TRINKETS[id].title}`, TRINKETS[id].blurb, [
        { label: 'Onward', fn: () => {} },
      ]);
    trinketsEl.append(t);
  }
  renderRoster();
}

function renderRoster() {
  rosterEl.innerHTML = '';
  if (!run || !fight) return;
  rosterEl.append(rosterButton('keeper', 1, false));
  for (let i = 0; i < run.companions.length; i++) {
    const c = run.companions[i];
    const pieceId = companionPieceId.get(i);
    const alive = pieceId != null && fight.pieces.some((p) => p.id === pieceId);
    rosterEl.append(
      rosterButton(c.kind, pieceId ?? -1, c.shaken || !alive, c.shaken ? 'zzz' : c.spry ? 'honey' : undefined),
    );
  }
}

/** A small chip: sprite + critter type. Board taps are the main way to select;
 * these are just a legible "who's in the band" strip that happens to be tappable. */
function rosterButton(kind: Kind, pieceId: number, disabled: boolean, badge?: IconName): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'chip' + (selected === pieceId ? ' selected' : '');
  b.disabled = disabled || phase !== 'player' || !fight || fight.status !== 'playing';
  const mini = document.createElement('canvas');
  mini.className = 'mini';
  mini.width = 12;
  mini.height = 12;
  drawSprite(mini.getContext('2d')!, kind, 0, 0);
  b.append(mini);
  const label = document.createElement('span');
  const title = kind === 'keeper' ? 'Keeper' : KIND_INFO[kind].title;
  label.textContent = title;
  b.append(label);
  if (badge) b.append(iconEl(badge));
  b.onclick = () => selectPiece(pieceId);
  return b;
}

function describe(kind: Kind): string {
  const info = KIND_INFO[kind];
  return `${info.title}: ${info.blurb}`;
}

/** "a Sprout and 2 Hoppers" — companions listed by type, names are campfire flavor only. */
function listKinds(kinds: Kind[]): string {
  const counts = new Map<Kind, number>();
  for (const k of kinds) counts.set(k, (counts.get(k) ?? 0) + 1);
  return [...counts]
    .map(([k, n]) => (n > 1 ? `${n} ${KIND_INFO[k].title}s` : `a ${KIND_INFO[k].title}`))
    .join(' and ');
}

// ---------- selection & movement ----------

function selectPiece(pieceId: number) {
  if (history || !fight || phase !== 'player' || fight.status !== 'playing') return;
  const p = fight.pieces.find((q) => q.id === pieceId);
  if (!p) return;
  inspect = { x: p.x, y: p.y };
  selected = p.side === 'friend' ? p.id : null;
  hintEl.innerHTML = describeInFight(p);
  refreshHud();
}

/** describe(), plus what a tapped piece's quirks mean on the board. */
function describeInFight(p: {
  kind: Kind;
  side: string;
  veiled?: boolean;
  fickle?: boolean;
  spry?: boolean;
}): string {
  let txt = describe(p.kind);
  if (p.side === 'bramble') {
    if (p.veiled) txt += ' Shrouded — no arrow. The lit squares are everywhere it could strike.';
    else if (p.fickle) txt += ' Fickle — two arrows, and it takes whichever looks tastier.';
  } else if (p.spry) {
    txt += ` Spry ${iconHTML('honey')} — may also take a plain one-step, any direction. A stroll, never a pounce.`;
  }
  return txt;
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
  // a plain step gets a soft place-click; a capture speaks for itself in drainEvents
  if (!fight.events.some((e) => e.type === 'capture')) playSfx('move');
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
    playOutcome();
    setTimeout(endOfFightUi, 650);
    return;
  }
  if (!sess.resolveDue) {
    hintEl.innerHTML = `Second Breakfast! ${iconHTML('pancakes')} One more move — a stretch, not a snatch.`;
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
  // "nothing will move" is its own beat: walled-off brambles, the Heart
  // digging in — or a mover you just caught. Say it out loud, don't play a
  // silent pause; a stolen turn especially deserves its fanfare.
  const anyAction = snapTelegraphs.some((t) => t.to);
  const stolen = tempoKind ? KIND_INFO[tempoKind].title : null;
  tempoKind = null;
  hintEl.innerHTML = stolen
    ? `You caught the ${stolen} mid-lunge! ${iconHTML('daisy')}`
    : anyAction
      ? "Watch the bramble's move…"
      : 'The bramble stirs…';
  refreshHud();

  const snapPositions = new Map<number, Vec>(
    fight.pieces.filter((p) => p.side === 'bramble').map((p) => [p.id, { x: p.x, y: p.y }]),
  );
  frozenTelegraphs = snapTelegraphs;

  setTimeout(() => {
    if (!fight) return;
    blockedNote = anyAction
      ? stolen
        ? `You caught the ${stolen} mid-lunge — one less move against you!`
        : null
      : stolen
        ? `You caught the ${stolen} mid-lunge — the bramble loses its whole turn! ${iconHTML('daisy')}`
        : 'The bramble holds still — nothing moves this turn. Go!';
    doEntry({ t: 'resolve' });
    drainEvents();

    // tween every bramble piece that actually ended up somewhere new — the
    // Heart can bolt off a null telegraph, so go by positions, not telegraphs
    tweens = [];
    for (const [id, from] of snapPositions) {
      const p = fight.pieces.find((q) => q.id === id);
      if (p && (p.x !== from.x || p.y !== from.y)) {
        tweens.push({ id, from, to: { x: p.x, y: p.y } });
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
        if (fight!.status === 'playing') hintEl.innerHTML = blockedNote ?? DEFAULT_HINT;
        refreshHud();
        if (fight!.status !== 'playing') {
          playOutcome();
          setTimeout(endOfFightUi, 350);
        } else maybeAutoWait();
      },
      tweens.length ? TWEEN_MS : 60,
    );
  }, PAUSE_MS);
}

// ---------- history: step back through the clearing ----------

/**
 * The decision log is the time machine: replaying its prefixes rebuilds every
 * board state this clearing has been through, exactly. View-only — the live
 * fight sits untouched underneath until "Back to now".
 */
function enterHistory() {
  if (!sess || !fight || phase !== 'player' || sess.stage !== 'fight') return;
  if (devDirty) return; // replay can't rebuild hand-tuned state
  let begin = -1;
  for (let i = sess.log.length - 1; i >= 0; i--) {
    if (sess.log[i].t === 'begin') {
      begin = i;
      break;
    }
  }
  if (begin < 0) return;
  const states: { f: FightState; label: string }[] = [];
  for (let k = begin + 1; k <= sess.log.length; k++) {
    const e = sess.log[k - 1];
    if (e.t !== 'begin' && e.t !== 'move' && e.t !== 'promote' && e.t !== 'resolve') continue;
    const rebuilt = replay(sess.run.seed, sess.log.slice(0, k));
    if (!rebuilt.fight) continue;
    const label =
      e.t === 'begin'
        ? 'the clearing, untouched'
        : e.t === 'resolve'
          ? `turn ${rebuilt.fight.turn - 1} · the bramble moved`
          : e.t === 'promote'
            ? `turn ${rebuilt.fight.turn} · something blossomed`
            : `turn ${rebuilt.fight.turn} · your move`;
    states.push({ f: rebuilt.fight, label });
  }
  if (states.length < 2) return; // nothing to look back on yet
  history = { states, idx: states.length - 1 };
  selected = null;
  inspect = null;
  historyBar.classList.remove('hidden');
  hintEl.innerHTML = 'Looking back. The meadow waits — nothing moves while you remember.';
  refreshHistoryBar();
  refreshHud();
}

function refreshHistoryBar() {
  if (!history) return;
  const last = history.states.length - 1;
  histPrev.disabled = history.idx === 0;
  histNext.disabled = history.idx === last;
  histLabel.textContent = history.idx === last ? 'now' : history.states[history.idx].label;
}

function exitHistory() {
  if (!history) return;
  history = null;
  historyBar.classList.add('hidden');
  hintEl.innerHTML = DEFAULT_HINT;
  refreshHud();
}

historyBtn.onclick = () => (history ? exitHistory() : enterHistory());
histPrev.onclick = () => {
  if (history && history.idx > 0) {
    history.idx--;
    refreshHistoryBar();
  }
};
histNext.onclick = () => {
  if (history && history.idx < history.states.length - 1) {
    history.idx++;
    refreshHistoryBar();
  }
};
histLive.onclick = exitHistory;

// ---------- dev panel: see and tune everything ----------

/** Dev mode: ?dev in the URL, or five quick taps on the clearing name. */
let devMode =
  new URLSearchParams(location.search).has('dev') || localStorage.getItem('overgrown.dev') === '1';
/** Hand-tuned state can't replay from the decision log: save + look-back turn off. */
let devDirty = false;
let revealVeiled = false;
let devTaps: number[] = [];

hudName.addEventListener('click', () => {
  const now = Date.now();
  devTaps = devTaps.filter((t) => now - t < 1800);
  devTaps.push(now);
  if (devTaps.length >= 5) {
    devTaps = [];
    devMode = !devMode;
    try {
      localStorage.setItem('overgrown.dev', devMode ? '1' : '0');
    } catch {
      /* fine */
    }
    refreshHud();
  }
});

function markDevDirty() {
  if (devDirty) return;
  devDirty = true;
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* fine */
  }
}

/** Jump the run to a clearing (dev only): session surgery, then the normal intro flow. */
function devJump(idx: number) {
  if (!sess) return;
  markDevDirty();
  sess.run.fightIndex = Math.max(0, Math.min(sess.run.fights.length - 1, idx));
  sess.run.status = 'playing';
  sess.fight = null;
  sess.stage = 'intro';
  run = sess.run;
  fight = null;
  stageUi();
}

interface DevField {
  label: string;
  get: () => number;
  set: (v: number) => void;
  step?: number;
}

function devRow(f: DevField): HTMLLabelElement {
  const row = document.createElement('label');
  row.className = 'dev-row';
  const span = document.createElement('span');
  span.textContent = f.label;
  const input = document.createElement('input');
  input.type = 'number';
  input.step = String(f.step ?? 0.1);
  input.value = String(Math.round(f.get() * 100) / 100);
  input.onchange = () => {
    const v = parseFloat(input.value);
    if (Number.isNaN(v)) return;
    markDevDirty();
    f.set(v);
    refreshHud();
  };
  row.append(span, input);
  return row;
}

function devSection(parent: HTMLElement, title: string): HTMLDivElement {
  const h = document.createElement('h3');
  h.textContent = title;
  const box = document.createElement('div');
  box.className = 'dev-grid';
  parent.append(h, box);
  return box;
}

function showDevPanel() {
  if (!sess || !run) return;
  overlayEl.innerHTML = `<div class="card dev"><h2>${iconHTML('wrench', 'p2')} Dev</h2><div class="dev-body"></div><div class="btns"><button class="close">Close</button></div></div>`;
  const body = overlayEl.querySelector<HTMLDivElement>('.dev-body')!;
  overlayEl.querySelector<HTMLButtonElement>('.close')!.onclick = () => {
    overlayEl.classList.add('hidden');
    refreshHud();
    // the dev panel can clobber a mandatory choice scene (trinket/camp/promotion)
    // that was showing underneath it — restore whatever the stage actually calls for
    if (sess && sess.stage !== 'fight') stageUi();
  };

  const note = document.createElement('p');
  note.className = 'dev-note';
  note.innerHTML = devDirty
    ? `${iconHTML('warning')} hand-tuned session: saving and look-back are off until a new run`
    : 'tuning anything turns off saving and look-back for this session';
  body.append(note);

  // High-level difficulty: one slider that bends every clearing's authored
  // bramble smarts, so you can feel out a play style without touching the
  // per-fight dials below (those still work for one-off tuning).
  const diffBox = devSection(body, 'master difficulty (scales every clearing’s smarts)');
  const diffRow = document.createElement('label');
  diffRow.className = 'dev-row dev-diff';
  const diffLabel = document.createElement('span');
  const diffSlider = document.createElement('input');
  diffSlider.type = 'range';
  diffSlider.min = '0';
  diffSlider.max = '2';
  diffSlider.step = '0.1';
  const readout = () => {
    const v = run!.difficulty ?? 1;
    diffLabel.textContent =
      v === 0 ? 'naive (0.0×)' : v < 1 ? `easier (${v.toFixed(1)}×)` : v === 1 ? 'as authored (1.0×)' : `sharper (${v.toFixed(1)}×)`;
    diffSlider.value = String(v);
  };
  readout();
  const setDifficulty = (v: number) => {
    markDevDirty();
    run!.difficulty = v;
    // reflect it on the live fight right away by re-deriving from this
    // clearing's authored dials; future clearings pick it up when they build
    if (fight && fight.status === 'playing') {
      const spec = run!.fights[run!.fightIndex];
      fight.dials = { ...NAIVE_DIALS, ...scaleDials(spec.dials, v) };
    }
    readout();
    refreshHud();
  };
  diffSlider.oninput = () => {
    const v = parseFloat(diffSlider.value);
    if (!Number.isNaN(v)) setDifficulty(v);
  };
  diffRow.append(diffLabel, diffSlider);
  diffBox.append(diffRow);
  // named style presets: one tap to a whole play-feel, no dial fiddling
  const STYLES: { icon: IconName; label: string; factor: number }[] = [
    { icon: 'teacup', label: 'Cozy', factor: 0 },
    { icon: 'fern', label: 'Gentle', factor: 0.5 },
    { icon: 'scales', label: 'Balanced', factor: 1 },
    { icon: 'fire', label: 'Sharp', factor: 1.5 },
    { icon: 'wolf', label: 'Relentless', factor: 2 },
  ];
  for (const st of STYLES) {
    const b = document.createElement('button');
    b.append(iconEl(st.icon), ` ${st.label}`);
    b.onclick = () => setDifficulty(st.factor);
    diffBox.append(b);
  }

  if (fight && fight.status === 'playing') {
    const f = fight;
    const dials = devSection(body, `${f.name} — bramble mind (applies from its next telegraph)`);
    dials.append(
      devRow({ label: 'foresight', get: () => f.dials.foresight, set: (v) => (f.dials.foresight = v) }),
      devRow({ label: 'caution', get: () => f.dials.caution, set: (v) => (f.dials.caution = v) }),
      devRow({ label: 'bloodlust', get: () => f.dials.bloodlust, set: (v) => (f.dials.bloodlust = v) }),
      devRow({ label: 'temperature', get: () => f.dials.temperature, set: (v) => (f.dials.temperature = v) }),
      devRow({ label: 'acts/turn', get: () => f.actsPerTurn, set: (v) => (f.actsPerTurn = Math.max(1, Math.round(v))), step: 1 }),
    );
    const clock = devSection(body, 'spread clock & charges');
    if (f.spread) {
      const c = f.spread;
      clock.append(
        devRow({ label: 'after turn', get: () => c.after, set: (v) => (c.after = Math.round(v)), step: 1 }),
        devRow({ label: 'every', get: () => c.every, set: (v) => (c.every = Math.max(1, Math.round(v))), step: 1 }),
        devRow({ label: 'cap', get: () => c.cap, set: (v) => (c.cap = Math.round(v)), step: 1 }),
        devRow({ label: 'gate (mat %)', get: () => c.startAt ?? 0.6, set: (v) => (c.startAt = Math.max(0, Math.min(1, v))), step: 0.1 }),
      );
    }
    clock.append(
      devRow({ label: 'cloak charges', get: () => f.cloakLeft, set: (v) => (f.cloakLeft = Math.max(0, Math.round(v))), step: 1 }),
      devRow({ label: 'free moves', get: () => f.freeMoves, set: (v) => (f.freeMoves = Math.max(0, Math.round(v))), step: 1 }),
    );
  }

  const runBox = devSection(body, `run — seed ${run.seed}, clearing ${run.fightIndex + 1}/${run.fights.length}`);
  const mkBtn = (label: string, fn: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = () => {
      overlayEl.classList.add('hidden');
      fn();
    };
    return b;
  };
  runBox.append(
    mkBtn('◀ prev clearing', () => devJump(run!.fightIndex - 1)),
    mkBtn('↻ restart clearing', () => devJump(run!.fightIndex)),
    mkBtn('next clearing ▶', () => devJump(run!.fightIndex + 1)),
    mkBtn('heal roster', () => {
      markDevDirty();
      for (const c of run!.companions) c.shaken = false;
      refreshHud();
    }),
  );

  const toggles = devSection(body, 'sight & trinkets');
  const veilBtn = document.createElement('button');
  const veilLabel = () => `shroud x-ray: ${revealVeiled ? 'ON' : 'off'}`;
  veilBtn.textContent = veilLabel();
  veilBtn.onclick = () => {
    revealVeiled = !revealVeiled; // render-only: the log stays replayable
    veilBtn.textContent = veilLabel();
  };
  toggles.append(veilBtn);
  for (const id of Object.keys(TRINKETS) as (keyof typeof TRINKETS)[]) {
    const b = document.createElement('button');
    const label = () => `${iconHTML(TRINKET_ICONS[id])} ${run!.trinkets.includes(id) ? 'ON' : 'off'}`;
    b.innerHTML = label();
    b.onclick = () => {
      markDevDirty();
      run!.trinkets = run!.trinkets.includes(id)
        ? run!.trinkets.filter((t) => t !== id)
        : [...run!.trinkets, id];
      b.innerHTML = label();
      refreshHud();
    };
    toggles.append(b);
  }

  const seedBox = devSection(body, 'new run from seed');
  const seedInput = document.createElement('input');
  seedInput.type = 'number';
  seedInput.value = String(run.seed);
  seedBox.append(
    seedInput,
    mkBtn('grow this meadow', () => {
      const seed = parseInt(seedInput.value, 10);
      sess = newSession(Number.isNaN(seed) ? Date.now() % 2147483647 : seed);
      devDirty = false; // a fresh seeded session replays fine
      persist();
      stageUi();
    }),
  );

  if (fight) {
    const dump = document.createElement('pre');
    dump.className = 'dev-dump';
    dump.textContent = JSON.stringify(
      {
        turn: fight.turn,
        status: fight.status,
        dials: fight.dials,
        spread: fight.spread ?? null,
        pendingSprout: fight.pendingSprout,
        telegraphs: fight.telegraphs,
        pieces: fight.pieces.map((p) => `${p.side[0]} ${p.kind} @${p.x},${p.y}${p.spry ? ' spry' : ''}${p.fickle ? ' fickle' : ''}${p.veiled ? ' veiled' : ''}`),
      },
      null,
      1,
    );
    body.append(dump);
  }

  overlayEl.classList.remove('hidden');
}

devBtn.onclick = showDevPanel;

soundBtn.onclick = () => {
  unlockAudio();
  const nowMuted = toggleMute();
  soundBtn.innerHTML = iconHTML(nowMuted ? 'muted' : 'sound', 'p15');
  if (!nowMuted) playSfx('ui'); // a blip so you hear it come back on
};

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
  unlockAudio(); // first tap on the board is a valid gesture to start audio
  if (history || !fight || fight.status !== 'playing' || phase !== 'player') return;
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
    if (p.side === 'friend') playSfx('ui'); // picking a friend up
    hintEl.innerHTML = describeInFight(p);
  } else {
    selected = null;
    inspect = null;
    hintEl.innerHTML = DEFAULT_HINT;
  }
  refreshHud();
});

canvas.addEventListener('mousemove', (ev) => {
  if (!fight || phase !== 'player') return;
  const c = cellFromEvent(ev);
  if (c && selected == null) inspect = c;
});

/** The outcome jingle, once, when a fight settles into won/lost. */
function playOutcome() {
  if (fight?.status === 'won') playSfx('win');
  else if (fight?.status === 'lost') playSfx('lose');
}

function drainEvents() {
  if (!fight) return;
  // one sound per distinct kind this drain — a triple capture shouldn't triple-pop
  const sounds = new Set<SoundName>();
  for (const ev of fight.events) sounds.add(soundForEvent(ev.type));
  for (const s of sounds) playSfx(s);
  for (const ev of fight.events) {
    if (ev.type === 'blocked') {
      fx.push({ at: ev.at, kind: 'bonk', t: 0 });
      blockedNote =
        ev.kind === 'heart'
          ? 'The Bramble Heart balks — it won’t step where you’re watching!'
          : `You blocked the ${KIND_INFO[ev.kind].title}! It grumbles and stays put.`;
    } else if (ev.type === 'tempo') {
      fx.push({ at: ev.at, kind: 'bonk', t: 0 });
      tempoKind = ev.kind;
    } else if (ev.type === 'flee') {
      fx.push({ at: ev.at, kind: 'shaken', t: 0 });
      blockedNote = 'Your trap springs — the Bramble Heart scrambles for safety!';
    } else if (ev.type === 'cornered') {
      fx.push({ at: ev.at, kind: 'poof', t: 0 });
    } else if (ev.type === 'stir') {
      blockedNote = 'The soil stirs — the bramble is spreading! Stand on the marked square to smother it.';
    } else if (ev.type === 'sprouted') {
      fx.push({ at: ev.at, kind: 'shaken', t: 0 });
      blockedNote = 'A fresh Thistle pushes up through the soil. The bramble won’t wait forever.';
    } else if (ev.type === 'twisted') {
      fx.push({ at: ev.at, kind: 'shaken', t: 0 });
      blockedNote = 'The Thistle reaches your hedge and twists into a Gloom! Never let one walk the whole meadow.';
    } else if (ev.type === 'smothered') {
      fx.push({ at: ev.at, kind: 'bonk', t: 0 });
      blockedNote = `Smothered underfoot — nothing grows there today! ${iconHTML('daisy')}`;
    } else if (ev.type === 'cloaked') {
      fx.push({ at: ev.at, kind: 'shaken', t: 0 });
      blockedNote = `The Dandelion Cloak whisks ${
        ev.kind === 'keeper' ? 'the Keeper' : `the ${KIND_INFO[ev.kind].title}`
      } safely home! ${iconHTML('cloak')}`;
    } else if (ev.type === 'warded') {
      fx.push({ at: ev.at, kind: 'bonk', t: 0 });
      blockedNote = `The Bramble Ward turns the blow aside — ${
        ev.kind === 'keeper' ? 'the Keeper' : `your ${KIND_INFO[ev.kind].title}`
      } stands unshaken! ${iconHTML('leaf')}`;
    } else {
      fx.push({ at: ev.at, kind: ev.type === 'capture' ? 'poof' : 'shaken', t: 0 });
    }
  }
  fight.events = [];
}

// ---------- sizing & render loop ----------

/** Backdrop buffer state: same pixel size as the board's pixels, so the
 * meadow and the clearing share one pixel grid. floorY is the horizon row. */
let bgScale = 4;
let bgFloorY = 40;

function sizeCanvas() {
  const area = boardAreaEl.getBoundingClientRect();
  if (area.width < 1 || area.height < 1) return;
  let scale = bgScale;
  let boardTopCss: number | null = null;
  if (fight) {
    const availW = Math.max(60, area.width - 8);
    const availH = Math.max(60, area.height - 8);
    scale = Math.max(1, Math.floor(Math.min(availW / canvas.width, availH / canvas.height)));
    const w = `${canvas.width * scale}px`;
    if (canvas.style.width !== w) {
      // guarded: no-op rescales feed the ResizeObserver loop
      canvas.style.width = w;
      canvas.style.height = `${canvas.height * scale}px`;
    }
    // the board is centered in the area's content box (padding 18px top, 4px bottom)
    boardTopCss = 18 + Math.max(0, (area.height - 22 - canvas.height * scale) / 2);
  }
  // backdrop: integer-scaled like everything else; the buffer rounds up to
  // cover the area and the extra sliver is cropped by overflow:hidden
  const bw = Math.max(1, Math.ceil(area.width / scale));
  const bh = Math.max(1, Math.ceil(area.height / scale));
  if (backdropEl.width !== bw || backdropEl.height !== bh || bgScale !== scale) {
    backdropEl.width = bw;
    backdropEl.height = bh;
    backdropEl.style.width = `${bw * scale}px`;
    backdropEl.style.height = `${bh * scale}px`;
    bgScale = scale;
  }
  // horizon: a few pixels of meadow grass peeking above the board's top edge
  const floor = boardTopCss != null ? Math.round(boardTopCss / scale) - 4 : Math.round(bh * 0.42);
  bgFloorY = Math.max(18, Math.min(bh - 12, floor));
}

window.addEventListener('resize', sizeCanvas);
window.addEventListener('orientationchange', () => requestAnimationFrame(sizeCanvas));
if ('ResizeObserver' in window) new ResizeObserver(sizeCanvas).observe(boardAreaEl);

function frame(time: number) {
  const theme = themeFor(run ? regionOf(run.fightIndex) : 0);
  const ground: [string, string] = [theme.boardA, theme.boardB];
  drawBackdrop(backdropCtx, backdropEl.width, backdropEl.height, bgFloorY, time, theme);
  if (history) {
    // a remembered board: no selection, no effects, just the moment
    draw(ctx, history.states[history.idx].f, { selected: null, hover: null, fx: [], ground }, time);
  } else if (fight) {
    let overrides: PosOverrides | undefined;
    if (tweens.length) {
      const t = Math.min(1, (performance.now() - tweenStart) / tweenDur);
      overrides = new Map(tweens.map((tw) => [tw.id, lerp(tw.from, tw.to, t)]));
    }
    draw(
      ctx,
      fight,
      {
        selected,
        hover: inspect,
        fx,
        posOverrides: overrides,
        telegraphOverride: frozenTelegraphs ?? undefined,
        revealVeiled: revealVeiled || undefined,
        ground,
      },
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
