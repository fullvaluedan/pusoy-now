// Seedable random number generator.
//
// Every source of randomness in the bot flows through an injected `Rng` so a
// game can be replayed exactly from a seed. That makes the bot tests
// deterministic and lets the win-rate harness compare difficulty levels over
// the same 200 deals.

import type { Rng } from './types';

// mulberry32: 32-bit state, uniform in [0, 1), fast, good enough for card
// shuffling and play selection. Not cryptographic.
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// An rng that never triggers a "wobble" branch (every threshold in the bot is
// well below 1). Use this when a test wants the bot's deterministic best play.
export const NO_WOBBLE: Rng = () => 0.99;
