export type Rng = () => number;

let current: Rng = Math.random;

export function rng(): number {
  return current();
}

export function setRng(fn: Rng): void {
  current = fn;
}

export function resetRng(): void {
  current = Math.random;
}

/**
 * Cheap, well-distributed 32-bit PRNG. Mulberry32 reference implementation
 * (Tommy Ettinger, 2017). Period ~2^32; good enough for daily-challenge
 * determinism without a heavyweight dependency.
 */
export function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

/** Deterministic 32-bit hash of a string. FNV-1a, suitable for seed derivation. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Build a deterministic Rng keyed by an arbitrary string seed. */
export function seededRng(seed: string): Rng {
  return mulberry32(hashString(seed));
}
