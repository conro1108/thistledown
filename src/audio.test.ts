import { describe, expect, it } from 'vitest';
import { soundForEvent, type SoundName } from './audio';
import type { FightEvent } from './game/types';

// every FightEvent type the engine can emit — keep in lockstep with types.ts
const ALL_TYPES: FightEvent['type'][] = [
  'capture',
  'shaken',
  'blocked',
  'cloaked',
  'cornered',
  'tempo',
  'flee',
  'stir',
  'sprouted',
  'smothered',
  'twisted',
];

describe('soundForEvent', () => {
  it('maps every event type to a real sound', () => {
    const valid: SoundName[] = [
      'move',
      'pop',
      'oof',
      'thud',
      'sparkle',
      'fanfare',
      'warn',
      'alarm',
      'ui',
      'win',
      'lose',
    ];
    for (const t of ALL_TYPES) {
      expect(valid).toContain(soundForEvent(t));
    }
  });

  it('captures pop into flowers', () => {
    expect(soundForEvent('capture')).toBe('pop');
    expect(soundForEvent('smothered')).toBe('pop');
  });

  it('good breaks (tempo/flee/cloak) sparkle; a twist alarms', () => {
    expect(soundForEvent('tempo')).toBe('sparkle');
    expect(soundForEvent('flee')).toBe('sparkle');
    expect(soundForEvent('cloaked')).toBe('sparkle');
    expect(soundForEvent('twisted')).toBe('alarm');
  });

  it('a shaken friend oofs; a blocked move thuds', () => {
    expect(soundForEvent('shaken')).toBe('oof');
    expect(soundForEvent('blocked')).toBe('thud');
  });
});
