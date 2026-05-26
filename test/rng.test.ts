import { afterEach, describe, expect, it } from "bun:test";
import {
  hashString,
  mulberry32,
  resetRng,
  rng,
  seededRng,
  setRng,
} from "../src/shared/rng";

afterEach(resetRng);

describe("mulberry32", () => {
  it("returns floats in [0, 1)", () => {
    const r = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("is deterministic: same seed → same sequence", () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    for (let i = 0; i < 50; i++) {
      expect(a()).toBe(b());
    }
  });

  it("different seeds produce different sequences", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it("seed 0 is acceptable (no division-by-zero / NaN)", () => {
    const r = mulberry32(0);
    expect(Number.isFinite(r())).toBe(true);
  });
});

describe("hashString (FNV-1a)", () => {
  it("returns a non-negative 32-bit integer", () => {
    const h = hashString("daily-2026-05-26");
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(2 ** 32);
    expect(Number.isInteger(h)).toBe(true);
  });

  it("is deterministic: same string → same hash", () => {
    expect(hashString("hello")).toBe(hashString("hello"));
  });

  it("different strings → almost-always different hashes", () => {
    expect(hashString("daily-2026-05-26")).not.toBe(
      hashString("daily-2026-05-27"),
    );
  });

  it("empty string is well-defined", () => {
    expect(Number.isInteger(hashString(""))).toBe(true);
  });
});

describe("seededRng", () => {
  it("same seed string → identical sequences", () => {
    const a = seededRng("daily-2026-05-26");
    const b = seededRng("daily-2026-05-26");
    for (let i = 0; i < 20; i++) {
      expect(a()).toBe(b());
    }
  });

  it("different seed strings → distinct sequences", () => {
    const a = seededRng("daily-2026-05-26");
    const b = seededRng("daily-2026-05-27");
    expect(a()).not.toBe(b());
  });
});

describe("setRng / resetRng", () => {
  it("setRng replaces the global rng() output", () => {
    setRng(() => 0.42);
    expect(rng()).toBe(0.42);
    expect(rng()).toBe(0.42);
  });

  it("resetRng restores Math.random (output varies, in range)", () => {
    setRng(() => 0.5);
    expect(rng()).toBe(0.5);
    resetRng();
    const v = rng();
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });
});
