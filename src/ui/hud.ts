// The hud strip (status line, trinket badges, roster chips) and the critter
// text helpers the hint line and cards share.
import { enemies } from '../game/fight';
import { DEEP_FIGHTS, isDeep, SURFACE_FIGHTS } from '../game/ladder';
import { activeUpgrades, isSpry, KIND_INFO, TRINKETS, upgradeClearingsLeft, UPGRADES } from '../game/run';
import type { Kind } from '../game/types';
import { iconEl, iconHTML, type IconName } from '../render/icons';
import { drawSprite } from '../render/sprites';
import { devBtn, historyBtn, hudName, rosterEl, statusEl, statusLineEl, trinketsEl } from './dom';
import { showOverlay } from './overlay';
import { DEFAULT_HINT, FIRST_HINT, S, saveFlashing, TRINKET_ICONS, UPGRADE_ICONS } from './state';
import { coach, loadJournal } from './storage';
import { selectPiece } from './turn';

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * What the line under the board says when nothing else needs it. State first:
 * a marked square about to sprout is the one thing worth a standing warning
 * (the stir note itself is gone on the next tap). The full how-to-move
 * sentence stays up through a player's first clearing ever; after that the
 * short reminder of the tap-to-inspect affordance.
 */
export function restingHint(): string {
  if (S.fight?.pendingSprout && S.fight.status === 'playing')
    return `The soil stirs at the marked square — stand on it before something grows. ${iconHTML('sprout')}`;
  return loadJournal().deepest < 1 ? FIRST_HINT : DEFAULT_HINT;
}

/** Capitalize the first letter — for notes that used to sit mid-sentence. */
export function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// ---------- hud ----------

function phaseLabel(): string {
  if (!S.fight) return '';
  if (S.fight.status === 'lost') return `${iconHTML('zzz')} the lantern goes out`;
  if (S.fight.status === 'won') return `${iconHTML('daisy')} clearing won!`;
  return S.phase === 'enemy'
    ? `${iconHTML('sprout')} the bramble moves…`
    : `${iconHTML('daisy')} your move · turn ${S.fight.turn}`;
}

/** The short tail of the status line: what's left to do. */
function goalLabel(): string {
  if (!S.fight || S.fight.status !== 'playing') return '';
  const heart = S.fight.pieces.find((p) => p.kind === 'heart');
  const left = enemies(S.fight).length - (heart ? 1 : 0);
  if (heart) return left ? `${iconHTML('fern')} ${left} guard${left > 1 ? 's' : ''}` : 'corner the Heart!';
  return `${iconHTML('fern')} ${left} to catch`;
}

export function refreshHud() {
  if (!S.run || !S.fight) return;
  const i = S.run.fightIndex;
  hudName.textContent = isDeep(i)
    ? `${S.fight.name} · below ${i - SURFACE_FIGHTS + 1}/${DEEP_FIGHTS}`
    : `${S.fight.name} · ${i + 1}/${SURFACE_FIGHTS}`;
  const goal = goalLabel();
  statusLineEl.innerHTML = goal ? `${phaseLabel()} · ${goal}` : phaseLabel();
  statusEl.className = S.fight.status !== 'playing' ? S.fight.status : S.phase;
  // a save overrides the phase tint: gold, so the banner itself is the alarm
  if (S.savedBy && S.fight.status === 'playing') {
    statusEl.classList.add('saved');
    if (saveFlashing()) statusEl.classList.add('flash');
  }
  historyBtn.classList.toggle(
    'hidden',
    S.devDirty || !S.sess || S.sess.stage !== 'fight' || S.fight.status !== 'playing',
  );
  historyBtn.disabled = S.phase !== 'player';
  devBtn.classList.remove('hidden');
  trinketsEl.innerHTML = '';
  for (const id of S.run.trinkets) {
    // a real button: title= tooltips don't exist on a phone
    const t = document.createElement('button');
    t.className = 'trinket';
    // The Cloak and the Ward hold one charge per clearing. A spent one that
    // still looks fully lit is a promise the game can't keep — so it dims, and
    // the one that just fired flashes gold to tie the save to its cause.
    const charge = id === 'cloak' ? S.fight.cloakLeft : id === 'ward' ? S.fight.wardLeft : null;
    if (charge === 0) t.classList.add('spent');
    if (S.savedBy === id) {
      t.classList.add('fired');
      if (saveFlashing()) t.classList.add('flash');
    }
    t.append(iconEl(TRINKET_ICONS[id], 'p2'));
    t.onclick = () =>
      showOverlay(
        `${iconHTML(TRINKET_ICONS[id], 'p2')} ${TRINKETS[id].title}`,
        charge === 0
          ? `${TRINKETS[id].blurb} <span class="objective">Already spent in this clearing — it comes back at the next one.</span>`
          : TRINKETS[id].blurb,
        [{ label: 'Onward', fn: () => {} }],
      );
    trinketsEl.append(t);
  }
  // Movement upgrades are temporary — show each live one with the clearings it has left,
  // so a fading trick never surprises the player.
  for (const id of activeUpgrades(S.run)) {
    const left = upgradeClearingsLeft(S.run, id);
    const u = document.createElement('button');
    u.className = 'trinket';
    u.append(iconEl(UPGRADE_ICONS[id], 'p2'));
    const badge = document.createElement('span');
    badge.className = 'upgrade-left';
    badge.textContent = String(left);
    u.append(badge);
    u.onclick = () =>
      showOverlay(
        `${iconHTML(UPGRADE_ICONS[id], 'p2')} ${UPGRADES[id].title}`,
        `${UPGRADES[id].blurb} Fades in ${plural(left, 'clearing')}.`,
        [{ label: 'Onward', fn: () => {} }],
      );
    trinketsEl.append(u);
  }
  renderRoster();
}

function renderRoster() {
  rosterEl.innerHTML = '';
  if (!S.run || !S.fight) return;
  rosterEl.append(rosterButton('keeper', 1, false));
  for (let i = 0; i < S.run.companions.length; i++) {
    const c = S.run.companions[i];
    const pieceId = S.companionPieceId.get(i);
    const alive = pieceId != null && S.fight.pieces.some((p) => p.id === pieceId);
    rosterEl.append(
      rosterButton(c.kind, pieceId ?? -1, c.shaken || !alive, c.shaken ? 'zzz' : isSpry(S.run, c) ? 'honey' : undefined),
    );
  }
}

/** A small chip: sprite + critter type. Board taps are the main way to select;
 * these are just a legible "who's in the band" strip that happens to be tappable. */
function rosterButton(kind: Kind, pieceId: number, disabled: boolean, badge?: IconName): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'chip' + (S.selected === pieceId ? ' selected' : '');
  b.disabled = disabled || S.phase !== 'player' || !S.fight || S.fight.status !== 'playing';
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

/**
 * Who on the other side moves exactly like this. The corner pip already pairs
 * them on the board; tapping either one says it in words.
 */
const TWIN: Partial<Record<Kind, Kind>> = {
  sprout: 'thistle',
  thistle: 'sprout',
  hopper: 'tumbleweed',
  tumbleweed: 'hopper',
  slink: 'creeper',
  creeper: 'slink',
  rumble: 'golem',
  golem: 'rumble',
  duchess: 'gloom',
  gloom: 'duchess',
};

/** "a Sprout and 2 Hoppers" — companions listed by type, names are campfire flavor only. */
export function listKinds(kinds: Kind[]): string {
  const counts = new Map<Kind, number>();
  for (const k of kinds) counts.set(k, (counts.get(k) ?? 0) + 1);
  return [...counts]
    .map(([k, n]) => (n > 1 ? `${n} ${KIND_INFO[k].title}s` : `a ${KIND_INFO[k].title}`))
    .join(' and ');
}

/**
 * What the hint line says when a piece is tapped. The very first time anyone
 * ever picks up a friend, say what the glow means — the one rule (move by
 * landing, catch by landing) the whole game hangs on. After that, the piece
 * describes itself.
 */
export function tapHint(p: Parameters<typeof describeInFight>[0]): string {
  if (p.side === 'friend') {
    const first = coach(
      'select',
      `The glowing squares are everywhere the ${
        p.kind === 'keeper' ? 'Keeper' : KIND_INFO[p.kind].title
      } can go — land on a bramble creature to catch it! ${iconHTML('daisy')}`,
    );
    if (first) return first;
  }
  return describeInFight(p);
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
  const twin = TWIN[p.kind];
  if (twin) {
    txt +=
      p.side === 'bramble'
        ? ` Same pip as your ${KIND_INFO[twin].title} — it moves exactly the same.`
        : ` Same pip as their ${KIND_INFO[twin].title} — they move exactly the same.`;
  }
  if (p.side === 'bramble') {
    if (p.veiled) txt += ' Shrouded — no arrow. The lit squares are everywhere it could strike.';
    else if (p.fickle) txt += ' Fickle — two arrows, and it takes whichever looks tastier.';
  } else if (p.spry) {
    txt += ` Spry ${iconHTML('honey')} — may also take a plain one-step, any direction. A stroll, never a pounce.`;
  }
  return txt;
}
