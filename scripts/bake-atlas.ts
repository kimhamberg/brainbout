/**
 * Art bakery (design docs/design/01, 05; Q2 template refactor / audit VH-3).
 *
 * Bakes a BOUNDED library of body-plan TEMPLATES per kingdom (not per dictionary
 * entry), at each kingdom's canonical hue. Per-species identity is a runtime
 * hue-rotation of the right template (src/scene/recolor.ts), so the atlas size is
 * fixed regardless of deck size (~20k words → still 60 templates). Deterministic
 * (golden-hash gated). Mirrors gen-icons.ts. Run: `bun run gen:art`.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { seededRng } from "../src/shared/rng";
import { TEMPLATES_PER_KINGDOM } from "../src/world/limits";
import {
  BENCH_ROLES,
  benchSpecimen,
  specimenHue,
} from "./bake/bench-specimens";
import { cap, critter, marker } from "./bake/creature";
import {
  drawPlant,
  type PlantGrammar,
  type PlantKnobs,
  stageKnobs,
} from "./bake/lsystem";
import { buildManifest } from "./bake/manifest";
import { pack } from "./bake/pack";
import { darken, dormantRamp, oklch, rampFromAnchor } from "./bake/palette";
import type { Raster } from "./bake/raster";
import { dualGridTiles, reclamationTiles } from "./bake/tiles";

const BUILD_SEED = process.env.BUILD_SEED ?? "verdant-hollow-v1";
const CELL = 48;
const TILE = 24;

// Each kingdom bakes N templates at its CANONICAL hue (must match the band
// midpoints in src/content/species.ts CANON_HUE — runtime hue-rotates from here).
const KINGDOMS = [
  { key: "flora", n: TEMPLATES_PER_KINGDOM.FLORA, hue: 136.5, chroma: 0.14 },
  { key: "fauna", n: TEMPLATES_PER_KINGDOM.FAUNA, hue: 82.5, chroma: 0.13 },
  {
    key: "modifier",
    n: TEMPLATES_PER_KINGDOM.MODIFIER,
    hue: 302.5,
    chroma: 0.12,
  },
  {
    key: "structure",
    n: TEMPLATES_PER_KINGDOM.STRUCTURE,
    hue: 200,
    chroma: 0.09,
  },
] as const;

const GRAMMARS: PlantGrammar[] = ["bush", "fern", "tree", "reed", "shrub"];

function templateSprite(
  key: string,
  idx: number,
  hue: number,
  chroma: number,
): Raster {
  const r = seededRng(`${BUILD_SEED}:tmpl:${key}:${String(idx)}`);
  const ramp = rampFromAnchor(hue, chroma, 5);
  const accent = oklch(0.74, 0.15, (hue + 45) % 360);
  let ras: Raster;
  if (key === "flora") {
    const knobs: PlantKnobs = {
      grammar: GRAMMARS[idx % GRAMMARS.length] ?? "bush",
      branchAngle: 20 + Math.floor(r() * 16),
      iterations: 4,
      internode: 3,
      leafR: 3,
      bloom: r() > 0.4,
    };
    ras = drawPlant(CELL, knobs, ramp, accent, r);
  } else if (key === "fauna") {
    ras = critter(CELL, ramp, accent, r);
  } else if (key === "modifier") {
    ras = cap(CELL, ramp, accent, r);
  } else {
    // STRUCTURE marker takes no Rng — vary the lantern glow per idx so the
    // 8 templates aren't identical.
    ras = marker(CELL, ramp, oklch(0.78, 0.16, (hue + idx * 16) % 360));
  }
  ras.outline(darken(ramp.shadow, 0.45));
  return ras;
}

async function main(): Promise<void> {
  const items: { name: string; ras: Raster }[] = [];

  // ── bounded body-plan template library (the Q2 core) ──
  for (const k of KINGDOMS) {
    for (let idx = 0; idx < k.n; idx++) {
      items.push({
        name: `tmpl:${k.key}:${String(idx)}`,
        ras: templateSprite(k.key, idx, k.hue, k.chroma),
      });
    }
  }

  // ── growth-stage showcase: one FLORA archetype across 6 stages (0 = dormant) ──
  const baseKnobs: PlantKnobs = {
    grammar: "tree",
    branchAngle: 26,
    iterations: 4,
    internode: 4,
    leafR: 3,
    bloom: true,
  };
  for (let stage = 0; stage <= 5; stage++) {
    const sr = seededRng(`${BUILD_SEED}:growth:${String(stage)}`);
    const ramp =
      stage === 0 ? dormantRamp(0.12) : rampFromAnchor(136.5, 0.14, 5);
    const accent = oklch(0.74, 0.15, 60);
    const ras = drawPlant(CELL, stageKnobs(stage, baseKnobs), ramp, accent, sr);
    ras.outline(darken(ramp.shadow, 0.45));
    items.push({ name: `plant:grove-tree:${String(stage)}`, ras });
  }

  // ── tiles + reclamation ──
  const grass = rampFromAnchor(150, 0.11, 5);
  const soil = rampFromAnchor(60, 0.07, 5);
  const tech = rampFromAnchor(205, 0.06, 5);
  const vine = rampFromAnchor(150, 0.13, 5);
  for (const t of dualGridTiles(TILE, grass, soil)) items.push(t);
  for (const t of reclamationTiles(TILE, tech, vine)) items.push(t);

  // ── Propagation-Bench CHIRAL specimens (Crown rotation stimuli) ──
  for (const role of BENCH_ROLES) {
    const hue = specimenHue(role);
    const ramp = rampFromAnchor(hue, 0.14, 5);
    const accent = oklch(0.74, 0.15, (hue + 50) % 360);
    items.push({
      name: `bench:${role}`,
      ras: benchSpecimen(
        role,
        CELL,
        ramp,
        accent,
        seededRng(`${BUILD_SEED}:bench:${role}`),
      ),
    });
  }

  const { atlas, frames } = pack(items, 512);

  const outDir = join(import.meta.dirname ?? ".", "..", "public", "art");
  mkdirSync(outDir, { recursive: true });

  const png = await sharp(Buffer.from(atlas.data.buffer), {
    raw: { width: atlas.w, height: atlas.h, channels: 4 },
  })
    .png()
    .toBuffer();
  writeFileSync(join(outDir, "atlas.png"), png);
  writeFileSync(
    join(outDir, "atlas.frames.json"),
    JSON.stringify({ size: { w: atlas.w, h: atlas.h }, frames }, null, 0),
  );
  const manifest = buildManifest(BUILD_SEED, [
    { file: "atlas.png", png, frames: Object.keys(frames).length },
  ]);
  writeFileSync(
    join(outDir, "atlas-manifest.json"),
    JSON.stringify(manifest, null, 2),
  );

  // 6× nearest preview on Catppuccin Frappe bg, for the cozy-charm eyeball
  await sharp(Buffer.from(atlas.data.buffer), {
    raw: { width: atlas.w, height: atlas.h, channels: 4 },
  })
    .resize(atlas.w * 6, atlas.h * 6, { kernel: "nearest" })
    .flatten({ background: "#303446" })
    .png()
    .toFile(join(outDir, "atlas-preview.png"));

  process.stdout.write(
    `baked ${String(Object.keys(frames).length)} frames → ${atlas.w}×${atlas.h} | digest ${manifest.digest.slice(0, 12)}\n`,
  );
}

await main();
