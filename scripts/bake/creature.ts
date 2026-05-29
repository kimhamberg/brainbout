/**
 * Silhouette-first sprite generators for the non-FLORA kingdoms (design docs/01).
 * Curated parts + per-seed variation + ramp shading; vertical symmetry is the
 * "designed animal" cue. The caller outlines + composites. `r` is the bake stream.
 *
 * Pixel-art craft applied throughout (Stardew-cozy meets solarpunk):
 *  - LIMITED, hue-shifted ramps (cool/teal shadows, warm/gold highlights) sourced
 *    from `Ramp.steps`; intermediate tones are mixed so a 5-step input still reads
 *    as a finer, lush gradient without per-pixel noise.
 *  - CLUSTER shading: light/shadow live in deliberate connected regions that follow
 *    each form (lit dome top-left, core shadow bottom-right, occlusion under chins).
 *  - SELOUT-friendly: the caller adds the dark rim, so these leave a clean readable
 *    silhouette and only paint INTERNAL form + focal highlights (eye glints, rim).
 *  - DETERMINISTIC + PURE: randomness only through the injected `r`; no DOM, no time.
 */

import type { Rng } from "../../src/shared/rng";
import { darken, type Ramp } from "./palette";
import { Raster, type RGB } from "./raster";

// ── ramp helpers ──────────────────────────────────────────────────────────
// The caller hands us a 5-step (sometimes more) hue-shifted ramp. We sample it
// at continuous t∈[0,1] so a small input ramp still yields smooth cozy banding.

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(lerp(a[0], b[0], t)),
    Math.round(lerp(a[1], b[1], t)),
    Math.round(lerp(a[2], b[2], t)),
  ];
}

function lighten(c: RGB, t: number): RGB {
  return mix(c, [255, 255, 255], t);
}

/** Sample the ramp at t∈[0,1] (0 = deepest shadow, 1 = brightest light). */
function tone(ramp: Ramp, t: number): RGB {
  const steps = ramp.steps;
  const n = steps.length;
  if (n === 0) return ramp.mid;
  if (n === 1) return steps[0] ?? ramp.mid;
  const u = Math.max(0, Math.min(1, t)) * (n - 1);
  const i = Math.min(n - 2, Math.floor(u));
  const lo = steps[i] ?? ramp.mid;
  const hi = steps[i + 1] ?? ramp.light;
  return mix(lo, hi, u - i);
}

// ── cluster-shaded dome ─────────────────────────────────────────────────────
// The workhorse for cozy rounded forms. Instead of a per-pixel value gradient
// (which dithers into noise) we quantize the lambert term into a few connected
// BANDS, hue-shifted via the ramp, with a single dither row at each band seam so
// transitions read soft but stay crisp. Light comes from the upper-left.

interface DomeOpts {
  /** light direction, normalized-ish (default upper-left). */
  lx?: number;
  ly?: number;
  /** brightest band the rim/top reaches (default near-light + a gold kiss). */
  hi?: number;
  /** darkest band in the core shadow (default deep shadow). */
  lo?: number;
  /** clip to the top half only (mushroom cap). */
  topHalf?: boolean;
  /** add a warm sun-kissed pixel run along the top-left rim. */
  rimLight?: boolean;
}

function shadedDisc(
  ras: Raster,
  cx: number,
  cy: number,
  rad: number,
  ramp: Ramp,
  opts: DomeOpts = {},
): void {
  const lx = opts.lx ?? -0.72;
  const ly = opts.ly ?? -0.69;
  const hiT = opts.hi ?? 0.9;
  const loT = opts.lo ?? 0.06;
  const topHalf = opts.topHalf ?? false;
  const r2 = rad * rad;

  for (let y = -rad; y <= rad; y++) {
    if (topHalf && y > 1) continue;
    for (let x = -rad; x <= rad; x++) {
      const d2 = x * x + y * y;
      if (d2 > r2) continue;
      // surface normal of a sphere → lambert toward the light
      const nz = Math.sqrt(Math.max(0, 1 - d2 / r2));
      const nx = x / rad;
      const ny = y / rad;
      const lambert = nx * lx + ny * ly + nz * 0.55; // 0.55 = light tilt toward us
      // map -1..1 → 0..1, then quantize into connected bands
      let t = (lambert + 1) / 2;
      // soft ordered dither only at band seams keeps clusters connected
      const band = t * 4;
      const seam = band - Math.floor(band);
      const jitter = (((x & 1) ^ (y & 1)) === 0 ? 0.08 : -0.08) * 0.5;
      const q = (Math.floor(band) + (seam + jitter > 0.5 ? 1 : 0)) / 4;
      t = lerp(loT, hiT, q);
      ras.set(cx + x, cy + y, tone(ramp, t));
    }
  }

  if (opts.rimLight) {
    // a thin sun-kissed run along the upper-left rim — warmer than the ramp top
    const gold = lighten(ramp.light, 0.22);
    for (let a = 0; a < Math.PI / 2; a += 0.18) {
      const px = Math.round(cx - Math.cos(a) * (rad - 0.5));
      const py = Math.round(cy - Math.sin(a) * (rad - 0.5));
      ras.set(px, py, gold);
    }
  }
}

/** A soft core-shadow occlusion smudge (where one form sits under another). */
function occlude(
  ras: Raster,
  cx: number,
  cy: number,
  w: number,
  ramp: Ramp,
): void {
  const sh = tone(ramp, 0.02);
  for (let x = -w; x <= w; x++) {
    const t = 1 - Math.abs(x) / (w + 1);
    if (t <= 0) continue;
    // only darken where there's already body (keeps the silhouette clean)
    if (ras.alphaAt(cx + x, cy) > 0) ras.set(cx + x, cy, sh);
    if (t > 0.5 && ras.alphaAt(cx + x, cy + 1) > 0) {
      ras.set(cx + x, cy + 1, mix(sh, ramp.shadow, 0.5));
    }
  }
}

/** A round cluster highlight (belly / cheek / dome sheen). */
function sheen(ras: Raster, cx: number, cy: number, rad: number, c: RGB): void {
  const r2 = rad * rad;
  for (let y = -rad; y <= rad; y++) {
    for (let x = -rad; x <= rad; x++) {
      const d2 = x * x + y * y;
      if (d2 > r2) continue;
      if (ras.alphaAt(cx + x, cy + y) === 0) continue; // stay on-form
      // soft falloff: a full-highlight inner cluster, then a 1px checker-dithered
      // fringe so the sheen melts into the body instead of forming a hard disc.
      const t = 1 - d2 / r2;
      if (t > 0.45) ras.set(cx + x, cy + y, c);
      else if (t > 0.2 && ((x & 1) ^ (y & 1)) === 0) ras.set(cx + x, cy + y, c);
    }
  }
}

/**
 * FAUNA — a cozy rounded critter. Built left-of-centre then mirrored for the
 * "designed animal" symmetry cue; the expressive face is painted last (also
 * symmetric). `asleep` → a tucked, low posture with closed content lids (R6).
 */
export function critter(
  size: number,
  ramp: Ramp,
  accent: RGB,
  r: Rng,
  asleep = false,
): Raster {
  const ras = new Raster(size, size);
  const cx = Math.floor(size / 2);

  // --- proportions (asleep = smaller, slumped, no head lift → "curled up") ---
  const bodyR = Math.round(size * (asleep ? 0.27 : 0.3));
  const bodyY = Math.round(size * (asleep ? 0.66 : 0.62));
  const hasHead = !asleep && r() > 0.3;
  const headR = Math.round(bodyR * 0.72);
  const headY = bodyY - Math.round(bodyR * (hasHead ? 1.12 : 0));

  // deterministic appendage choices BEFORE any drawing (pure, seed-driven)
  const earKind = asleep ? 0 : r() > 0.62 ? 2 : r() > 0.32 ? 1 : 0; // 0 none,1 ears,2 antennae
  const wantBlush = r() > 0.45;
  const wantTail = !asleep && r() > 0.55;

  // === BODY ================================================================
  shadedDisc(ras, cx, bodyY, bodyR, ramp, { rimLight: true });

  // feet / paws — soft rounded, tucked forward when asleep
  const footY = bodyY + bodyR - (asleep ? 0 : 1);
  const footX = Math.round(bodyR * (asleep ? 0.42 : 0.55));
  const footC = tone(ramp, 0.34);
  for (const sgn of [-1, 1]) {
    ras.disc(cx + sgn * footX, footY, asleep ? 2 : 3, footC);
    ras.disc(cx + sgn * footX, footY, asleep ? 1 : 2, tone(ramp, 0.5));
    // toe-bean hint highlight
    ras.set(cx + sgn * footX, footY - 1, tone(ramp, 0.7));
  }

  // a curled tail peeking on one side (asymmetric → drawn after, not mirrored)
  if (wantTail) {
    const tx = cx + bodyR - 1;
    const ty = bodyY + Math.round(bodyR * 0.2);
    ras.disc(tx, ty, 3, tone(ramp, 0.42));
    ras.disc(tx + 1, ty - 1, 2, tone(ramp, 0.62));
    ras.set(tx + 1, ty - 2, lighten(ramp.light, 0.15));
  }

  // === HEAD ================================================================
  const faceY = hasHead ? headY : bodyY - Math.round(bodyR * 0.34);
  const faceR = hasHead ? headR : bodyR;
  if (hasHead) {
    shadedDisc(ras, cx, headY, headR, ramp, { rimLight: true });
    // occlusion / chin shadow where the head meets the body
    occlude(ras, cx, headY + headR - 1, Math.round(headR * 0.7), ramp);
  }

  // ears or antennae (symmetric) — drawn on the left, mirrored later
  const topAnchorY = (hasHead ? headY : bodyY) - faceR;
  if (earKind === 1) {
    const ex = Math.round(faceR * 0.62);
    const er = Math.max(2, Math.round(faceR * 0.42));
    shadedDisc(ras, cx - ex, topAnchorY + 1, er, ramp);
    // inner-ear warmth
    ras.disc(
      cx - ex,
      topAnchorY + 1,
      Math.max(1, er - 2),
      mix(accent, ramp.mid, 0.35),
    );
  } else if (earKind === 2) {
    const ex = Math.round(faceR * 0.5);
    const tipY = topAnchorY - Math.round(faceR * 0.6);
    ras.line(cx - 1, topAnchorY, cx - ex, tipY, tone(ramp, 0.34));
    ras.disc(cx - ex, tipY, 2, accent); // glowing bobble
    ras.set(cx - ex - 1, tipY - 1, lighten(accent, 0.4)); // glint on the bobble
  }

  // === FACE (symmetric, painted before mirror so both halves match) =========
  // belly / chest highlight — a warm sun-lit cluster low on the body
  sheen(
    ras,
    cx - Math.round(bodyR * 0.18),
    bodyY + Math.round(bodyR * 0.2),
    Math.round(bodyR * 0.5),
    tone(ramp, 0.82),
  );

  // Mirror the left half → crisp bilateral symmetry (the cozy "designed" cue).
  // Everything asymmetric (tail) was placed on the right and survives; the body
  // is symmetric so mirroring only cleans up sub-pixel asymmetry in the shading.
  ras.mirrorX();

  // --- eyes + expression (centred, so mirror-safe to do after) -------------
  const eyeY = faceY + Math.round(faceR * 0.05);
  const eyeX = Math.max(3, Math.round(faceR * 0.5));
  const ink = darken(ramp.shadow, 0.55);
  const cheekY = eyeY + Math.round(faceR * 0.42);

  if (asleep) {
    // closed, content lids: a gentle downward arc with relaxed lashes
    for (const sgn of [-1, 1]) {
      const ex = cx + sgn * eyeX;
      ras.set(ex - 1, eyeY, ink);
      ras.set(ex, eyeY + 1, ink);
      ras.set(ex + 1, eyeY, ink);
      // soft lower lash tick
      ras.set(ex, eyeY + 2, mix(ink, ramp.shadow, 0.4));
    }
    // sleepy blush + a tiny content smile
    const blush = mix(accent, [255, 220, 200], 0.3);
    for (const sgn of [-1, 1]) {
      ras.set(cx + sgn * (eyeX + 1), cheekY, blush);
      ras.set(cx + sgn * (eyeX + 2), cheekY, blush);
      ras.set(cx + sgn * (eyeX + 1), cheekY + 1, mix(blush, ramp.mid, 0.5));
    }
    ras.set(cx - 1, cheekY, ink);
    ras.set(cx, cheekY + 1, ink);
    ras.set(cx + 1, cheekY, ink);
  } else {
    // big round glossy eyes: a solid 2×3 ink oval (NOT disc — discs read as a
    // cross at r=2), a warm lower-iris bounce, and a 1px white catch-light.
    const glint = lighten(ramp.light, 0.92);
    const iris = mix(ink, accent, 0.35);
    for (const sgn of [-1, 1]) {
      const ex = cx + sgn * eyeX;
      // pupil column: tall oval so the eye reads round + alert, not sparkly
      ras.set(ex, eyeY - 1, ink);
      ras.set(ex - 1, eyeY, ink);
      ras.set(ex, eyeY, ink);
      ras.set(ex + 1, eyeY, ink);
      ras.set(ex, eyeY + 1, ink);
      ras.set(ex - 1, eyeY + 1, iris); // lower bounce-light
      ras.set(ex - 1, eyeY - 1, glint); // upper-left catch-light
    }
    // a soft snoot + an upturned content smile (reads friendly, not a frown)
    const nose = mix(ink, accent, 0.3);
    const noseY = eyeY + Math.round(faceR * 0.3);
    ras.set(cx, noseY, nose);
    ras.set(cx - 1, noseY + 1, nose); // smile corners curl UP at the ends
    ras.set(cx, noseY + 2, nose);
    ras.set(cx + 1, noseY + 1, nose);
    // cheek blush clusters
    if (wantBlush) {
      const blush = mix(accent, [255, 210, 190], 0.25);
      for (const sgn of [-1, 1]) {
        ras.set(cx + sgn * (eyeX + 2), cheekY, blush);
        ras.set(cx + sgn * (eyeX + 3), cheekY, mix(blush, ramp.mid, 0.4));
        ras.set(cx + sgn * (eyeX + 2), cheekY + 1, mix(blush, ramp.mid, 0.4));
      }
    }
  }

  return ras;
}

/**
 * MODIFIER — a cozy mushroom / lichen cap: a cluster-shaded dome with a warm
 * lit rim, a gill/underside hint along the lip, freckled spots that respect the
 * dome's light, and a shaded stem. `r` jitters spot placement (bake stream).
 */
export function cap(size: number, ramp: Ramp, accent: RGB, r: Rng): Raster {
  const ras = new Raster(size, size);
  const cx = Math.floor(size / 2);
  const capR = Math.round(size * 0.33);
  const capY = Math.round(size * 0.46);
  const stemTop = capY + Math.round(capR * 0.35);
  const stemH = Math.round(size * 0.3);
  const stemW = Math.max(3, Math.round(capR * 0.42));

  // === STEM (drawn first so the cap lip overlaps it) ========================
  for (let y = 0; y < stemH; y++) {
    const taper = Math.round(stemW * (0.5 + 0.12 * (y / stemH))); // flares to base
    for (let x = -taper; x <= taper; x++) {
      const t = 0.62 - (x / (taper + 1)) * 0.28; // lit left, shaded right
      ras.set(cx + x, stemTop + y, tone(ramp, Math.max(0.18, t)));
    }
  }
  // little ground flare / volva at the base
  ras.disc(cx, stemTop + stemH - 1, Math.round(stemW * 0.9), tone(ramp, 0.3));
  ras.disc(cx, stemTop + stemH - 2, Math.round(stemW * 0.6), tone(ramp, 0.5));

  // === GILL / UNDERSIDE HINT (the shaded lip beneath the dome) ==============
  const underY = capY + 1;
  const underW = Math.round(capR * 0.92);
  for (let x = -underW; x <= underW; x++) {
    const onArc = x * x <= underW * underW;
    if (!onArc) continue;
    // radial gill ticks — short vertical strokes, darkest in the centre recess
    const depth = 1 + Math.round((1 - Math.abs(x) / underW) * 2);
    const gillC = mix(tone(ramp, 0.12), accent, 0.12);
    for (let g = 0; g < depth; g++) {
      if ((x & 1) === 0 || g === 0) ras.set(cx + x, underY + g, gillC);
    }
  }

  // === DOME (cluster-shaded top half, warm sun-kissed rim) ==================
  shadedDisc(ras, cx, capY, capR, ramp, {
    topHalf: true,
    hi: 0.95,
    lo: 0.22,
    rimLight: true,
  });
  // re-assert a crisp lit lip across the very front edge of the cap
  for (let x = -capR; x <= capR; x++) {
    if (x * x <= capR * capR) {
      const t = 0.4 - (x / (capR + 1)) * 0.18;
      ras.set(cx + x, capY, tone(ramp, Math.max(0.2, t)));
    }
  }

  // === SPOTS / FRECKLES (sit on the dome, lit consistently) =================
  const spots = 3 + Math.floor(r() * 3);
  const spotC = lighten(accent, 0.35);
  for (let i = 0; i < spots; i++) {
    // bias spots onto the upper dome where they catch the light
    const ang = (r() - 0.5) * 2.2;
    const rad = r() * capR * 0.78;
    const sx = cx + Math.round(Math.sin(ang) * rad);
    const sy = capY - Math.round(Math.abs(Math.cos(ang)) * rad * 0.62) - 1;
    if (ras.alphaAt(sx, sy) === 0) continue;
    const big = r() > 0.5;
    ras.disc(sx, sy, big ? 1 : 0, spotC);
    if (big) ras.set(sx - 1, sy - 1, lighten(spotC, 0.4)); // tiny spot glint
  }

  return ras;
}

/**
 * STRUCTURE — a charming gentle-renewable solar-lantern: a slim art-nouveau
 * standing post that the valley is reclaiming. A scrolled finial caps a warm
 * glowing lens (cool casing → lit core, cross-mullion + a soft radial bloom), a
 * small tilted solar-panel arm juts off the lit flank, the tapered FLUTED column
 * carries panel seams with a cluster-shaded lit-left / occluded-right body, a
 * warm-green vine creeps up the shadow side (the reclamation theme), and it all
 * sits on a grounded plinth. Light comes from the upper-left, matching the rest
 * of the set. No `r`: fully deterministic from inputs (variation via structured
 * detail, never randomness). The caller adds the selout outline + composites.
 */
export function marker(size: number, ramp: Ramp, accent: RGB): Raster {
  const ras = new Raster(size, size);
  const cx = Math.floor(size / 2);

  // ── vertical layout (a slim standing solar-lantern post) ─────────────────
  const baseY = Math.round(size * 0.9); // ground line
  const orbY = Math.round(size * 0.27); // glowing lamp centre
  const finialY = orbY - 8; // crown / finial tip
  const shaftTop = orbY + 8; // where the column begins under the lamp
  const shaftBot = baseY - 3;

  // warm renewable glow palette (sun-charged) derived from the accent
  const glowHot = lighten(accent, 0.72);
  const glowCore = lighten(accent, 0.42);
  const glowMid = accent;
  const glowRim = mix(accent, ramp.light, 0.25);

  // === COLUMN (a tapered, FLUTED art-nouveau post) =========================
  // half-width tapers from slim at the top to a wider footing.
  for (let y = shaftTop; y <= shaftBot; y++) {
    const f = (y - shaftTop) / (shaftBot - shaftTop);
    const hw = Math.round(lerp(4, 6, f * f)); // gentle flare toward the base
    for (let x = -hw; x <= hw; x++) {
      // cluster form light: lit on the left, core shadow on the right.
      let t = 0.64 - (x / (hw + 0.6)) * 0.4;
      // two recessed flutes give a paneled (not plain-bar) column.
      if (Math.abs(Math.abs(x) - Math.round(hw * 0.5)) === 0) t -= 0.12;
      // panel seams every 7px → reads as fabricated tech.
      if ((y - shaftTop) % 7 === 0) t -= 0.18;
      t = Math.max(0.12, Math.min(0.92, t));
      ras.set(cx + x, y, tone(ramp, t));
    }
    // crisp sun-lit edge down the left flank; deep occlusion on the right.
    ras.set(cx - hw, y, tone(ramp, 0.86));
    ras.set(cx + hw, y, tone(ramp, 0.14));
  }

  // === SOFT RADIAL BLOOM behind the lamp (tight, low-alpha — soft halo) =====
  // kept small so the silhouette stays the lamp + post, not a giant disc; the
  // outline pass only kisses the faint outermost ring as a gentle glow lip.
  for (let rr = 8; rr >= 6; rr--) {
    const a = 16 + (8 - rr) * 12;
    ras.disc(cx, orbY, rr, glowRim, a);
  }

  // === SOLAR PANEL (a small tilted PV blade off the lit upper post) =========
  // a clearly-read angled cell-grid (the renewable tech tell), with a strut so
  // it reads as fixed hardware, not floating. Sits on the lit/left flank.
  const finTipX = cx - 9;
  const finTipY = shaftTop + 1;
  const frame = mix(ramp.shadow, accent, 0.3);
  const cellLit = mix(ramp.light, accent, 0.3);
  const cellMid = mix(accent, ramp.shadow, 0.4);
  for (let s = 0; s < 6; s++) {
    const fx = finTipX + s; // runs down-right toward the post
    const fy = finTipY + Math.round(s * 0.5); // gentle tilt
    // two-row panel: glass face over a darker frame underside.
    ras.set(fx, fy, s % 2 === 0 ? cellLit : cellMid); // cell grid
    ras.set(fx, fy + 1, frame); // frame underside
  }
  ras.set(finTipX - 1, finTipY, lighten(cellLit, 0.3)); // sun-glint on outer cell
  ras.set(cx - 4, finTipY + 3, tone(ramp, 0.4)); // mounting strut to post

  // === LAMP (warm glowing lens: cool casing → lit warm core + halo) =========
  ras.disc(cx, orbY, 5, mix(ramp.shadow, accent, 0.45)); // casing ring (cool)
  ras.disc(cx, orbY, 4, mix(accent, ramp.shadow, 0.25)); // inner glass edge
  ras.disc(cx, orbY, 3, glowMid);
  ras.disc(cx, orbY, 2, glowCore);
  ras.disc(cx, orbY, 1, glowHot);
  ras.set(cx, orbY, lighten(glowHot, 0.5)); // hot centre
  ras.set(cx - 1, orbY - 1, lighten(glowHot, 0.72)); // catch-light glint
  ras.set(cx + 2, orbY + 2, mix(glowMid, ramp.shadow, 0.45)); // shadow-side dim
  // lantern cage struts (two thin verticals) read as a held lamp, not a sun.
  ras.set(cx - 5, orbY, mix(ramp.shadow, accent, 0.4));
  ras.set(cx + 5, orbY, mix(ramp.shadow, accent, 0.2));
  // a faint cross mullion across the glass → reads as a solar lens, not a bead.
  ras.set(cx, orbY - 3, mix(ramp.shadow, accent, 0.35));
  ras.set(cx, orbY + 3, mix(ramp.shadow, accent, 0.35));

  // === FINIAL / CROWN (an art-nouveau scrolled cap above the lamp) ==========
  ras.set(cx, orbY - 6, tone(ramp, 0.6)); // neck
  ras.set(cx, orbY - 7, tone(ramp, 0.72));
  ras.set(cx - 1, finialY, tone(ramp, 0.5)); // scrolled volute (lit)
  ras.set(cx + 1, finialY, tone(ramp, 0.3)); // scrolled volute (shade)
  ras.set(cx, finialY - 1, lighten(accent, 0.35)); // tiny tip spark

  // === BASE / FOOTING (a grounded shaded plinth) ===========================
  ras.fillRect(cx - 5, baseY - 2, 11, 1, tone(ramp, 0.58)); // neck of base
  ras.fillRect(cx - 7, baseY - 1, 15, 1, tone(ramp, 0.44));
  ras.fillRect(cx - 8, baseY, 17, 2, tone(ramp, 0.26)); // wide footing
  ras.set(cx - 8, baseY, tone(ramp, 0.46)); // lit base corner
  ras.set(cx + 8, baseY, tone(ramp, 0.14)); // shadow base corner

  // === VINE RECLAMATION (warm-green creeper up the shadow / right side) =====
  // hand-routed so it hugs the right flank of the post (never crosses centre);
  // greens lean warm/yellow-green per the art direction, leaves catch the light.
  const vineDark: RGB = mix([74, 122, 54], ramp.shadow, 0.3);
  const vineMid: RGB = [102, 152, 64];
  const vineLit: RGB = [140, 190, 88];
  let vy = baseY - 3;
  const climb = orbY + 6;
  let i = 0;
  while (vy > climb) {
    const f = (baseY - vy) / (baseY - climb);
    const hw = Math.round(lerp(6, 4, f * f));
    // ride just outside the right edge, weaving gently in toward the post.
    const wob = [1, 1, 0, -1, 0, 1, 1, 0][i % 8] ?? 0;
    const vx = cx + hw - 1 + wob;
    ras.set(vx, vy, vineDark);
    ras.set(vx - 1, vy, vineMid); // a touch of body on the lit inner side
    if (i > 1 && i % 3 === 0) {
      ras.disc(vx + 1, vy, 1, vineMid); // a leaf curling outward
      ras.set(vx + 1, vy, vineLit);
      ras.set(vx + 2, vy - 1, lighten(vineLit, 0.25)); // lit leaf tip
    }
    vy -= 1;
    i++;
  }
  // a small tendril curl that hooks onto the lamp casing.
  ras.set(cx + 5, climb + 1, vineMid);
  ras.set(cx + 4, climb, vineLit);

  return ras;
}
