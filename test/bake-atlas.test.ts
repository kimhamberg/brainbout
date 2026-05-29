import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { critter } from "../scripts/bake/creature";
import { drawPlant, type PlantKnobs } from "../scripts/bake/lsystem";
import { sha256 } from "../scripts/bake/manifest";
import { oklch, rampFromAnchor } from "../scripts/bake/palette";
import { dualGridTiles } from "../scripts/bake/tiles";
import { seededRng } from "../src/shared/rng";

/**
 * Golden digest of the committed atlas, baked on the PINNED Bun (see
 * .github/actions/setup). The CI `bake` job re-runs `gen:art` and asserts the
 * committed PNGs are byte-reproducible; this constant additionally catches an
 * atlas/manifest changed without acknowledging it. If you intentionally change
 * a generator: `bun run gen:art && git add public/art`, then update this.
 */
const EXPECTED_DIGEST =
  "367382f664e131cec73140c695f5f10b5f64244d4772ca0247e7c77490c1a2db";

describe("palette (OKLCH) — quantized & in range (VH-11)", () => {
  test("every channel is an integer in [0,255]", () => {
    for (let h = 0; h < 360; h += 30) {
      for (const L of [0.3, 0.6, 0.9]) {
        const [r, g, b] = oklch(L, 0.12, h);
        for (const v of [r, g, b]) {
          expect(Number.isInteger(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(255);
        }
      }
    }
  });

  test("ramp is deterministic across calls", () => {
    expect(rampFromAnchor(150, 0.12, 5)).toEqual(rampFromAnchor(150, 0.12, 5));
  });

  test("ramp goes shadow→light (monotonic luminance proxy)", () => {
    const { shadow, light } = rampFromAnchor(150, 0.12, 5);
    const lum = (c: readonly number[]) =>
      0.299 * (c[0] ?? 0) + 0.587 * (c[1] ?? 0) + 0.114 * (c[2] ?? 0);
    expect(lum(light)).toBeGreaterThan(lum(shadow));
  });
});

describe("L-system plant — deterministic from seed", () => {
  const knobs: PlantKnobs = {
    grammar: "bush",
    branchAngle: 26,
    iterations: 4,
    internode: 4,
    leafR: 3,
    bloom: true,
  };
  const ramp = rampFromAnchor(150, 0.12, 5);
  const accent = oklch(0.74, 0.15, 60);

  test("same seed → byte-identical raster", () => {
    const a = drawPlant(48, knobs, ramp, accent, seededRng("plant:fern"));
    const b = drawPlant(48, knobs, ramp, accent, seededRng("plant:fern"));
    expect(sha256(a.data)).toBe(sha256(b.data));
  });

  test("different seeds → different rasters (real variation)", () => {
    const a = drawPlant(48, knobs, ramp, accent, seededRng("plant:fern"));
    const b = drawPlant(48, knobs, ramp, accent, seededRng("plant:oak"));
    expect(sha256(a.data)).not.toBe(sha256(b.data));
  });

  test("plant has substantial foliage (not a bare stalk — the fixed flaw)", () => {
    const a = drawPlant(48, knobs, ramp, accent, seededRng("plant:fern"));
    let painted = 0;
    for (let i = 3; i < a.data.length; i += 4) {
      if ((a.data[i] ?? 0) > 0) painted++;
    }
    // a bare-stalk plant covered <2% of the cell; a leafy one covers far more
    expect(painted / (a.w * a.h)).toBeGreaterThan(0.1);
  });
});

describe("creature + tile generators — deterministic", () => {
  const ramp = rampFromAnchor(80, 0.13, 5);
  const accent = oklch(0.74, 0.15, 40);

  test("critter: same seed → byte-identical; different seed → different", () => {
    const a = critter(48, ramp, accent, seededRng("crit:a"));
    const b = critter(48, ramp, accent, seededRng("crit:a"));
    const c = critter(48, ramp, accent, seededRng("crit:z"));
    expect(sha256(a.data)).toBe(sha256(b.data));
    expect(sha256(a.data)).not.toBe(sha256(c.data));
  });

  test("dual-grid tiles: 16 configs, fully deterministic", () => {
    const t1 = dualGridTiles(
      24,
      rampFromAnchor(150, 0.11, 5),
      rampFromAnchor(60, 0.07, 5),
    );
    const t2 = dualGridTiles(
      24,
      rampFromAnchor(150, 0.11, 5),
      rampFromAnchor(60, 0.07, 5),
    );
    expect(t1.length).toBe(16);
    expect(t1.map((t) => sha256(t.ras.data))).toEqual(
      t2.map((t) => sha256(t.ras.data)),
    );
  });
});

describe("committed atlas manifest (golden gate)", () => {
  const manifest = JSON.parse(
    readFileSync(
      join(import.meta.dir, "..", "public", "art", "atlas-manifest.json"),
      "utf8",
    ),
  ) as { digest: string; atlases: { sha256: string }[] };

  test("digest is a 64-hex SHA-256", () => {
    expect(manifest.digest).toMatch(/^[0-9a-f]{64}$/u);
  });

  test("digest matches the pinned golden constant (VH-11)", () => {
    expect(manifest.digest).toBe(EXPECTED_DIGEST);
  });
});
