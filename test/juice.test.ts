import { describe, expect, test } from "bun:test";
import {
  easeOutBack,
  easeOutCubic,
  integrate,
  isDead,
  makeBurst,
  type Particle,
  particleAlpha,
} from "../src/scene/juice";
import { seededRng } from "../src/shared/rng";

describe("easing", () => {
  test("easeOutBack pins endpoints and overshoots past 1 near the end", () => {
    expect(easeOutBack(0)).toBeCloseTo(0, 6);
    expect(easeOutBack(1)).toBeCloseTo(1, 6);
    // characteristic overshoot: somewhere in the back half it exceeds 1
    const peak = Math.max(
      ...Array.from({ length: 21 }, (_v, i) => easeOutBack(i / 20)),
    );
    expect(peak).toBeGreaterThan(1);
  });
  test("easeOutBack clamps out-of-range input to the endpoints", () => {
    expect(easeOutBack(-1)).toBeCloseTo(0, 6);
    expect(easeOutBack(2)).toBeCloseTo(1, 6);
  });
  test("easeOutCubic is monotonic 0→1 and clamps", () => {
    expect(easeOutCubic(0)).toBeCloseTo(0, 6);
    expect(easeOutCubic(1)).toBeCloseTo(1, 6);
    expect(easeOutCubic(-5)).toBeCloseTo(0, 6);
    expect(easeOutCubic(9)).toBeCloseTo(1, 6);
    let prev = -1;
    for (let i = 0; i <= 10; i++) {
      const v = easeOutCubic(i / 10);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe("makeBurst", () => {
  test("emits exactly n particles, all at the origin, deterministically", () => {
    const a = makeBurst(10, 20, 8, seededRng("b"));
    const b = makeBurst(10, 20, 8, seededRng("b"));
    expect(a.length).toBe(8);
    expect(a).toEqual(b); // same seed → identical
    for (const p of a) {
      expect(p.x).toBe(10);
      expect(p.y).toBe(20);
      expect(p.age).toBe(0);
      expect(p.life).toBeGreaterThan(0);
      expect(p.size).toBeGreaterThan(0);
    }
  });
  test("velocity magnitude sits within the requested speed band", () => {
    const ps = makeBurst(0, 0, 40, seededRng("v"), { speed: 0.1 });
    for (const p of ps) {
      const mag = Math.hypot(p.vx, p.vy);
      expect(mag).toBeGreaterThanOrEqual(0.1 * 0.5 - 1e-9);
      expect(mag).toBeLessThanOrEqual(0.1 * 1.5 + 1e-9);
    }
  });
});

describe("integrate / lifetime", () => {
  test("advances position by velocity·dt, applies gravity, ages", () => {
    const p: Particle = {
      x: 0,
      y: 0,
      vx: 2,
      vy: 0,
      age: 0,
      life: 100,
      size: 1,
    };
    integrate(p, 10, 0.5);
    expect(p.x).toBeCloseTo(20, 6); // 2 px/ms × 10ms
    expect(p.vy).toBeCloseTo(5, 6); // 0.5 × 10
    expect(p.y).toBeCloseTo(50, 6); // new vy × 10
    expect(p.age).toBe(10);
  });
  test("alpha fades 1→0 over life then clamps; isDead flips at life", () => {
    const p: Particle = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      age: 0,
      life: 100,
      size: 1,
    };
    expect(particleAlpha(p)).toBeCloseTo(1, 6);
    expect(isDead(p)).toBe(false);
    p.age = 50;
    expect(particleAlpha(p)).toBeCloseTo(0.5, 6);
    p.age = 100;
    expect(particleAlpha(p)).toBe(0);
    expect(isDead(p)).toBe(true);
    p.age = 250;
    expect(particleAlpha(p)).toBe(0); // clamped, never negative
  });
});
