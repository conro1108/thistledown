export interface Vec {
  x: number;
  y: number;
}

export type Kind =
  | 'keeper'
  | 'sprout'
  | 'hopper'
  | 'slink'
  | 'rumble'
  | 'duchess'
  | 'thistle'
  | 'tumbleweed'
  | 'creeper'
  | 'golem'
  | 'gloom'
  | 'heart';

export type Side = 'friend' | 'bramble';

export interface Piece {
  id: number;
  side: Side;
  kind: Kind;
  x: number;
  y: number;
  /** honeycake'd: may also take a plain (non-capturing) one-step move */
  spry?: boolean;
}

/** An enemy's committed next move. `to: null` means it has nowhere to go. */
export interface Telegraph {
  pieceId: number;
  to: Vec | null;
}

export type Rng = () => number;

/**
 * How sharply the bramble side weighs its moves. All zeros is the naive
 * greedy mind of region 1 — it gifts tempo and walks into danger, and being
 * punished for that is exactly what those early fights teach. Later regions
 * turn these up; strength-of-play is a difficulty dial like any other.
 */
export interface AiDials {
  /** 0..1 — sees the player's reply: recaptures after landing, free pre-captures */
  foresight: number;
  /** 0..1 — reluctance to finish a quiet move on a square the friends cover */
  caution: number;
  /** multiplier on capture appetite (1 = normal) */
  bloodlust: number;
  /** score jitter that keeps move choice from being robotic (0 = none) */
  temperature: number;
}

export interface FightEvent {
  type:
    | 'capture'
    | 'shaken'
    | 'blocked'
    | 'cloaked'
    | 'cornered'
    | 'tempo'
    | 'flee'
    | 'stir' // the spread clock marks a square — fair warning
    | 'sprouted' // …and a thistle grows there
    | 'smothered'; // …unless a friend was standing on it
  at: Vec;
  kind: Kind;
}

/**
 * The spread clock: linger past `after` turns and a thistle reinforcement
 * sprouts at the far edge every `every` turns (never past `cap` bramble
 * pieces). The anti-stall valve — camping a dead position stops being free.
 */
export interface SpreadConfig {
  after: number;
  every: number;
  cap: number;
}

export interface FightState {
  name: string;
  w: number;
  h: number;
  pieces: Piece[];
  telegraphs: Telegraph[];
  actsPerTurn: number;
  dials: AiDials;
  /** reinforcement clock, if this fight has one */
  spread?: SpreadConfig;
  /** where the next reinforcement will sprout (telegraphed one turn ahead) */
  pendingSprout: Vec | null;
  /** next fresh piece id (reinforcements need ids nothing else wears) */
  nextId: number;
  turn: number;
  status: 'playing' | 'won' | 'lost';
  rng: Rng;
  /** transient, drained by the renderer each frame */
  events: FightEvent[];
  /** a sprout reached the far edge — the turn is frozen until promote() is called */
  pendingPromotion: number | null;
  /** Dandelion Cloak charges left this fight */
  cloakLeft: number;
  /** Second Breakfast: extra player moves banked for this fight */
  freeMoves: number;
  /** Acorn Whistle is along (mid-fight promotions to hopper come out spry) */
  whistle: boolean;
}
