/**
 * Propagation-Bench specimens (design docs/design/01, audit VH-7/VH-12).
 *
 * These are the CROWN (mental-rotation) stimuli, so they carry a HARD constraint
 * the cozy garden generators do not: each specimen must be genuinely CHIRAL and
 * ASYMMETRIC, so that a mirrorV / mirrorH transform is visually unmistakable —
 * that detectability is the whole reason Crown rotation works. They are NEVER
 * vertically mirrored. Every specimen grows with a single, consistent rightward
 * handedness: a one-way coiling crozier / shepherd's-crook / hook silhouette and
 * foliage that only ever fans to the curl side. Flip one and the coil winds the
 * wrong way — instantly wrong.
 *
 * Within that constraint they are launch-quality pixel art (Stardew-cozy meets
 * solarpunk): handed spiral croziers, tapered hue-shifted stems, one-sided
 * cluster-shaded foliage, and a focal bloom / seed-pod. Each of the 5 chess
 * roles gets its own morphology AND its own hue so a board layout maps
 * role → distinct specimen, and none of them can be mistaken for the symmetric
 * garden plants on the same atlas.
 *
 * PIXEL-ART CRAFT used throughout: 7-step hue-shifting ramps (cool/teal shadows,
 * warm/gold highlights); cluster shading along the coil (lit outer rim, shadowed
 * inner core); selout outlining sampled from the ramp (not pure black) and
 * lightened on the sun-kissed top-left; manual Bayer dither only at tone seams;
 * small focal rim-lights. Pure + deterministic — the injected Rng `r` is the
 * ONLY randomness; no DOM, no wall clock.
 */

import type { Rng } from "../../src/shared/rng";
import { darken, oklch, type Ramp } from "./palette";
import { bayer, Raster, type RGB } from "./raster";

export const BENCH_ROLES = ["q", "r", "b", "n", "p"] as const;
export type BenchRole = (typeof BENCH_ROLES)[number];

/** Each role's curl morphology — the five read as distinct, handed silhouettes. */
type CurlKind =
  | "crozier" // tall single fiddlehead coil — the focal specimen (queen)
  | "scroll" // stout, low-curvature lean topped by a half-scroll (rook)
  | "double-s" // long sinuous S that resolves into a coil (bishop)
  | "hook" // short stem snapping into a tight inward hook (knight)
  | "sprout"; // small bent seedling with a half-curl tip (pawn)

interface RoleParams {
  kind: CurlKind;
  height: number; // backing internodes — drives overall scale
  coil: number; // crook tightness (radians of the terminal coil)
  coilR: number; // radius of the terminal coil head, px
  leanCurl: number; // gentle per-step lean of the stem (>0 → rightward = chiral)
  leafEvery: number; // a one-sided leaf cluster every N stem steps
  leafR: number; // leaf-cluster radius, px
  hue: number; // OKLCH hue → the five read as distinct specimens
  bloom: boolean; // crown the coil with a focal bloom (else a seed-pod nub)
}

const ROLE: Record<BenchRole, RoleParams> = {
  // tall, upright fiddlehead with a big 1.5-turn terminal volute + a crowning
  // bloom in the eye — the focal specimen.
  q: {
    kind: "crozier",
    height: 12,
    coil: 9.0,
    coilR: 7,
    leanCurl: 0.05,
    leafEvery: 2,
    leafR: 3,
    hue: 150,
    bloom: true,
  },
  // stout woody stalk, steady lean, resolving into a loose half-scroll — no bloom
  r: {
    kind: "scroll",
    height: 9,
    coil: 4.2,
    coilR: 5,
    leanCurl: 0.08,
    leafEvery: 3,
    leafR: 3,
    hue: 95,
    bloom: false,
  },
  // long sinuous double-S vine that winds up into a tight coil + a teal bloom
  b: {
    kind: "double-s",
    height: 12,
    coil: 8.5,
    coilR: 5,
    leanCurl: 0.0,
    leafEvery: 2,
    leafR: 3,
    hue: 205,
    bloom: true,
  },
  // short shaft that snaps into a very tight, fully-wound inward hook — springy
  n: {
    kind: "hook",
    height: 7,
    coil: 8.5,
    coilR: 5,
    leanCurl: 0.05,
    leafEvery: 2,
    leafR: 2,
    hue: 30,
    bloom: false,
  },
  // small bent seedling, half-curl tip, a single sun-kissed pod
  p: {
    kind: "sprout",
    height: 6,
    coil: 3.2,
    coilR: 3,
    leanCurl: 0.14,
    leafEvery: 2,
    leafR: 2,
    hue: 300,
    bloom: false,
  },
};

export function specimenHue(role: BenchRole): number {
  return ROLE[role].hue;
}

// ──────────────────────────────────────────────────────────────────────────
// Private pixel-art helpers (no exported surface change)
// ──────────────────────────────────────────────────────────────────────────

/** Safe ramp sample (noUncheckedIndexedAccess): clamp into the ramp + fall back. */
function step(ramp: Ramp, i: number): RGB {
  const n = ramp.steps.length;
  const idx = Math.max(0, Math.min(n - 1, i));
  return ramp.steps[idx] ?? ramp.mid;
}

interface Pt {
  x: number;
  y: number;
}

/**
 * A TAPERED, hue-shifted stem stroke between two points. Width falls toward the
 * tip; the up-left flank gets a lit edge, the down-right flank a cool core —
 * cluster shading, not a flat line. Pixels are placed by hand (discs), crisp.
 */
function taperStroke(
  ras: Raster,
  a: Pt,
  b: Pt,
  wA: number,
  wB: number,
  ramp: Ramp,
): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.max(1, Math.hypot(dx, dy));
  const steps = Math.ceil(len);
  // unit normal (left-hand side of travel) for the lit/shadow split
  const nx = -dy / len;
  const ny = dx / len;
  const core = step(ramp, 2);
  const body = step(ramp, 3);
  const lit = step(ramp, 5);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const cx = a.x + dx * t;
    const cy = a.y + dy * t;
    const w = wA + (wB - wA) * t;
    const ri = Math.max(0, Math.round(w));
    // body
    ras.disc(Math.round(cx), Math.round(cy), ri, body);
    // cool core on the down-right flank (one pixel in from the shadow side)
    if (ri >= 1) {
      ras.set(
        Math.round(cx - nx * ri * 0.5),
        Math.round(cy - ny * ri * 0.5),
        core,
      );
    }
    // lit rim on the up-left flank
    ras.set(
      Math.round(cx + nx * (ri + 0.3)),
      Math.round(cy + ny * (ri + 0.3)),
      lit,
    );
  }
}

/**
 * A one-sided, cluster-shaded LEAF that always fans to the curl side (+normal),
 * reinforcing handedness. Three overlapping discs (shadow root → mid body → lit
 * tip) plus a hand-placed central vein notch. `dir` is the outward leaf vector.
 */
function leafCluster(
  ras: Raster,
  base: Pt,
  dir: Pt,
  rad: number,
  ramp: Ramp,
): void {
  const len = Math.max(0.001, Math.hypot(dir.x, dir.y));
  const ux = dir.x / len;
  const uy = dir.y / len;
  const root = { x: base.x + ux * rad, y: base.y + uy * rad };
  const tip = { x: base.x + ux * rad * 2.4, y: base.y + uy * rad * 2.4 };
  // shadowed underside (cool) at the root, body in the middle, lit tip
  ras.disc(
    Math.round(base.x + ux * rad * 0.6),
    Math.round(base.y + uy * rad * 0.6),
    rad,
    step(ramp, 1),
  );
  ras.disc(Math.round(root.x), Math.round(root.y), rad, step(ramp, 3));
  ras.disc(
    Math.round(tip.x),
    Math.round(tip.y),
    Math.max(1, rad - 1),
    step(ramp, 4),
  );
  // sun-kissed tip dab + a darker central vein so the leaf reads, not a blob
  ras.set(Math.round(tip.x + ux), Math.round(tip.y + uy), step(ramp, 6));
  ras.line(
    Math.round(base.x),
    Math.round(base.y),
    Math.round(tip.x),
    Math.round(tip.y),
    step(ramp, 2),
  );
}

/**
 * The signature handed COIL (crozier head / fiddlehead). The stem tip curls OVER
 * and then spirals INWARD onto itself — a true tucking volute, not a wide bend.
 *
 * Geometry: from the entry tip we step along an arc that always turns the SAME
 * way (+ = rightward / clockwise-as-drawn) while the turning RADIUS shrinks each
 * step (an Archimedean-ish inward spiral). Because the path wraps back over its
 * own earlier turns, flipping the sprite winds the volute the wrong way — the
 * read that makes a mirror jump out. Outer turn is lit, the inner well is
 * shadowed (the coil shades itself) with a Bayer seam between. Returns the
 * spiral's eye (for the focal bloom / pod).
 *
 * `start` = where stem meets coil, `startAng` = incoming tangent (0 = up),
 * `turns` = total radians swept (more = a tighter, more-wound head),
 * `r0` = starting curl radius. `r` adds sub-pixel jitter only.
 */
function spiralCoil(
  ras: Raster,
  start: Pt,
  startAng: number,
  turns: number,
  r0: number,
  ramp: Ramp,
  r: Rng,
): Pt {
  const segs = Math.max(14, Math.round(turns * 7));
  // Integrate position by stepping the heading, shrinking the step radius so the
  // curve spirals tighter as it tucks in — this is what reads as a volute.
  let px = start.x;
  let py = start.y;
  let heading = startAng; // direction of travel
  let prev = start;
  let prevW = Math.max(1.6, r0 * 0.42);
  let eyeX = start.x;
  let eyeY = start.y;
  for (let s = 1; s <= segs; s++) {
    const t = s / segs; // 0..1 inward
    const rad = r0 * (1 - 0.82 * t) + (r() - 0.5) * 0.25; // shrinking turn radius
    const dTheta = turns / segs; // constant heading change → consistent handedness
    heading += dTheta;
    // advance along the current heading by an arc-length proportional to radius
    const stepLen = Math.max(0.8, rad * dTheta + 0.9);
    px += Math.sin(heading) * stepLen;
    py -= Math.cos(heading) * stepLen;
    const w = Math.max(0.7, prevW * 0.94);
    taperStroke(ras, prev, { x: px, y: py }, prevW, w, ramp);
    prev = { x: px, y: py };
    prevW = w;
    eyeX = px;
    eyeY = py; // last interior point ≈ the spiral eye
  }
  // Shadowed inner well + a dithered seam ring → the coil reads as wound, 3-D.
  const ex = Math.round(eyeX);
  const ey = Math.round(eyeY);
  ras.disc(ex, ey, 2, step(ramp, 1));
  for (let y = -3; y <= 3; y++) {
    for (let x = -3; x <= 3; x++) {
      const d = Math.hypot(x, y);
      if (d < 1.6 || d > 3) continue;
      if (bayer(ex + x, ey + y) < 0.5) continue;
      ras.set(ex + x, ey + y, step(ramp, 2));
    }
  }
  return { x: eyeX, y: eyeY };
}

/** A focal BLOOM: warm petals around an accent core with a single eye-glint. */
function bloom(ras: Raster, c: Pt, accent: RGB, ramp: Ramp): void {
  const cx = Math.round(c.x);
  const cy = Math.round(c.y);
  // five offset petals (asymmetric placement — still no mirror symmetry)
  const pet: Pt[] = [
    { x: 0, y: -3 },
    { x: 3, y: -1 },
    { x: 2, y: 3 },
    { x: -2, y: 2 },
    { x: -3, y: -1 },
  ];
  for (const p of pet) ras.disc(cx + p.x, cy + p.y, 2, accent);
  ras.disc(cx, cy, 2, step(ramp, 4)); // calyx
  ras.disc(cx, cy, 1, step(ramp, 6)); // lit centre
  ras.set(cx - 1, cy - 1, oklch(0.92, 0.05, 90)); // sun glint
}

/** A focal SEED-POD nub for the bloomless roles — a small lit teardrop. */
function seedPod(ras: Raster, c: Pt, accent: RGB, ramp: Ramp): void {
  const cx = Math.round(c.x);
  const cy = Math.round(c.y);
  ras.disc(cx, cy, 2, step(ramp, 2)); // shaded base
  ras.disc(cx - 1, cy - 1, 2, accent); // body, offset toward the light
  ras.set(cx - 1, cy - 1, step(ramp, 6)); // highlight
  ras.set(cx + 1, cy + 1, step(ramp, 0)); // contact shadow
}

interface Walk {
  tip: Pt;
  tipAng: number;
  stemPts: Pt[];
}

/**
 * Walk the backbone of a specimen as a sequence of tapered internodes, depositing
 * one-sided leaf clusters as it climbs, and return the tip + tangent so the coil
 * can attach. The per-kind angle programme is what gives each role its silhouette
 * while keeping a single, consistent rightward handedness.
 */
function walkStem(
  ras: Raster,
  p: RoleParams,
  start: Pt,
  ramp: Ramp,
  r: Rng,
): Walk {
  let x = start.x;
  let y = start.y;
  let ang = 0; // 0 = straight up
  const internode = 4;
  const wBase = Math.max(2, Math.round(p.height * 0.22)); // thick warm base
  const stemPts: Pt[] = [{ x, y }];
  let lastAng = ang;

  for (let i = 0; i < p.height; i++) {
    const t = i / Math.max(1, p.height - 1);
    const jitter = (r() - 0.5) * 0.06;

    // per-kind backbone programme (all curls wind the SAME, rightward way).
    // The crozier/double-s keep their stems fairly UPRIGHT so the terminal
    // spiral is the dominant chiral read, not a generic sideways bend.
    let bend = p.leanCurl;
    if (p.kind === "double-s") {
      // one full S wave (right, then left), with a gentle rightward bias at the
      // very apex so the stem reads as an S and the terminal volute tucks to the
      // curl side — not a straight-up nub.
      bend = Math.sin(t * Math.PI * 2) * 0.26 + (t > 0.82 ? 0.08 : 0);
    } else if (p.kind === "hook") {
      // straight shaft, then a hard rightward kick near the top (springy)
      bend = t > 0.65 ? 0.18 : 0.02;
    } else if (p.kind === "sprout") {
      bend = p.leanCurl * (0.5 + t * 0.9); // bends progressively harder
    } else if (p.kind === "scroll") {
      bend = p.leanCurl; // gentle, stout, near-constant lean
    } else {
      bend = p.leanCurl * (0.4 + t * 0.5); // crozier: only a subtle pre-coil lean
    }
    ang += bend + jitter;

    const nx = x + Math.sin(ang) * internode;
    const ny = y - Math.cos(ang) * internode;
    const w0 = wBase * (1 - 0.62 * t);
    const w1 = wBase * (1 - 0.62 * (t + 1 / p.height));
    taperStroke(ras, { x, y }, { x: nx, y: ny }, w0, Math.max(0.8, w1), ramp);

    // one-sided leaf clusters — ALWAYS fan to the curl (right) side. The leaf
    // points sideways-and-up (stem tangent rotated ~80° toward the curl), so
    // fronds read as a one-sided comb, never a symmetric pair.
    if (i >= 2 && i % p.leafEvery === 0 && i < p.height - 1) {
      const dir = {
        x: Math.cos(ang) * 0.95 + Math.sin(ang) * 0.25,
        y: Math.sin(ang) * 0.95 - Math.cos(ang) * 0.25,
      };
      const lr = Math.max(2, p.leafR - (t > 0.7 ? 1 : 0));
      leafCluster(ras, { x: nx, y: ny }, dir, lr, ramp);
    }

    x = nx;
    y = ny;
    lastAng = ang;
    stemPts.push({ x, y });
  }
  return { tip: { x, y }, tipAng: lastAng, stemPts };
}

/**
 * Draw a chiral specimen. `r` jitters node angles + coil radius (bake stream).
 * The caller supplies a ramp/accent (typically built from `specimenHue(role)`),
 * then applies the selout shell via `ras.outline(...)`.
 */
export function benchSpecimen(
  role: BenchRole,
  size: number,
  ramp: Ramp,
  accent: RGB,
  r: Rng,
): Raster {
  const ras = new Raster(size, size);
  const p = ROLE[role];

  // Start left-of-centre + low, so the upright stem rises through the cell and
  // the rightward volute + right-fanning foliage fill the upper-right quadrant
  // without clipping — the asymmetry sits in-frame.
  const start: Pt = { x: size * 0.3, y: size - 4 };

  const { tip, tipAng } = walkStem(ras, p, start, ramp, r);

  // The handed terminal coil — the chiral signature. Convert the role's coil
  // sweep so tighter heads (hook) wind more turns into a smaller radius.
  const head = spiralCoil(ras, tip, tipAng, p.coil, p.coilR, ramp, r);

  // Focal point lands inside/atop the coil head.
  if (p.bloom) bloom(ras, head, accent, ramp);
  else seedPod(ras, head, accent, ramp);

  // A tiny basal rosette anchors the specimen to the bench (warm shadow base).
  ras.disc(Math.round(start.x), Math.round(start.y), 2, step(ramp, 1));
  ras.disc(Math.round(start.x + 2), Math.round(start.y), 1, step(ramp, 3));

  // Selout shell: outline from the ramp's deep shadow (cooler than pure black);
  // the top-left lit edge is lightened afterwards for a sun-kissed rim.
  ras.outline(darken(step(ramp, 0), 0.4));
  sunKissTopLeft(ras, step(ramp, 6));
  return ras;
}

/**
 * Lighten the outline on the up-left lit flank only (selout): walk the silhouette
 * and, where an outline pixel has open space to its upper-left, repaint it with a
 * pale rim. Keeps the shadow side dark and the lit side glowing — no AA averaging.
 */
function sunKissTopLeft(ras: Raster, rim: RGB): void {
  const pts: Pt[] = [];
  for (let y = 1; y < ras.h; y++) {
    for (let x = 1; x < ras.w; x++) {
      if (ras.alphaAt(x, y) === 0) continue;
      // an edge pixel whose up + left neighbours are both empty = lit corner
      if (ras.alphaAt(x - 1, y) === 0 && ras.alphaAt(x, y - 1) === 0) {
        pts.push({ x, y });
      }
    }
  }
  for (const pt of pts) ras.set(pt.x, pt.y, rim);
}
