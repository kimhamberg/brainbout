/**
 * OKLCH solarpunk palette engine (design docs/design/01). Exact Ottosson
 * sRGB↔OKLab matrices as constants (no dependency). Colour math is QUANTIZED to
 * integer sRGB before raster (audit VH-11) so sub-ULP transcendental drift can't
 * reach the committed 8-bit pixel.
 *
 * Production pixel-art craft (committed PNGs viewed at NEAREST-NEIGHBOUR upscale,
 * so this is TRUE pixel art — crispness comes from limited, hue-shifted ramps, not
 * blur): every material ramp hue-shifts COOL/teal into the shadows and WARM/gold
 * into the highlights, keeps CHROMA richest in the mid-tones (lush, never pale),
 * and spaces VALUE perceptually via OKLCH's near-linear L. References:
 *   - Pedro Medeiros, "Basic Color Theory" (Pixel Grimoire) — hue shifting +
 *     midtone saturation; shadows cooler/desaturated, lights warmer/saturated.
 *   - Pixel Parmesan, "Color Theory for Pixel Artists: It's All Relative".
 *   - maciaz, PalGen (OKLCH palette ramp generator) — perceptually even L stops.
 */

import type { RGB } from "./raster";

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

/** OKLCH (L 0..1, C 0..~0.4, H degrees) → quantized sRGB [0..255]. */
export function oklch(L: number, C: number, Hdeg: number): RGB {
  const h = (Hdeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = L + 0.396_337_777_4 * a + 0.215_803_757_3 * b;
  const m_ = L - 0.105_561_345_8 * a - 0.063_854_172_8 * b;
  const s_ = L - 0.089_484_177_5 * a - 1.291_485_548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const r = 4.076_741_662_1 * l - 3.307_711_591_3 * m + 0.230_969_929_2 * s;
  const g = -1.268_438_004_6 * l + 2.609_757_401_1 * m - 0.341_319_396_5 * s;
  const bb = -0.004_196_086_3 * l - 0.703_418_614_7 * m + 1.707_614_701 * s;

  const q = (v: number): number =>
    Math.max(0, Math.min(255, Math.round(linearToSrgb(v) * 255)));
  return [q(r), q(g), q(bb)];
}

export interface Ramp {
  /** index 0 = deepest shadow, last = brightest highlight. */
  steps: RGB[];
  shadow: RGB;
  mid: RGB;
  light: RGB;
}

// ── Value spacing ──────────────────────────────────────────────────────────
// OKLCH L is near-perceptually-linear, so even L stops already look even. We
// keep the deepest shadow off the floor (legibility under the dark selout
// outline) and the brightest highlight below 1.0 so it stays COLOURED, not a
// washed-out white. The light end is pulled a touch higher than the old 0.82 so
// sun-kissed top edges actually pop.
const L_SHADOW = 0.34;
const L_LIGHT = 0.86;

// ── Hue shifting ─────────────────────────────────────────────────────────────
// Shadows rotate toward the COOL/teal side, highlights toward the WARM/gold side.
// Asymmetric on purpose: the eye reads a warm sun-kiss more strongly than a cool
// shadow, so the warm end gets the bigger swing (Pixel Grimoire / Pixel Parmesan).
const HUE_SHIFT_COOL = 20; // degrees rotated into the shadow end
const HUE_SHIFT_WARM = 34; // degrees rotated into the highlight end
// Target hue families the shift bends TOWARD (not absolute) so any anchor reads
// cohesive: teal-blue shadows, gold-yellow highlights.
const HUE_COOL_TARGET = 230; // teal/blue
const HUE_WARM_TARGET = 75; // gold/amber

function ease(t: number): number {
  // smoothstep — softens the very ends so the ramp doesn't band harshly.
  return t * t * (3 - 2 * t);
}

/**
 * Chroma envelope across the ramp. Peaks just PAST the midpoint (mid-tones carry
 * the most saturation potential — the core shadow is least saturated, the
 * highlight eases off to avoid neon). Skewed so the lush, colour-dense zone sits
 * where the eye spends most time reading the form.
 */
function chromaEnvelope(t: number): number {
  const peak = 0.58; // saturation crest sits just warm-of-centre
  const d = t - peak;
  // asymmetric gaussian-ish lobe: tighter falloff toward the bright highlight.
  const spread = d >= 0 ? 0.42 : 0.5;
  const lobe = Math.exp(-(d * d) / (2 * spread * spread));
  // floor keeps shadows/highlights from going chromaless-grey (lush, not pale).
  return 0.62 + 0.38 * lobe;
}

/** Shortest signed rotation steering `from` toward `target` (degrees). */
function towards(from: number, target: number, amount: number): number {
  let diff = ((target - from + 540) % 360) - 180;
  // cap the steer so anchors keep their identity (a red ramp stays red-ish).
  diff = Math.max(-1, Math.min(1, diff / 90));
  return from + diff * amount;
}

/**
 * Build a cohesive, hue-shifted value ramp from an anchor hue+chroma.
 * `steps` may be 5..7 for a finer ramp; output is always >= 5 long so the
 * sprite modules' fixed indices (steps[1..4]) stay valid.
 */
export function rampFromAnchor(
  baseHue: number,
  baseChroma: number,
  steps = 5,
): Ramp {
  const n = Math.max(5, Math.min(7, Math.round(steps)));
  const out: RGB[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const e = ease(t);
    const L = L_SHADOW + (L_LIGHT - L_SHADOW) * e;
    const C = baseChroma * chromaEnvelope(t);
    // bend cool below the midpoint, warm above it.
    const H =
      t < 0.5
        ? towards(baseHue, HUE_COOL_TARGET, HUE_SHIFT_COOL * (1 - t * 2))
        : towards(baseHue, HUE_WARM_TARGET, HUE_SHIFT_WARM * (t * 2 - 1));
    out.push(oklch(L, C, H));
  }
  return {
    steps: out,
    shadow: out[0] as RGB,
    mid: out[Math.floor(n / 2)] as RGB,
    light: out[n - 1] as RGB,
  };
}

export function darken(c: RGB, f: number): RGB {
  return [
    Math.round(c[0] * (1 - f)),
    Math.round(c[1] * (1 - f)),
    Math.round(c[2] * (1 - f)),
  ];
}

/**
 * "Moonlit / asleep" variant (audit R6). Reads as cool, hushed twilight —
 * desaturated but NOT grey-dead. Built on its own L window (lifted off the floor
 * so the silhouette stays legible at night) with a small lavender→teal hue drift
 * and a chroma FLOOR, so the sprite still glows faintly blue rather than reading
 * as flat dead grey. `baseChroma` scales the residual coolness.
 */
export function dormantRamp(baseChroma: number): Ramp {
  // night L window: narrower + lifted vs daytime, so dark sprites stay readable.
  const lShadow = 0.4;
  const lLight = 0.78;
  // keep a real (if low) chroma — lavender shadows, cooler teal highlights, the
  // inverse-ish of the daytime warm-light shift to sell "lit by the moon".
  const chroma = Math.max(0.045, baseChroma * 0.5);
  const n = 5;
  const out: RGB[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const e = ease(t);
    const L = lShadow + (lLight - lShadow) * e;
    // mids keep the most colour here too; ends ease toward neutral moonlight.
    const C = chroma * (0.7 + 0.3 * Math.sin(Math.PI * t));
    // 258° lavender in shade → 215° cool teal in the moon-lit highlight.
    const H = 258 - 43 * e;
    out.push(oklch(L, C, H));
  }
  return {
    steps: out,
    shadow: out[0] as RGB,
    mid: out[2] as RGB,
    light: out[n - 1] as RGB,
  };
}

// ── Additive solarpunk extras (no existing signature touched) ────────────────
// Curated anchor set + small helpers the sprite modules MAY adopt for a cohesive,
// Stardew-cozy-meets-solarpunk launch palette. All pure, deterministic.

/**
 * Curated solarpunk anchor hues (OKLCH H degrees) — warm/yellow-leaning greens,
 * gold sun, teal water/tech, lavender + terracotta accents. Pass any of these to
 * `rampFromAnchor` for an on-brand material.
 */
export const SOLARPUNK_HUES = {
  /** lush warm leaf green (yellow-green, never cold) */
  foliage: 145,
  /** young sunlit shoot — pushed further toward yellow */
  shoot: 122,
  /** deep canopy / moss */
  moss: 158,
  /** sun, ripe wheat, gold rim light */
  sun: 80,
  /** warm clay / terracotta structure */
  terracotta: 45,
  /** weathered timber / soil */
  timber: 60,
  /** clean teal water + solar glass */
  water: 205,
  /** copper-teal reclaimed tech */
  patina: 188,
  /** lavender / wisteria accent */
  lavender: 295,
  /** soft coral bloom accent */
  bloom: 18,
} as const;

/**
 * On-palette accent colour for a given anchor hue — bright, warm-shifted bloom
 * (flowers, fruit, glints) that complements a material ramp without clashing.
 */
export function accentFor(baseHue: number): RGB {
  // rotate ~50° toward warmth and lift L+C for a focal pop.
  const H = towards(baseHue, HUE_WARM_TARGET, 50);
  return oklch(0.76, 0.15, H);
}

/**
 * Warm rim / sun-kiss colour for a material — a bright, gold-shifted edge tone
 * for the sun-touched top edge of a silhouette. Brighter + warmer than the ramp
 * light end so it reads as a deliberate focal highlight.
 */
export function rimLight(ramp: Ramp): RGB {
  // sample from the light end, then push warm + bright in OKLCH-ish RGB space.
  const [r, g, b] = ramp.light;
  return [
    Math.min(255, Math.round(r + (255 - r) * 0.45 + 14)),
    Math.min(255, Math.round(g + (255 - g) * 0.4 + 10)),
    Math.min(255, Math.round(b + (255 - b) * 0.18)),
  ];
}

/**
 * Two adjacent ramp tones for HAND/ordered dithering at a tone transition.
 * Returns the [darker, lighter] pair straddling normalized position `t` (0..1)
 * so a `bayer()` test can checker between them at a soft edge — crisp, no blur.
 */
export function ditherPair(ramp: Ramp, t: number): readonly [RGB, RGB] {
  const n = ramp.steps.length;
  const pos = Math.max(0, Math.min(1, t)) * (n - 1);
  const lo = Math.min(n - 1, Math.floor(pos));
  const hi = Math.min(n - 1, lo + 1);
  return [ramp.steps[lo] as RGB, ramp.steps[hi] as RGB];
}

/**
 * Selout outline colour for a ramp — darker than the shadow but tinted COOL
 * (teal) rather than dead black, so the outline sits in the world instead of
 * stamping a hard pure-black border. Pair with selective omission on lit edges.
 */
export function seloutInk(ramp: Ramp): RGB {
  const d = darken(ramp.shadow, 0.42);
  // nudge the ink cool/blue so it reads as soft shadow, not ink-black.
  return [d[0], d[1], Math.min(255, d[2] + 8)];
}
