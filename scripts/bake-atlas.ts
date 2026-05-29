/**
 * Phase-0 art bakery (design docs/design/01, 05). Deterministically generates a
 * cozy-pixel atlas from the content layer — proving "100% procedural pixel can
 * look Stardew-charming" + the byte-deterministic bake pipeline. Mirrors
 * scripts/gen-icons.ts (headless Bun + sharp). Run: `bun scripts/bake-atlas.ts`.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { normalizeVocabDeck, type RawEntry } from "../src/content/deck";
import { type Species, speciesFor } from "../src/content/species";
import { seededRng } from "../src/shared/rng";
import {
  BENCH_ROLES,
  benchSpecimen,
  specimenHue,
} from "./bake/bench-specimens";
import { cap, critter, marker } from "./bake/creature";
import {
  drawPlant,
  familyToGrammar,
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

// ~40-entry slice spanning all four kingdoms (noun→FLORA, verb→FAUNA,
// adj/adv→MODIFIER, function-words→STRUCTURE), incl. æøå.
const RAW: RawEntry[] = [
  { word: "fugl", pos: "noun", definition: "a bird", example: "" },
  { word: "ørn", pos: "noun", definition: "an eagle", example: "" },
  { word: "skog", pos: "noun", definition: "a forest", example: "" },
  { word: "blomst", pos: "noun", definition: "a flower", example: "" },
  { word: "tre", pos: "noun", definition: "a tree", example: "" },
  { word: "fjell", pos: "noun", definition: "a mountain", example: "" },
  { word: "sjø", pos: "noun", definition: "a sea / lake", example: "" },
  { word: "blad", pos: "noun", definition: "a leaf", example: "" },
  { word: "rot", pos: "noun", definition: "a root", example: "" },
  { word: "frø", pos: "noun", definition: "a seed", example: "" },
  { word: "eng", pos: "noun", definition: "a meadow", example: "" },
  { word: "elv", pos: "noun", definition: "a river", example: "" },
  { word: "gress", pos: "noun", definition: "grass", example: "" },
  { word: "busk", pos: "noun", definition: "a bush", example: "" },
  { word: "mose", pos: "noun", definition: "moss", example: "" },
  { word: "stein", pos: "noun", definition: "a stone", example: "" },
  { word: "måne", pos: "noun", definition: "the moon", example: "" },
  { word: "sol", pos: "noun", definition: "the sun", example: "" },
  { word: "stjerne", pos: "noun", definition: "a star", example: "" },
  { word: "hage", pos: "noun", definition: "a garden", example: "" },
  { word: "bær", pos: "noun", definition: "a berry", example: "" },
  { word: "sopp", pos: "noun", definition: "a mushroom", example: "" },
  { word: "kratt", pos: "noun", definition: "a thicket", example: "" },
  { word: "lys", pos: "noun", definition: "light", example: "" },
  { word: "katt", pos: "verb", definition: "to prowl", example: "" },
  { word: "løpe", pos: "verb", definition: "to run", example: "" },
  { word: "fly", pos: "verb", definition: "to fly", example: "" },
  { word: "svømme", pos: "verb", definition: "to swim", example: "" },
  { word: "grave", pos: "verb", definition: "to dig", example: "" },
  { word: "hoppe", pos: "verb", definition: "to hop", example: "" },
  { word: "krype", pos: "verb", definition: "to crawl", example: "" },
  { word: "vandre", pos: "verb", definition: "to wander", example: "" },
  { word: "rød", pos: "adj", definition: "red", example: "" },
  { word: "grønn", pos: "adj", definition: "green", example: "" },
  { word: "blå", pos: "adj", definition: "blue", example: "" },
  { word: "gul", pos: "adj", definition: "yellow", example: "" },
  { word: "sakte", pos: "adv", definition: "slowly", example: "" },
  { word: "og", pos: "conj", definition: "and", example: "" },
  { word: "på", pos: "prep", definition: "on", example: "" },
  { word: "til", pos: "prep", definition: "to", example: "" },
];

function spriteFor(entryId: string, sp: Species, dormant = false): Raster {
  const r = seededRng(`${BUILD_SEED}:sprite:${entryId}`);
  // FLORA reads lusher with a chroma floor; dormant uses the cool-teal LUT (R6).
  const chroma =
    sp.kingdom === "FLORA" ? Math.max(sp.baseChroma, 0.15) : sp.baseChroma;
  const ramp = dormant
    ? dormantRamp(chroma)
    : rampFromAnchor(sp.baseHue, chroma, 5);
  const accent = oklch(0.72, 0.14, sp.accentHue);
  let ras: Raster;
  if (sp.kingdom === "FLORA") {
    // dormant FLORA = a furled, closed posture (low iterations) — not just recoloured.
    const knobs: PlantKnobs = dormant
      ? {
          grammar: familyToGrammar(sp.family),
          branchAngle: 12,
          iterations: 2,
          internode: 3,
          leafR: 2,
          bloom: false,
        }
      : {
          grammar: familyToGrammar(sp.family),
          branchAngle: 22 + Math.floor(r() * 12),
          iterations: 4,
          internode: 3,
          leafR: 3,
          bloom: r() > 0.45,
        };
    ras = drawPlant(CELL, knobs, ramp, accent, r);
  } else if (sp.kingdom === "FAUNA") {
    ras = critter(CELL, ramp, accent, r, dormant); // dormant → tucked + closed eyes
  } else if (sp.kingdom === "MODIFIER") {
    ras = cap(CELL, ramp, accent, r);
  } else {
    ras = marker(CELL, ramp, accent);
  }
  ras.outline(darken(ramp.shadow, 0.45));
  // Zzz drawn AFTER outline so the glyphs stay clean + pale (R6 asleep cue).
  if (dormant) ras.zzz(28, 16, oklch(0.86, 0.04, 250));
  return ras;
}

async function main(): Promise<void> {
  const deck = normalizeVocabDeck(RAW, "no");
  const items: { name: string; ras: Raster }[] = [];

  // species sprites
  let floraDormant = 0;
  let faunaDormant = 0;
  for (const entry of deck.entries) {
    const sp = speciesFor("no", entry, deck.manifest);
    items.push({
      name: `sp:${entry.entryId}`,
      ras: spriteFor(entry.entryId, sp),
    });
    // dormant/awake comparison for a few species (R6: posture + Zzz, not just colour)
    let wantDormant = false;
    if (sp.kingdom === "FLORA" && floraDormant < 4) {
      floraDormant++;
      wantDormant = true;
    } else if (sp.kingdom === "FAUNA" && faunaDormant < 2) {
      faunaDormant++;
      wantDormant = true;
    }
    if (wantDormant) {
      items.push({
        name: `sp:${entry.entryId}:dormant`,
        ras: spriteFor(entry.entryId, sp, true),
      });
    }
  }

  // growth-stage demo: one FLORA archetype across 6 stages (0 = dormant/teal)
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
    const ramp = stage === 0 ? dormantRamp(0.12) : rampFromAnchor(150, 0.12, 5);
    const accent = oklch(0.74, 0.15, 60);
    const ras = drawPlant(CELL, stageKnobs(stage, baseKnobs), ramp, accent, sr);
    ras.outline(darken(ramp.shadow, 0.45));
    items.push({ name: `plant:grove-tree:${String(stage)}`, ras });
  }

  // tiles + reclamation
  const grass = rampFromAnchor(150, 0.11, 5);
  const soil = rampFromAnchor(60, 0.07, 5);
  const tech = rampFromAnchor(205, 0.06, 5);
  const vine = rampFromAnchor(150, 0.13, 5);
  for (const t of dualGridTiles(TILE, grass, soil)) items.push(t);
  for (const t of reclamationTiles(TILE, tech, vine)) items.push(t);

  // Propagation-Bench CHIRAL specimens (Crown rotation stimuli) — asymmetric,
  // never mirrored, so mirrorV/mirrorH stay detectable (VH-7/VH-12).
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
