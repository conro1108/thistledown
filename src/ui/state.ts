// Shared UI state and constants. Everything mutable that more than one ui/
// module reads lives on `S`; module-private state stays in its own file.
import type { RunState, TrinketId } from '../game/run';
import type { Session } from '../game/session';
import type { FightState, Kind, Telegraph, UpgradeId, Vec } from '../game/types';
import type { IconName } from '../render/icons';
import type { FX } from '../render/scene';

export const TRINKET_ICONS: Record<TrinketId, IconName> = {
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
export const UPGRADE_ICONS: Record<UpgradeId, IconName> = {
  thornstep: 'sprout',
  rootgrip: 'leaf',
  springheel: 'acorn',
  sidestep: 'fern',
  underbrush: 'bloom',
  pivot: 'scales',
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
export const DEFAULT_HINT =
  'Tap a friend (on the board or below), then tap a glowing square — or just drag them there.';
export const PAUSE_MS = 340; // beat after your move, before the bramble acts
export const TWEEN_MS = 190; // how long their slide/leap takes to draw
export const SAVE_BEAT_MS = 660; // a Ward/Cloak save holds the turn open to be watched
export const PLAYER_TWEEN_MS = 120; // your own piece sliding into place
// v5: movement upgrades + expanded, region-gated trinkets shift the run's RNG
// draw order, so older decision logs no longer replay faithfully — let them go
export const SAVE_KEY = 'overgrown.save.v6'; // v6: the spread clock was retuned, so old logs replay differently
export const SCORES_KEY = 'overgrown.scores.v1';

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
