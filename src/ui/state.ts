// Shared UI state and constants. Everything mutable that more than one ui/
// module reads lives on `S`; module-private state stays in its own file.
import type { RunState, TrinketId } from '../game/run';
import type { Session } from '../game/session';
import type { FightState, Kind, Telegraph, UpgradeId, Vec } from '../game/types';
import type { IconName } from '../render/icons';
import type { FX } from '../render/scene';

export const TRINKET_ICONS: Record<TrinketId, IconName> = {
  cloak: 'cloak',
  ward: 'leaf',
  breakfast: 'pancakes',
  fork: 'twig',
  pin: 'thorn',
  whistle: 'acorn',
  glow: 'jar',
  dew: 'blossom',
};

/** Each movement upgrade's pixel icon — a card face for the campfire. */
export const UPGRADE_ICONS: Record<UpgradeId, IconName> = {
  longstride: 'sprout',
  rootgrip: 'fern',
  longlegs: 'tulip',
  sidestep: 'scales',
  underbrush: 'bloom',
  cornering: 'wolf',
};

/** A one-line move phrase for the compact recruit cards (KIND_INFO blurbs run long). */
export const MOVE_TAG: Partial<Record<Kind, string>> = {
  sprout: 'Steps ahead, pokes on the slant',
  hopper: 'Leaps in an L, over anything',
  slink: 'Glides on the diagonals',
  rumble: 'Barrels in straight lines',
  duchess: 'Goes anywhere, any distance',
};

export const OBJECTIVE = 'Catch every bramble creature to win the clearing.';
/**
 * The resting hints (see restingHint in hud.ts). The full how-to-move sentence
 * only lives under the board through a player's first clearing ever — a
 * paragraph of instructions under every fight forever was the loudest "this is
 * a dev build" tell on the screen.
 */
export const DEFAULT_HINT = 'Tap a friend to see where they can go.';
export const FIRST_HINT =
  'Tap a friend (on the board or below), then tap a glowing square — or just drag them there.';
export const PAUSE_MS = 340; // beat after your move, before the bramble acts
export const TWEEN_MS = 190; // how long their slide/leap takes to draw
export const SAVE_BEAT_MS = 660; // a Ward/Cloak save holds the turn open to be watched
export const PLAYER_TWEEN_MS = 120; // your own piece sliding into place
// bumped whenever an engine change shifts RNG draw order or offers, so older
// decision logs no longer replay faithfully — they're discarded, not migrated
export const SAVE_KEY = 'overgrown.save.v7'; // v7: the powerups were reworked — trinket/upgrade ids and offers changed
export const SCORES_KEY = 'overgrown.scores.v1';
export const JOURNAL_KEY = 'overgrown.journal.v1';

export type Phase = 'player' | 'enemy';

export const S = {
  sess: null as Session | null,
  /** views into sess (same object references), refreshed by doEntry/stageUi */
  run: null as RunState | null,
  fight: null as FightState | null,
  /** companion index (in run.companions) -> its live piece id this fight */
  companionPieceId: new Map<number, number>(),
  phase: 'player' as Phase,
  selected: null as number | null,
  inspect: null as Vec | null,
  fx: [] as FX[],
  tweens: [] as { id: number; from: Vec; to: Vec }[],
  tweenStart: 0,
  tweenDur: TWEEN_MS,
  frozenTelegraphs: null as Telegraph[] | null,
  /** set while resolving if something noteworthy happened — shown as the next hint */
  blockedNote: null as string | null,
  /**
   * Which trinket just saved a friend, if one did on the last enemy turn. Drives
   * the banner's gold state and the pulse on the badge that spent itself.
   */
  savedBy: null as TrinketId | null,
  /**
   * When that save happened. The flash is one-shot: refreshHud rebuilds the
   * banner on every tap, and re-flashing each time is noise, not signal.
   */
  savedAt: 0,
  /** the enemy the player just caught mid-lunge (its telegraph died with it) */
  tempoKind: null as Kind | null,
  /** the player just forked two creatures — the line to shout while the bramble stalls */
  forkNote: null as string | null,
  /** looking back through this clearing's moves (view-only, replay-built) */
  history: null as { states: { f: FightState; label: string }[]; idx: number } | null,
  /**
   * A friend being dragged. `moved` stays false until the pointer travels far
   * enough to count as a drag — below that it's a tap.
   */
  drag: null as { id: number; from: Vec; at: Vec; moved: boolean } | null,
  /** Hand-tuned state can't replay from the decision log: save + look-back turn off. */
  devDirty: false,
  revealVeiled: false,
};

const SAVE_FLASH_MS = 900;
export const saveFlashing = () => S.savedBy != null && performance.now() - S.savedAt < SAVE_FLASH_MS;
