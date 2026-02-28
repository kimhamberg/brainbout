/** Duhamel formula: nodes = e^((elo + 365) / 214) */
export function eloToNodes(elo: number): number {
  return Math.round(Math.exp((elo + 365) / 214));
}

export interface ThinkTimeInput {
  remainingMs: number;
  moveNumber: number;
  /** Absolute centipawn eval swing between successive depths. */
  evalSwing: number;
  isRecapture: boolean;
}

/**
 * Compute synthetic think time in ms for the engine's current move.
 *
 * Chess960-aware: no opening discount (no theory to lean on).
 * Models: base budget, complexity scaling, recapture shortcut,
 * time-trouble panic, and jitter.
 */
export function computeThinkTime(input: ThinkTimeInput): number {
  const { remainingMs, moveNumber, evalSwing, isRecapture } = input;

  // Budget: divide remaining time among expected remaining moves
  const movesLeft = Math.max(10, 40 - moveNumber);
  let base = remainingMs / movesLeft;

  // Complexity factor from eval swing (centipawns)
  // 0-20 cp = stable (0.5-0.8x), 20-100 cp = normal (0.8-1.5x), 100+ = complex (1.5-2x)
  let complexity: number;
  if (evalSwing < 20) {
    complexity = 0.5 + (evalSwing / 20) * 0.3;
  } else if (evalSwing < 100) {
    complexity = 0.8 + ((evalSwing - 20) / 80) * 0.7;
  } else {
    complexity = Math.min(2.0, 1.5 + ((evalSwing - 100) / 200) * 0.5);
  }

  // Recaptures are near-instant for humans
  if (isRecapture) {
    complexity *= 0.3;
  }

  base *= complexity;

  // Jitter: +/- 20%
  const jitter = 0.8 + Math.random() * 0.4;
  base *= jitter;

  // Clamp: [1s, min(30s, remaining - 5s)]
  const maxTime = Math.min(30_000, remainingMs - 5000);
  return Math.max(1000, Math.min(base, maxTime));
}
