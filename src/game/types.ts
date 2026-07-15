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
  | 'gloom';

export type Side = 'friend' | 'bramble';

export interface Piece {
  id: number;
  side: Side;
  kind: Kind;
  x: number;
  y: number;
}

/** An enemy's committed next move. `to: null` means it has nowhere to go. */
export interface Telegraph {
  pieceId: number;
  to: Vec | null;
}

export type Rng = () => number;

export interface FightEvent {
  type: 'capture' | 'shaken' | 'blocked';
  at: Vec;
  kind: Kind;
}

export interface FightState {
  name: string;
  w: number;
  h: number;
  pieces: Piece[];
  telegraphs: Telegraph[];
  actsPerTurn: number;
  cursor: number; // round-robin position over enemies for activations
  turn: number;
  status: 'playing' | 'won' | 'lost';
  rng: Rng;
  /** transient, drained by the renderer each frame */
  events: FightEvent[];
  /** a sprout reached the far edge — the turn is frozen until promote() is called */
  pendingPromotion: number | null;
}
