/**
 * Juice math — pure easing + a tiny particle model (design "juice it or lose
 * it"). The zone blocks integrate these on the Pixi ticker for post-grade
 * flourishes (wake bursts, harvest sparkles, glow pulses). Kept PURE + unit
 * tested here; the Graphics drawing lives in the coverage-ignored render layer.
 *
 * Cosmetics only — every consumer runs these AFTER the grade is recorded and
 * never during the measured RT window (frozen-ticker guardrail), so juice can't
 * contaminate response times.
 */

import type { Rng } from "../shared/rng";

const TAU = Math.PI * 2;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Overshoot-and-settle (squash/stretch pop). easeOutBack(0)=0, (1)=1, peaks >1. */
export function easeOutBack(t: number, overshoot = 1.70158): number {
  const x = clamp01(t) - 1;
  return 1 + (overshoot + 1) * x ** 3 + overshoot * x ** 2;
}

/** Decelerating ease. easeOutCubic(0)=0, (1)=1, monotonic. */
export function easeOutCubic(t: number): number {
  return 1 - (1 - clamp01(t)) ** 3;
}

export interface Particle {
  x: number;
  y: number;
  vx: number; // px per ms
  vy: number;
  age: number; // ms
  life: number; // ms
  size: number; // px
}

export interface BurstOptions {
  /** Base outward speed in px/ms (each particle gets 0.5–1.5×). */
  speed?: number;
  /** Particle lifetime in ms (each gets 0.7–1.0×). */
  life?: number;
  /** Base radius in px. */
  size?: number;
}

/**
 * A radial burst of `n` particles from (x, y). Deterministic for a given rng,
 * so seeded sessions stay reproducible.
 */
export function makeBurst(
  x: number,
  y: number,
  n: number,
  rng: Rng,
  opts: BurstOptions = {},
): Particle[] {
  const speed = opts.speed ?? 0.08;
  const life = opts.life ?? 600;
  const size = opts.size ?? 3;
  const out: Particle[] = [];
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * TAU + rng() * (TAU / n); // even spread + jitter
    const sp = speed * (0.5 + rng());
    out.push({
      x,
      y,
      vx: Math.cos(angle) * sp,
      vy: Math.sin(angle) * sp,
      age: 0,
      life: life * (0.7 + rng() * 0.3),
      size: size * (0.6 + rng() * 0.8),
    });
  }
  return out;
}

/** Advance a particle by `dtMs` (mutates): integrate velocity + gravity + age. */
export function integrate(p: Particle, dtMs: number, gravity = 0): void {
  p.vy += gravity * dtMs;
  p.x += p.vx * dtMs;
  p.y += p.vy * dtMs;
  p.age += dtMs;
}

/** Fading opacity 1→0 over the particle's life (0 once dead). */
export function particleAlpha(p: Particle): number {
  return clamp01(1 - p.age / p.life);
}

/** True once the particle has outlived its `life`. */
export function isDead(p: Particle): boolean {
  return p.age >= p.life;
}
