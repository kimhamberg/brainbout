/**
 * Deterministic word → species binding (design docs/design/04, 06).
 *
 * `speciesFor(deckId, entry)` is a PURE function: seed = hashString(deckId:entryId),
 * fed to a LOCAL mulberry32 (never the global gameplay rng — keeps cosmetics
 * partitioned per guardrail 6 and makes the species byte-identical on every
 * device). pos selects a 4-kingdom taxonomy; sub-draws pick family / body-plan
 * template / palette. The render layer maps Species → baked atlas frames; per-entry
 * colour is applied at runtime as sprite.tint / a cached RenderTexture, never a
 * live per-sprite filter (audit VH-3).
 */

import { hashString, mulberry32 } from "../shared/rng";
import { TEMPLATES_PER_KINGDOM } from "../world/limits";
import type { DeckEntry, DeckManifest } from "./deck";

export type Kingdom = "FLORA" | "FAUNA" | "MODIFIER" | "STRUCTURE";

export interface Species {
  kingdom: Kingdom;
  family: string;
  /** Index into the kingdom's baked body-plan template library. */
  templateIdx: number;
  /** OKLCH hue degrees (within the kingdom's solarpunk band). */
  baseHue: number;
  /** OKLCH chroma (0..~0.2). */
  baseChroma: number;
  /** Accent hue degrees. */
  accentHue: number;
  /** Stable per-entry seed (for downstream cosmetic streams). */
  seed: number;
}

export const KINGDOM_FOR_POS: Record<string, Kingdom> = {
  noun: "FLORA",
  verb: "FAUNA",
  adj: "MODIFIER",
  adv: "MODIFIER",
};

export function kingdomForPos(pos: string): Kingdom {
  return KINGDOM_FOR_POS[pos] ?? "STRUCTURE";
}

export const FAMILIES: Record<Kingdom, readonly string[]> = {
  FLORA: ["fern", "bloom", "vine", "shrub", "reed", "moss", "tree", "bulb"],
  FAUNA: ["hopper", "flutter", "crawler", "drifter", "burrower", "wader"],
  MODIFIER: ["lichen", "cap", "blossom", "frost"],
  STRUCTURE: ["pillar", "arch", "lantern", "marker"],
};

/** Per-kingdom solarpunk OKLCH hue band [minDeg, maxDeg]. */
const HUE_BAND: Record<Kingdom, [number, number]> = {
  FLORA: [125, 148], // warm foliage green (leans yellow-green / sun-touched)
  FAUNA: [70, 95], // warm gold/brass
  MODIFIER: [285, 320], // soft lavender/magenta accent
  STRUCTURE: [190, 210], // teal / solar-glass
};

/**
 * Clustering key for FLORA semantic neighborhoods. Opt-in per deck (Q5): only
 * when the deck declares clusterBy === "gloss-keyword" AND glossLang === "en".
 * Degrades gracefully to entryId hashing for any other deck or an empty keyword.
 */
const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "to",
  "of",
  "and",
  "or",
  "in",
  "on",
  "for",
]);

export function firstContentKeyword(gloss: string): string | null {
  for (const tok of gloss.toLowerCase().split(/[^a-z]+/)) {
    if (tok.length > 0 && !STOP_WORDS.has(tok)) return tok;
  }
  return null;
}

export function clusterKey(entry: DeckEntry, manifest: DeckManifest): string {
  if (manifest.clusterBy === "gloss-keyword" && manifest.glossLang === "en") {
    const kw = firstContentKeyword(entry.gloss);
    if (kw !== null) return kw;
  }
  return entry.entryId;
}

export function speciesFor(
  deckId: string,
  entry: DeckEntry,
  manifest?: DeckManifest,
): Species {
  const seed = hashString(`${deckId}:${entry.entryId}`);
  const r = mulberry32(seed); // LOCAL stream — never the global rng
  const kingdom = kingdomForPos(entry.pos);

  // Family: gloss-keyword clustering when enabled, else per-entry variety.
  const famPool = FAMILIES[kingdom];
  const famSeed =
    manifest !== undefined ? hashString(clusterKey(entry, manifest)) : seed;
  const family = famPool[famSeed % famPool.length] as string;

  const bodyPlanHash = hashString(`${deckId}:${entry.entryId}:body`);
  const templateIdx = bodyPlanHash % TEMPLATES_PER_KINGDOM[kingdom];

  const [hMin, hMax] = HUE_BAND[kingdom];
  const baseHue = hMin + r() * (hMax - hMin);
  const baseChroma = 0.09 + r() * 0.06;
  const accentHue = (baseHue + 40 + r() * 60) % 360;

  return { kingdom, family, templateIdx, baseHue, baseChroma, accentHue, seed };
}
