/**
 * Pixel L-system plants (design docs/design/01). Bracketed turtle interpretation
 * (F / + / - / [ ]); per-archetype GRAMMAR + seeded knobs. N=6 discrete growth
 * stages map to FSRS stability at runtime; here we just bake the frames.
 *
 * Grammars rewrite only the apex X (never F). Rewriting F (F→FF) makes the
 * leading trunk-run grow as 2^(n-1) internodes → one long bare stalk before any
 * branch (the flaw the Phase-0 eyeball caught). Keeping F fixed bounds the
 * leading run, so plants branch early and read leafy.
 *
 * ART (Phase-8 lift, Stardew-cozy / solarpunk): the turtle no longer hairlines
 * 1px sticks topped with flat blobs. Instead it builds two passes —
 *   1. a WOODY pass: every internode is a TAPERED stroke whose width falls with
 *      branch depth (RadiusFactor; thick warm base → 1px twigs), so trunks read
 *      as trunks and branches as branches.
 *   2. a FOLIAGE pass: each apex deposits a LEAF-CLUSTER MASS — overlapping discs
 *      blocked out as one silhouette, then relit as ONE canopy form (cool
 *      shadowed lower-right, mid body, a warm lit top-left cap, a sun-kissed 1px
 *      rim, plus hand-placed leaf-notch texture). Clusters are sorted
 *      back-to-front so masses overlap believably.
 *
 * Phase-9 surgical pass: (1) the canopy used to be relit PER CLUMP — overlapping
 * clumps fought over shared pixels (one wrote "lit", the next "shadow"), leaving
 * scattered single-pixel speckle, and a wide Bayer band laid allover dither
 * noise. Now the canopy is lit from a SINGLE global light frame (one centroid,
 * one axis) so light/shadow read as coherent connected leaf-masses, with dither
 * confined to a thin 1-2px transition band straddling the one body↔shadow seam.
 * (2) each individual derives an EXTRA seeded variation (height, width, density,
 * crown count, wind-lean, outline roundness) on TOP of its grammar profile, so
 * two flora of the same grammar read as distinct individuals while keeping the
 * fern≠bush≠tree≠reed≠shrub identity and the believable 6-stage growth.
 *
 * Per-grammar SILHOUETTE biasing gives each archetype its own read: fern = a
 * narrow arching frond, bush = a round mound, tree = a broad canopy over a clear
 * trunk, reed = tall sparse blades, shrub = a low wide cushion. Blooms / berries
 * land as accent focal points on a deterministic few clumps. Everything is pure
 * + seeded through `r`; the caller adds the selout shell via `ras.outline(...)`.
 */

import type { Rng } from "../../src/shared/rng";
import { darken, type Ramp } from "./palette";
import { bayer, Raster, type RGB } from "./raster";

export type PlantGrammar = "bush" | "fern" | "tree" | "reed" | "shrub";

export interface PlantKnobs {
  grammar: PlantGrammar;
  branchAngle: number; // degrees
  iterations: number; // L-system depth (0..5)
  internode: number; // px per F
  leafR: number; // leaf disc radius
  bloom: boolean;
}

const RULES: Record<PlantGrammar, string> = {
  bush: "F[+X]F[-X]+[FX]-[FX]X",
  fern: "F[-X][+X]FX",
  tree: "FF[+X][-X][FX]",
  reed: "F[+X]F[-X]X",
  shrub: "F[+X][-X][+X][-X]X",
};

/** Map a species family (content layer) to a plant grammar for visual variety. */
export function familyToGrammar(family: string): PlantGrammar {
  switch (family) {
    case "fern":
      return "fern";
    case "tree":
      return "tree";
    case "reed":
      return "reed";
    case "shrub":
    case "moss":
      return "shrub";
    default:
      return "bush";
  }
}

function expand(iterations: number, rule: string): string {
  let s = "X";
  for (let i = 0; i < iterations; i++) {
    let next = "";
    for (const ch of s) next += ch === "X" ? rule : ch;
    s = next;
  }
  return s;
}

// ── colour helpers (pure, quantized) ──────────────────────────────────────
// We only receive a 5-step green Ramp, so the woody tones + extra foliage steps
// are derived in-ramp (lerp + darken). All outputs round to integer sRGB, so the
// committed bytes stay deterministic (audit VH-11).

const WHITE: RGB = [255, 255, 255];

function lerp(a: RGB, b: RGB, t: number): RGB {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ];
}

/** Warm the colour toward gold (push R/G up, B down) — keeps highlights sunny. */
function warm(c: RGB, f: number): RGB {
  return [
    Math.round(Math.min(255, c[0] + 26 * f)),
    Math.round(Math.min(255, c[1] + 16 * f)),
    Math.round(c[2] * (1 - 0.35 * f)),
  ];
}

interface Palette {
  barkDark: RGB; // shadow side of trunk / inner branches
  bark: RGB; // trunk body
  barkLit: RGB; // sun-struck trunk edge
  leafShadowDeep: RGB; // deepest cool shadow at the lower-right rim
  leafShadow: RGB; // cool shadowed underside of a clump
  leafBody: RGB; // clump body / mid
  leafLit: RGB; // warm lit cap (top-left)
  leafRim: RGB; // sun-kissed rim highlight
  notch: RGB; // dark leaf-separation texture
}

function buildPalette(ramp: Ramp): Palette {
  const s = ramp.steps;
  const shadow = s[0] ?? ramp.shadow;
  const lo = s[1] ?? ramp.shadow;
  const mid = s[2] ?? ramp.mid;
  const hi = s[3] ?? ramp.mid;
  const top = s[4] ?? ramp.light;
  // Bark = the cool deep end pushed warm/brown so wood reads distinct from leaf.
  const barkDark = darken(warm(shadow, 1.1), 0.18);
  const bark = warm(lerp(shadow, lo, 0.55), 0.95);
  const barkLit = warm(lerp(lo, mid, 0.5), 0.7);
  return {
    barkDark,
    bark,
    barkLit,
    // foliage ramp: deep-cool shadow → cool shadow → body → warm lit → sun rim.
    // body sits below the ramp midpoint so the lit hump has clear room to pop;
    // the two shadow steps share the cool end so depth reads as a single mass.
    leafShadowDeep: shadow,
    leafShadow: lerp(lo, mid, 0.3),
    leafBody: lerp(mid, hi, 0.45),
    leafLit: warm(lerp(hi, top, 0.8), 0.4),
    leafRim: warm(lerp(top, WHITE, 0.38), 0.45),
    notch: darken(lerp(shadow, lo, 0.35), 0.1),
  };
}

interface Turtle {
  x: number;
  y: number;
  ang: number; // radians, 0 = up
}

interface Clump {
  x: number;
  y: number;
  r: number;
}

// Per-grammar silhouette identity. width* shape the woody taper; spreadX/spreadY
// squash or stretch the whole structure; clumpScale tunes foliage mass; the
// posture comment is the read we're aiming for.
interface Profile {
  baseW: number; // trunk half-width at the very base (px)
  taper: number; // multiplicative width falloff per branch depth (0..1)
  spreadX: number; // horizontal scale around the centre line
  spreadY: number; // vertical scale (>1 = taller)
  clumpScale: number; // foliage radius multiplier
  liftLeaves: number; // bias clumps toward the apex tips only (0..1)
  droop: number; // per-F bend (rad) applied along branches → arching fronds
}

const PROFILES: Record<PlantGrammar, Profile> = {
  // a broad canopy floating over a clear, stout trunk
  tree: {
    baseW: 4,
    taper: 0.62,
    spreadX: 1.0,
    spreadY: 1.02,
    clumpScale: 1.18,
    liftLeaves: 0.3,
    droop: 0.04,
  },
  // a tight round mound, foliage everywhere, short woody core
  bush: {
    baseW: 3,
    taper: 0.55,
    spreadX: 1.12,
    spreadY: 0.92,
    clumpScale: 1.05,
    liftLeaves: 0.1,
    droop: 0.0,
  },
  // a narrow arching frond — tall, slim, leaves ride the whole stem
  fern: {
    baseW: 2,
    taper: 0.7,
    spreadX: 0.68,
    spreadY: 1.22,
    clumpScale: 0.78,
    liftLeaves: 0.05,
    droop: 0.34, // strong outward arch → the classic frond curl
  },
  // tall sparse blades; thin from base to tip, tufts only at the very ends
  reed: {
    baseW: 2,
    taper: 0.82,
    spreadX: 0.6,
    spreadY: 1.3,
    clumpScale: 0.72,
    liftLeaves: 0.75,
    droop: 0.16, // a gentle wind-lean at the blade tips
  },
  // a low, wide cushion hugging the ground
  shrub: {
    baseW: 3,
    taper: 0.5,
    spreadX: 1.28,
    spreadY: 0.78,
    clumpScale: 1.0,
    liftLeaves: 0.05,
    droop: 0.0,
  },
};

// Per-INDIVIDUAL variation, drawn once from `r`, applied ON TOP of the grammar
// Profile so two flora of the same grammar read as distinct plants while the
// grammar identity (and 6-stage growth) survives. Multipliers stay in tame
// bands — wide enough to tell individuals apart, narrow enough that a tree never
// stops reading as a tree.
interface Variant {
  hMul: number; // overall height multiplier (×spreadY)
  wMul: number; // overall width multiplier (×spreadX)
  densityMul: number; // foliage-keep + clump-radius multiplier
  lean: number; // global wind-lean (rad) baked into the rest angle
  crowns: number; // target separate canopy crowns (1 = single mound)
  round: number; // canopy outline roundness 0 = lopsided/tall, 1 = round
}

/**
 * Build an individual's variation envelope from the seeded Rng. Each grammar has
 * its own believable ranges (a reed leans more than a stout shrub; trees can go
 * multi-crown, ferns never do). Pure: consumes a fixed count of `r()` draws so
 * downstream jitter stays deterministic.
 */
function rollVariant(grammar: PlantGrammar, r: Rng): Variant {
  const u = (): number => r(); // [0,1)
  const sym = (): number => u() * 2 - 1; // [-1,1)
  // height/width swings — gentle, grammar-flavoured
  const tall = grammar === "reed" || grammar === "fern";
  const squat = grammar === "shrub" || grammar === "bush";
  const hMul = 1 + sym() * (tall ? 0.26 : 0.18) + (tall ? 0.04 : 0);
  const wMul = 1 + sym() * (squat ? 0.22 : 0.16);
  const densityMul = 0.82 + u() * 0.42; // 0.82..1.24 foliage fullness
  // wind-lean: reeds/ferns sway most, woody plants barely. Signed so some lean
  // left, some right.
  const leanMax =
    grammar === "reed"
      ? 0.22
      : grammar === "fern"
        ? 0.16
        : grammar === "tree"
          ? 0.1
          : 0.07;
  const lean = sym() * leanMax;
  // crown count: only the broad woody grammars ever split into multiple crowns.
  let crowns = 1;
  if (grammar === "tree") crowns = u() < 0.45 ? 2 : 1;
  else if (grammar === "bush") crowns = u() < 0.3 ? 2 : 1;
  else u(); // keep the draw count stable across grammars
  // roundness: low = taller/lopsided outline, high = round mound.
  const round = u();
  return { hMul, wMul, densityMul, lean, crowns, round };
}

/**
 * Draw a tapered woody stroke from (x0,y0)→(x1,y1). Width is the half-thickness
 * at the start, easing to ~1px at the end (twigs). We stamp discs along the
 * Bresenham-ish path; the colour gets a 1px lit edge on the up-left side so the
 * trunk catches light like the foliage.
 */
function woodStroke(
  ras: Raster,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  w0: number,
  pal: Palette,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.max(1, Math.round(Math.hypot(dx, dy)));
  // unit normal (perpendicular) — where the lit/shadow split lives
  const nx = len === 0 ? 0 : -dy / Math.hypot(dx, dy);
  for (let i = 0; i <= len; i++) {
    const t = i / len;
    const px = Math.round(x0 + dx * t);
    const py = Math.round(y0 + dy * t);
    const wf = Math.max(0, w0 * (1 - t) + 0.5 * t); // taper to a fine tip
    const w = Math.round(wf);
    if (w <= 0) {
      ras.set(px, py, pal.bark);
      continue;
    }
    ras.disc(px, py, w, pal.bark);
    // shadow core on the lower-right, lit sliver on the upper-left edge
    if (w >= 2) {
      ras.disc(
        px + Math.sign(nx < 0 ? 1 : -1),
        py + 1,
        Math.max(1, w - 1),
        pal.barkDark,
      );
      ras.disc(px - 1, py - 1, Math.max(1, w - 1), pal.bark);
      ras.set(Math.round(px - Math.abs(nx) - 1), py - 1, pal.barkLit);
    }
  }
}

// The foliage is built the way pixel artists block out a tree (SLYNYRD): first
// lay down all the clump BODIES as one connected mass, THEN light the whole
// canopy as a single form (big top-left lit region, bottom-right shadow, a
// sun-kissed rim) so the light direction reads at canopy scale instead of
// dissolving into per-clump noise; finally texture + accents go on top.

/** Stamp one clump's flat BODY mass (body disc + a sibling lobe for a leafy
 * edge). No shading yet — that's the canopy pass. Returns nothing; the body is
 * the silhouette we'll later relight. */
function stampClumpBody(
  ras: Raster,
  cx: number,
  cy: number,
  R: number,
  pal: Palette,
  rng: Rng,
): void {
  ras.disc(cx, cy, R, pal.leafBody);
  if (R >= 3) {
    // one offset lobe keeps the outline from being a perfect circle
    const a = rng() * Math.PI * 2;
    const d = R - 1;
    ras.disc(
      cx + Math.round(Math.cos(a) * d * 0.55),
      cy + Math.round(Math.sin(a) * d * 0.55),
      R - 1,
      pal.leafBody,
    );
  }
}

/** Axis-aligned bounding box of the whole clump set (in body-disc extent), used
 * to anchor the single global light frame. */
interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  cx: number; // light-frame centroid X (weighted toward the canopy mass)
  cy: number; // light-frame centroid Y
  radius: number; // representative canopy radius for normalising the gradient
}

function canopyBounds(clumps: readonly Clump[]): Bounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let sx = 0;
  let sy = 0;
  let sw = 0;
  for (const c of clumps) {
    minX = Math.min(minX, c.x - c.r);
    minY = Math.min(minY, c.y - c.r);
    maxX = Math.max(maxX, c.x + c.r);
    maxY = Math.max(maxY, c.y + c.r);
    // area-weighted centroid so big crowns pull the light frame toward them
    const wgt = c.r * c.r;
    sx += c.x * wgt;
    sy += c.y * wgt;
    sw += wgt;
  }
  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, cx: 0, cy: 0, radius: 1 };
  }
  const cx = sw > 0 ? sx / sw : (minX + maxX) / 2;
  const cy = sw > 0 ? sy / sw : (minY + maxY) / 2;
  const radius = Math.max(1, (maxX - minX + (maxY - minY)) / 4);
  return { minX, minY, maxX, maxY, cx, cy, radius };
}

/**
 * Relight the whole foliage region as ONE form. `isBody(x,y)` reports whether a
 * pixel is leaf body (so we never paint onto trunk/background). Light comes from
 * the upper-left.
 *
 * De-noise (Phase-9): shading is computed from a SINGLE global frame — one
 * canopy centroid + one light axis — so every body pixel is classified ONCE by
 * its position in the whole canopy, not re-fought over by each overlapping
 * clump. That turns the old scattered speckle into coherent connected light-side
 * and shadow-side regions. A thin 1-2px Bayer band is allowed ONLY where a pixel
 * sits right on the body↔shadow seam (a deliberate transition dither), never as
 * an allover field. The crisp 1px sun rim is drawn as a separate pass.
 */
function lightCanopy(
  ras: Raster,
  clumps: readonly Clump[],
  pal: Palette,
  isBody: (x: number, y: number) => boolean,
): void {
  if (clumps.length === 0) return;
  const b = canopyBounds(clumps);
  // light axis (unit) pointing AWAY from the upper-left sun, so the projection
  // grows positive on the shadow side (lower-right) and negative on the lit side
  // (upper-left). 1/√2 components → a 45° down-right diagonal.
  const lx = Math.SQRT1_2;
  const ly = Math.SQRT1_2;
  // Normalisers: the canopy half-extent along each screen axis, used so the
  // gradient spans the whole mass (not a per-clump radius). Slightly inflated so
  // the extreme rims still reach the deepest tones.
  const halfW = Math.max(2, (b.maxX - b.minX) / 2);
  const halfH = Math.max(2, (b.maxY - b.minY) / 2);
  const norm = Math.max(2, (halfW + halfH) / 2);

  // Pass 1 — block-classify every body pixel from the single frame. We compute a
  // signed light value `g` in roughly [-1,1]; thresholds carve CONNECTED bands.
  for (let py = b.minY - 1; py <= b.maxY + 1; py++) {
    for (let px = b.minX - 1; px <= b.maxX + 1; px++) {
      if (!isBody(px, py)) continue;
      const dx = px - b.cx;
      const dy = py - b.cy;
      // projection onto the light axis, normalised by the canopy extent →
      // coherent global gradient from lit (neg) to shadow (pos).
      const g = (dx * lx + dy * ly) / norm;
      // radial term: how close to the canopy rim this pixel sits (0 core → ~1).
      const radial = Math.hypot(dx / halfW, dy / halfH);
      if (g > 0.34) {
        // shadow side. Deepest tone only on the far lower-right rim so the dark
        // reads as a single connected crescent, not scattered dots.
        if (g > 0.6 && radial > 0.62) ras.set(px, py, pal.leafShadowDeep);
        else ras.set(px, py, pal.leafShadow);
      } else if (g < -0.3) {
        // lit hump on the upper-left — one connected warm region.
        ras.set(px, py, pal.leafLit);
      }
      // else: leave the mid body tone (already stamped) — the calm middle mass.
    }
  }

  // Pass 2 — a single, thin transition dither. Only pixels straddling the
  // body↔shadow seam (a narrow `g` window) checker between body and shadow, and
  // only on one Bayer phase, so it reads as a deliberate 1-2px gradient band
  // rather than allover noise. Same for the lit↔body seam on the other side.
  for (let py = b.minY - 1; py <= b.maxY + 1; py++) {
    for (let px = b.minX - 1; px <= b.maxX + 1; px++) {
      if (!isBody(px, py)) continue;
      const dx = px - b.cx;
      const dy = py - b.cy;
      const g = (dx * lx + dy * ly) / norm;
      // body→shadow seam: a thin band just BELOW the shadow threshold.
      if (g > 0.2 && g <= 0.34 && bayer(px, py) > 0.5) {
        ras.set(px, py, pal.leafShadow);
      }
      // lit→body seam: a thin band just ABOVE the lit threshold.
      else if (g >= -0.3 && g < -0.18 && bayer(px, py) < 0.5) {
        ras.set(px, py, pal.leafLit);
      }
    }
  }

  // Pass 3 — Sun rim: one continuous bright line on the canopy's TOP-LEFT
  // silhouette edge (a body pixel whose up + up-left neighbours are empty).
  // Reads as the sun grazing the crown — the single biggest "polish" cue. Drawn
  // last so it always sits on top of the relit bands.
  for (let py = b.minY - 1; py <= b.maxY + 1; py++) {
    for (let px = b.minX - 1; px <= b.maxX + 1; px++) {
      if (!isBody(px, py)) continue;
      const topEdge = !isBody(px, py - 1);
      const leftEdge = !isBody(px - 1, py);
      if ((topEdge || leftEdge) && !isBody(px - 1, py - 1)) {
        ras.set(px, py, pal.leafRim);
      }
    }
  }
}

/** Carve a clump out of the membrane so the canopy reads as overlapping masses.
 * We trace a short shadow crescent just inside the clump's lower-right rim (the
 * pocket where the next clump in front occludes it). Only paints where the
 * crescent is INTERIOR to the canopy, never on the outer silhouette (that would
 * muddy the clean selout edge). These are deliberate, sparse FOLDS between
 * clumps — coherent short arcs, not scattered pixels. */
function textureClump(
  ras: Raster,
  c: Clump,
  pal: Palette,
  isBody: (x: number, y: number) => boolean,
): void {
  const R = c.r;
  if (R < 3) return;
  // lower-right occlusion crescent — a short continuous arc one px inside the
  // rim. A connected stroke reads as a fold between leaf-masses, not noise.
  const a0 = 0.18 * Math.PI;
  const a1 = 0.72 * Math.PI;
  const steps = Math.max(4, R * 2);
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    const rr = R - 1;
    const nx = c.x + Math.round(Math.cos(a) * rr);
    const ny = c.y + Math.round(Math.sin(a) * rr);
    // interior only: the pixel one further out along the same ray must still be
    // canopy (so this is a fold between clumps, not the outer edge).
    const ox = c.x + Math.round(Math.cos(a) * (rr + 1.4));
    const oy = c.y + Math.round(Math.sin(a) * (rr + 1.4));
    if (isBody(nx, ny) && isBody(ox, oy)) ras.set(nx, ny, pal.leafShadow);
  }
}

/** A bloom / berry: an accent focal point seated on the lit upper-left of a clump
 * (where flowers face the sun), with its own shadow seat + centre glint. */
function drawBloom(
  ras: Raster,
  c: Clump,
  accent: RGB,
  accentShadow: RGB,
  rim: RGB,
): void {
  const bx = c.x - 1;
  const by = c.y - 1;
  const br = c.r >= 4 ? 2 : 1;
  ras.disc(bx, by + 1, br, accentShadow); // shadow seat
  ras.disc(bx, by, br, accent); // bloom body
  ras.set(bx - (br > 1 ? 1 : 0), by - (br > 1 ? 1 : 0), rim); // glint
}

/**
 * Draw a plant into a fresh `size`×`size` raster. The turtle walks the L-system
 * word once to lay down the WOODY skeleton (tapered strokes, width keyed to
 * branch depth) and to COLLECT apex positions; then leaf-cluster masses are
 * painted back-to-front over the wood. `r` seeds per-individual variation (a
 * distinct silhouette per seed) plus per-node jitter + foliage texture (bake
 * stream, not gameplay). The caller applies the selout outline.
 */
export function drawPlant(
  size: number,
  knobs: PlantKnobs,
  ramp: Ramp,
  accent: RGB,
  r: Rng,
): Raster {
  const ras = new Raster(size, size);
  const pal = buildPalette(ramp);
  const prof = PROFILES[knobs.grammar];
  // Per-individual variation, rolled FIRST so the draw order is stable. This is
  // what makes two same-grammar flora read as different plants.
  const v = rollVariant(knobs.grammar, r);
  const word = expand(knobs.iterations, RULES[knobs.grammar]);
  const stack: Turtle[] = [];
  const cx0 = size / 2;
  // a global wind-lean: the whole structure tilts from its rest angle, so some
  // individuals stand straight and others lean left/right.
  const t: Turtle = { x: cx0, y: size - 2, ang: v.lean };
  const baseAng = (knobs.branchAngle * Math.PI) / 180;
  // apply silhouette spread (grammar profile × this individual's variation) by
  // scaling step vectors away from the base.
  const stepX = knobs.internode * prof.spreadX * v.wMul;
  const stepY = knobs.internode * prof.spreadY * v.hMul;
  let depth = 0;
  const clumps: Clump[] = [];
  // pre-mix a darker accent so berries get a shadow seat
  const accentDark = darken(accent, 0.32);
  // how "deep" the apex must be before its clump counts as a true tip (for
  // grammars that only want foliage at the ends, e.g. reed)
  const maxDepthSeen = { v: 0 };
  // this individual's foliage-keep threshold — denser plants keep more clumps.
  const keepBias = prof.liftLeaves / Math.max(0.6, v.densityMul);

  for (const ch of word) {
    switch (ch) {
      case "F": {
        const jitter = (r() - 0.5) * 0.1;
        const a = t.ang + jitter;
        const nx = t.x + Math.sin(a) * stepX;
        const ny = t.y - Math.cos(a) * stepY;
        // taper: width falls with branch depth (RadiusFactor), thick base twigs tip
        const w = prof.baseW * prof.taper ** depth;
        woodStroke(
          ras,
          Math.round(t.x),
          Math.round(t.y),
          Math.round(nx),
          Math.round(ny),
          Math.max(0, w),
          pal,
        );
        t.x = nx;
        t.y = ny;
        // droop: branches (depth>0) bend further from vertical as they extend,
        // arching outward in the direction they already lean (fern frond curl).
        if (depth > 0 && prof.droop !== 0) {
          const lean = t.ang === 0 ? (r() < 0.5 ? -1 : 1) : Math.sign(t.ang);
          t.ang += lean * prof.droop;
        }
        break;
      }
      case "+":
        t.ang += baseAng * (0.85 + r() * 0.3);
        break;
      case "-":
        t.ang -= baseAng * (0.85 + r() * 0.3);
        break;
      case "[":
        stack.push({ ...t });
        depth++;
        if (depth > maxDepthSeen.v) maxDepthSeen.v = depth;
        break;
      case "]": {
        // collect a clump at this apex; radius keyed to leafR, grammar scale and
        // this individual's density/variety. liftLeaves suppresses inner-branch
        // foliage so reeds/ferns stay sparse and tip-weighted.
        const tipBias = depth / Math.max(1, maxDepthSeen.v);
        const keep = r() >= keepBias * (1 - tipBias);
        if (keep) {
          const jitterR = 0.85 + r() * 0.4;
          const cr = Math.max(
            1,
            knobs.leafR * prof.clumpScale * v.densityMul * jitterR,
          );
          clumps.push({
            x: Math.round(t.x),
            y: Math.round(t.y),
            r: Math.round(cr),
          });
        }
        const top = stack.pop();
        if (top) {
          t.x = top.x;
          t.y = top.y;
          t.ang = top.ang;
        }
        depth = Math.max(0, depth - 1);
        break;
      }
      default:
        break;
    }
  }
  // crown clump(s) at the leading apex so the trunk never ends in a bare twig.
  // Multi-crown individuals (some trees/bushes) get extra offset crowns so the
  // canopy outline reads as two joined masses instead of one disc.
  const crownR = Math.max(
    1,
    Math.round(knobs.leafR * prof.clumpScale * v.hMul),
  );
  clumps.push({ x: Math.round(t.x), y: Math.round(t.y), r: crownR });
  for (let k = 1; k < v.crowns; k++) {
    // shove a second crown sideways + a touch down so the silhouette goes lumpy.
    const side = k % 2 === 0 ? 1 : -1;
    const ox = Math.round(t.x + side * crownR * (0.9 + r() * 0.4));
    const oy = Math.round(t.y + crownR * (0.35 + r() * 0.3));
    clumps.push({ x: ox, y: oy, r: Math.max(1, Math.round(crownR * 0.85)) });
  }
  // Outline-roundness variety: a low `round` individual gets one tall extra
  // crown lifted above the mass (a peaked/lopsided outline); a high `round` one
  // gets a side lobe (a fuller, rounder mound). Only on grammars with real
  // canopy mass so reeds/ferns keep their slim read.
  if ((knobs.grammar === "tree" || knobs.grammar === "bush") && clumps.length) {
    if (v.round < 0.4) {
      clumps.push({
        x: Math.round(t.x - 1),
        y: Math.round(t.y - crownR * (0.6 + v.round)),
        r: Math.max(1, Math.round(crownR * 0.72)),
      });
    } else if (v.round > 0.7) {
      const side = r() < 0.5 ? -1 : 1;
      clumps.push({
        x: Math.round(t.x + side * crownR * 0.8),
        y: Math.round(t.y + crownR * 0.1),
        r: Math.max(1, Math.round(crownR * 0.8)),
      });
    }
  }

  // paint back-to-front: lower-on-screen (larger y) clumps are nearer/front, so
  // sort by y ascending → far/high masses first, near/low masses overlap on top.
  clumps.sort((a, b) => a.y - b.y);

  // PASS A — block out the whole foliage silhouette as flat body. Snapshot the
  // woody alpha first so the canopy mask can never bleed onto the trunk.
  const woodAlpha = new Uint8ClampedArray(ras.data);
  const wasWood = (x: number, y: number): boolean =>
    x >= 0 &&
    y >= 0 &&
    x < size &&
    y < size &&
    (woodAlpha[(y * size + x) * 4 + 3] ?? 0) > 0;
  for (const c of clumps) stampClumpBody(ras, c.x, c.y, c.r, pal, r);
  const isBody = (x: number, y: number): boolean =>
    ras.alphaAt(x, y) > 0 && !wasWood(x, y);

  // PASS B — light the canopy as ONE form (single global top-left key light),
  // then per-clump leaf-notch FOLDS so it reads as overlapping leaves, not
  // jelly. Both passes are coherent/connected — no per-pixel scatter.
  lightCanopy(ras, clumps, pal, isBody);
  for (const c of clumps) textureClump(ras, c, pal, isBody);

  // PASS C — blooms: a deterministic, spaced-out few clumps become focal accents
  // when the plant is flowering. Front (lower) clumps are preferred so blooms
  // sit where the eye lands. Cap the count so they read as focal, not confetti.
  if (knobs.bloom && clumps.length > 0) {
    const want = Math.min(5, Math.max(1, Math.round(clumps.length / 5)));
    const stepN = Math.max(1, Math.floor(clumps.length / want));
    for (let i = 0; i < clumps.length; i += stepN) {
      const c = clumps[i];
      if (c) drawBloom(ras, c, accent, accentDark, pal.leafRim);
    }
  }
  return ras;
}

/** Knobs for growth stage 0..5 (dormant → flowering). */
export function stageKnobs(stage: number, base: PlantKnobs): PlantKnobs {
  const s = Math.max(0, Math.min(5, stage));
  return {
    grammar: base.grammar,
    branchAngle: base.branchAngle,
    iterations: Math.max(1, Math.round((base.iterations * s) / 5)),
    internode: Math.max(2, Math.round((base.internode * (s + 2)) / 7)),
    leafR: s < 2 ? 1 : base.leafR,
    bloom: s >= 5 && base.bloom,
  };
}
