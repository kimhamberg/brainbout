import { describe, expect, test } from "bun:test";
import { hueBucket, hueRotate, moonlit } from "../src/scene/recolor";

const sat = (r: number, g: number, b: number): number =>
  Math.max(r, g, b) - Math.min(r, g, b);

describe("hueRotate", () => {
  test("delta 0 round-trips primaries (red, green, blue)", () => {
    for (const c of [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
    ]) {
      const out = hueRotate(
        new Uint8ClampedArray([c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, 255]),
        0,
      );
      expect([out[0], out[1], out[2]]).toEqual(c);
    }
  });

  test("rotating red by +120° lands on green", () => {
    const out = hueRotate(new Uint8ClampedArray([255, 0, 0, 255]), 120);
    expect(out[1]).toBeGreaterThan(out[0] as number);
    expect(out[1]).toBeGreaterThan(out[2] as number);
  });

  test("preserves alpha; skips fully-transparent pixels", () => {
    const out = hueRotate(new Uint8ClampedArray([200, 50, 50, 0]), 90);
    expect(out[3]).toBe(0);
    expect([out[0], out[1], out[2]]).toEqual([0, 0, 0]);
  });

  test("grayscale is hue-invariant (saturation 0)", () => {
    const out = hueRotate(new Uint8ClampedArray([128, 128, 128, 255]), 200);
    expect([out[0], out[1], out[2]]).toEqual([128, 128, 128]);
  });

  test("deterministic", () => {
    const a = hueRotate(new Uint8ClampedArray([12, 200, 90, 255]), 37);
    const b = hueRotate(new Uint8ClampedArray([12, 200, 90, 255]), 37);
    expect([...a]).toEqual([...b]);
  });
});

describe("moonlit", () => {
  test("desaturates and preserves alpha", () => {
    const out = moonlit(new Uint8ClampedArray([60, 200, 80, 255]));
    expect(out[3]).toBe(255);
    expect(
      sat(out[0] as number, out[1] as number, out[2] as number),
    ).toBeLessThan(sat(60, 200, 80));
  });

  test("skips transparent pixels", () => {
    const out = moonlit(new Uint8ClampedArray([60, 200, 80, 0]));
    expect([out[0], out[1], out[2], out[3]]).toEqual([0, 0, 0, 0]);
  });
});

describe("hueBucket", () => {
  test("quantises to the nearest multiple", () => {
    expect(hueBucket(13)).toBe(12);
    expect(hueBucket(-13)).toBe(-12);
    expect(hueBucket(2)).toBe(0);
    expect(hueBucket(10, 5)).toBe(10);
  });
});
