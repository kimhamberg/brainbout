/**
 * Dual-grid 16-config autotiling for ONE binary terrain pair + an Art-Nouveau
 * reclamation overlay at coverage 0..4 (design docs/design/01).
 *
 * Both families are 24×24 and tile SEAMLESSLY: every texture is a pure function
 * of world-modular coordinates (no per-tile origin) and every grass↔soil seam is
 * decided solely by the four shared corner bits, so any two tiles laid edge to
 * edge agree pixel-for-pixel along the shared border. Determinism comes from a
 * tiny integer hash + the ordered Bayer matrix — no Rng, no DOM, no wall clock.
 *
 * Pixel-art craft applied (Stardew-cozy / solarpunk):
 *  - LIMITED hue-shifted ramps (cool/teal shadows, warm/gold highlights).
 *  - CLUSTER shading: grass blades read as vertical tufts (lit tops, shaded
 *    roots); panel metal is lit top-left, shaded bottom-right.
 *  - DITHERED transitions only at the grass↔soil seam and the moss creep front
 *    (ordered Bayer against a smooth coverage field — soft, not hard quadrants).
 *  - SELOUT: seam/lattice outlines sampled from the dark end of a ramp, lifted
 *    (omitted) on sun-kissed top edges.
 */

import { darken, type Ramp } from "./palette";
import { bayer, Raster, type RGB } from "./raster";

// ── deterministic, TOROIDAL value noise (pure, period = tile size) ───────────
//
// Seamlessness is non-negotiable here: a tile placed beside a copy of itself must
// show no seam. So every texture frequency is made exactly periodic with the tile
// size by wrapping the noise LATTICE indices modulo a fixed cell count. With a
// 24px tile and an integer scale that divides 24, lattice index 0 and index
// (24/scale) hash to the same value → noise(0) === noise(24).

/** Stable integer hash → [0,1). Used for tuft/fleck placement, never time/Rng. */
function hash01(x: number, y: number): number {
  let h = (x | 0) * 374_761_393 + (y | 0) * 668_265_263;
  h = (h ^ (h >>> 13)) * 1_274_126_177;
  h ^= h >>> 16;
  return ((h >>> 0) % 100_000) / 100_000;
}

/** Hash wrapped to a toroidal lattice of `cells` per axis (periodic). */
function hashWrap(x: number, y: number, cells: number): number {
  const wx = ((x % cells) + cells) % cells;
  const wy = ((y % cells) + cells) % cells;
  return hash01(wx, wy);
}

/** Per-pixel periodic hash (period `P`) — sparse flecks that survive tiling. */
function fleck(x: number, y: number, P: number, salt: number): number {
  const wx = ((x % P) + P) % P;
  const wy = ((y % P) + P) % P;
  return hash01(wx * 3 + salt, wy * 3 + salt * 2 + 1);
}

/**
 * Smooth value-noise (bilinear) that is exactly periodic with period `P`. The
 * integer lattice has `round(P / scale)` cells per axis; corner indices wrap so
 * the field tiles seamlessly. `scale` should divide `P` for a clean period.
 */
function vnoise(x: number, y: number, scale: number, P: number): number {
  const cells = Math.max(1, Math.round(P / scale));
  const sx = x / scale;
  const sy = y / scale;
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const fx = sx - x0;
  const fy = sy - y0;
  const ex = fx * fx * (3 - 2 * fx);
  const ey = fy * fy * (3 - 2 * fy);
  const a = hashWrap(x0, y0, cells);
  const b = hashWrap(x0 + 1, y0, cells);
  const c = hashWrap(x0, y0 + 1, cells);
  const d = hashWrap(x0 + 1, y0 + 1, cells);
  const top = a + (b - a) * ex;
  const bot = c + (d - c) * ex;
  return top + (bot - top) * ey;
}

/** Pull a step from a ramp by 0..1 fraction, clamped to the ramp length. */
function shade(ramp: Ramp, t: number): RGB {
  const n = ramp.steps.length;
  const i = Math.max(0, Math.min(n - 1, Math.round(t * (n - 1))));
  return ramp.steps[i] as RGB;
}

/** Blend two sRGB colours (a→b by f) then quantise — for the soil base only. */
function mix(a: RGB, b: RGB, f: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

// ── dual-grid terrain ────────────────────────────────────────────────────────

/**
 * 16 tiles indexed by 4 corner bits (NW=8, NE=4, SW=2, SE=1) — `grass` over
 * `soil`. The half-tile offset is the caller's; here we just render the four
 * corner states. Instead of hard quadrant squares we build a smooth grass
 * coverage FIELD from the corner bits (bilinear) and dither the seam against it,
 * so transitions read as soft organic edges yet stay byte-identical along any
 * shared border (seamless).
 */
export function dualGridTiles(
  size: number,
  grass: Ramp,
  soil: Ramp,
): { name: string; ras: Raster }[] {
  const out: { name: string; ras: Raster }[] = [];
  // Dark, slightly cool seam line (selout) sampled from the grass shadow.
  const seam = darken(grass.steps[0] as RGB, 0.28);
  // Warm gold sun-kiss for the lit top edge of grass — borrow the soil light.
  const sun = soil.light;

  for (let bits = 0; bits < 16; bits++) {
    const ras = new Raster(size, size);
    // Corner grass flags, normalised 0/1. Bit→corner: NW NE SW SE.
    const nw = bits & 8 ? 1 : 0;
    const ne = bits & 4 ? 1 : 0;
    const sw = bits & 2 ? 1 : 0;
    const se = bits & 1 ? 1 : 0;

    // First lay the soil base everywhere, then paint grass where covered.
    paintSoil(ras, size, soil);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Bilinear grass coverage from the four corners. u,v ∈ [0,1] over tile.
        const u = (x + 0.5) / size;
        const v = (y + 0.5) / size;
        const cov =
          nw * (1 - u) * (1 - v) +
          ne * u * (1 - v) +
          sw * (1 - u) * v +
          se * u * v;

        // Soft seam: wobble the threshold with a touch of periodic noise so the
        // border meanders organically, then dither across a Bayer band. The
        // noise tiles with `size`, so the seam stays continuous across borders.
        const wobble = (vnoise(x, y, 4, size) - 0.5) * 0.14;
        const thresh = 0.5 + wobble;
        const band = 0.16; // width of the dithered transition
        const d = cov - thresh;
        if (d < -band) continue; // pure soil
        if (d < band) {
          // Transition zone — ordered dither between grass and soil.
          const f = (d + band) / (2 * band); // 0..1 across the band
          if (bayer(x, y) > f) continue; // stays soil this pixel
          // Grass pixel inside the dither band → render as a shaded blade tip.
          ras.set(x, y, grassPixel(x, y, grass, size, /* edge */ true));
          continue;
        }
        // Interior grass.
        ras.set(x, y, grassPixel(x, y, grass, size, false));
      }
    }

    // SELOUT seam + sun-kissed top edge: walk every grass pixel, darken its
    // soil-facing lower/side borders, brighten where soil sits directly above
    // (a top edge catching light).
    accentSeams(ras, size, grass, seam, sun);

    out.push({ name: `tile:grass-soil:${String(bits)}`, ras });
  }
  return out;
}

/** Warm dappled soil: a 3-tone speckle from blended periodic noise (no grid). */
function paintSoil(ras: Raster, size: number, soil: Ramp): void {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Soft clumps (low-freq) + fine grit (per-pixel periodic hash).
      const clump = vnoise(x, y, 6, size);
      const grit = fleck(x, y, size, 11);
      let c: RGB;
      if (clump > 0.64)
        c = mix(soil.mid, soil.light, 0.5); // raised, sunlit
      else if (clump < 0.3)
        c = soil.steps[1] as RGB; // hollow, shaded
      else c = soil.mid;
      // Sparse darker grit flecks (pebbles / cracks) — deterministic, sparse.
      if (grit > 0.93) c = soil.steps[0] as RGB;
      else if (grit < 0.04) c = mix(soil.mid, soil.light, 0.85);
      ras.set(x, y, c);
    }
  }
}

/**
 * One grass pixel rendered as part of a vertical TUFT. Each column belongs to a
 * tuft whose lit tip sits at a per-column vertical offset, so the bright tips
 * scatter instead of lining up into horizontal stripes. Brightness falls from
 * the tip down to the shaded root (cluster shading along the blade). The tuft
 * rhythm + offsets are periodic with `P`, so the field tiles seamlessly.
 */
function grassPixel(
  x: number,
  y: number,
  grass: Ramp,
  P: number,
  edge: boolean,
): RGB {
  // Blade height that divides the tile (P % 6 === 0 for 24) → seamless wrap.
  const bladeP = P % 6 === 0 ? 6 : 4;
  // Each column's tuft is shifted vertically by a periodic per-column offset so
  // tips don't form a horizontal band. Uses hashWrap → identical at x and x+P.
  const colShift = Math.floor(hashWrap(x, 0, P) * bladeP);
  const cell = (((y + colShift) % bladeP) + bladeP) % bladeP; // 0 = lit tip
  // Brightness falls tip→root. Hue-shifted ramp gives gold tip / teal root.
  let t = 0.97 - (cell / (bladeP - 1)) * 0.8;
  // Tuft identity: a low-freq noise picks lush (lighter) vs shaded clumps so the
  // sward reads as overlapping clusters, not a flat sheet.
  const clump = vnoise(x, y, 6, P);
  if (clump > 0.62) t = Math.min(1, t + 0.14);
  else if (clump < 0.34) t = Math.max(0, t - 0.12);
  // A 1px-wide darker furrow between some columns separates adjacent blades.
  if (hashWrap(x + 1, 0, P) < 0.22 && cell >= bladeP - 2) {
    t = Math.max(0, t - 0.14);
  }
  // Sparse bright flecks (dew / sun glints) on tips only — periodic.
  if (cell === 0 && fleck(x, y, P, 5) > 0.93) t = 1;
  if (edge) t = Math.min(1, t + 0.08);
  return shade(grass, Math.max(0, Math.min(1, t)));
}

/**
 * Selout pass: 1px darker rim where grass meets soil on the sides/below, and a
 * brightened sun-kiss on grass pixels whose UPPER neighbour is soil (the top of
 * a clump catching light). Operates on a snapshot so it's order-independent.
 */
function accentSeams(
  ras: Raster,
  size: number,
  grass: Ramp,
  seam: RGB,
  sun: RGB,
): void {
  const snap = new Uint8ClampedArray(ras.data);
  const isGrass = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= size || y >= size) return true; // tile abuts grass
    const i = (y * size + x) * 4;
    // Grass pixels are the green family — detect by green dominance over the
    // warm soil; cheap + robust for these two ramps.
    const r = snap[i] ?? 0;
    const g = snap[i + 1] ?? 0;
    const b = snap[i + 2] ?? 0;
    return g > r && g >= b;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!isGrass(x, y)) continue;
      const soilBelow = !isGrass(x, y + 1);
      const soilSide = !isGrass(x - 1, y) || !isGrass(x + 1, y);
      const soilAbove = !isGrass(x, y - 1);
      if (soilBelow || soilSide)
        ras.set(x, y, seam); // grounded shadow rim
      else if (soilAbove) ras.set(x, y, mix(grass.light, sun, 0.4)); // sun-kiss
    }
  }
}

// ── Art-Nouveau reclamation overlay ───────────────────────────────────────────

/**
 * Geometric solar-tech tile progressively reclaimed by vines/moss across
 * coverage 0..4. The panel is a seamless hexagonal lattice with a metallic ramp
 * (lit top-left, shaded bottom-right + dark selout struts). Growth creeps in
 * from the LEFT and BOTTOM edges using periodic Art-Nouveau tendril curves, so
 * the creep front is continuous across neighbouring tiles. Moss settles as
 * dithered fill in the lattice crevices first, then climbs the struts.
 */
export function reclamationTiles(
  size: number,
  tech: Ramp,
  vine: Ramp,
): { name: string; ras: Raster }[] {
  const out: { name: string; ras: Raster }[] = [];
  // Lit edge for the panel: warm-cool teal highlight. Strut selout: deep shadow.
  const strut = darken(tech.steps[0] as RGB, 0.25);
  const rim = tech.light;
  // Moss accent — gold-touched leaf tips on the vine ramp.
  const leafTip = vine.light;

  for (let cov = 0; cov <= 4; cov++) {
    const ras = new Raster(size, size);
    paintPanel(ras, size, tech, strut, rim);
    if (cov > 0) creepVines(ras, size, cov, vine, leafTip);
    out.push({ name: `reclaim:panel:${String(cov)}`, ras });
  }
  return out;
}

/**
 * Seamless hex-lattice solar panel. The cells are a brick-offset hex grid built
 * from world-modular coordinates; each cell is shaded by a directional gradient
 * (top-left lit, bottom-right shaded) so the metal reads as bevelled. Struts get
 * a dark selout with a 1px lit highlight on their upper-left face.
 */
function paintPanel(
  ras: Raster,
  size: number,
  tech: Ramp,
  strut: RGB,
  rim: RGB,
): void {
  const CW = 8; // cell width
  const RH = 6; // row height
  for (let y = 0; y < size; y++) {
    const row = Math.floor(y / RH);
    const offset = (row & 1) * (CW / 2); // brick offset → hex feel
    for (let x = 0; x < size; x++) {
      // Local coordinates within a cell (world-modular → tiles seamlessly).
      const lx = (((x + offset) % CW) + CW) % CW;
      const ly = ((y % RH) + RH) % RH;
      const onVStrut = lx === 0 || lx === CW - 1;
      const onHStrut = ly === 0;
      if (onVStrut || onHStrut) {
        // Strut: dark selout, but the top/left face catches the teal rim light.
        const lit = ly === 0 || lx === 0;
        ras.set(x, y, lit ? mix(strut, rim, 0.45) : strut);
        continue;
      }
      // Cell interior: bevelled metal. Distance from the lit (top-left) corner
      // drives the ramp — close = highlight, far = shadow.
      const fx = lx / (CW - 1);
      const fy = ly / (RH - 1);
      const dlit = (fx + fy) * 0.5; // 0 at top-left, 1 at bottom-right
      // Hue-shifted ramp lookup; add a faint cell-centre glint (panel sheen).
      let t = 0.78 - dlit * 0.62;
      const glint = Math.abs(fx - 0.32) + Math.abs(fy - 0.32);
      if (glint < 0.18) t = 0.95; // small specular highlight, top-left of cell
      // Subtle micro-dither across the bevel band so the ramp steps don't band.
      if (bayer(x, y) > 0.78 && dlit > 0.3 && dlit < 0.7) t -= 0.1;
      ras.set(x, y, shade(tech, Math.max(0, Math.min(1, t))));
    }
  }
}

/**
 * Creeping reclamation, fully tileable. Moss settles wherever a PERIODIC
 * "wetness" field (low-frequency noise biased toward the lattice crevices)
 * exceeds a coverage-driven threshold, so raising `cov` advances the carpet
 * organically while every edge stays continuous across tiles. The Art-Nouveau
 * "creep from the edge" reading comes from whiplash tendrils that WRAP around
 * the tile borders (off one edge, on the opposite) plus leaf tufts.
 */
function creepVines(
  ras: Raster,
  size: number,
  cov: number,
  vine: Ramp,
  leafTip: RGB,
): void {
  const reach = cov / 5; // 0.2 .. 0.8
  // Coverage threshold: lower → more moss. cov 1 leaves most panel bare; cov 4
  // is a lush carpet with only glints of tech showing through.
  const thresh = 0.92 - reach * 0.78;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Periodic wetness field: two octaves so it has both broad damp patches
      // and fine grain. Both octaves tile with `size`.
      const broad = vnoise(x, y, 8, size);
      const fine = vnoise(x, y, 4, size);
      // Moss loves crevices: the lattice strut lines (lx/ly near a cell border)
      // hold more growth. Recover the cell phase exactly as paintPanel does.
      const crevice = crevBias(x, y);
      const wet = broad * 0.55 + fine * 0.25 + crevice * 0.3;
      // Ordered dither at the growth FRONT so the edge of the carpet stipples
      // softly into the panel instead of a hard line.
      const margin = wet - thresh;
      if (margin < -0.04) continue; // bare panel
      if (margin < 0.04 && bayer(x, y) > (margin + 0.04) / 0.08) continue;

      // Cluster shading: lit on raised clumps (high broad noise), shaded deep in
      // crevices — hue-shifted by the vine ramp (cool shadow, warm-gold tip).
      let t = 0.42 + (broad - 0.5) * 0.7 + crevice * 0.18;
      if (fine > 0.74) t += 0.16; // sun-catching clump crown
      ras.set(x, y, shade(vine, Math.max(0, Math.min(1, t))));
    }
  }

  // Art-Nouveau whiplash tendrils, wrapping for seamlessness. Count grows with
  // coverage; each curve is deterministic (hash, no Rng) and inside the carpet.
  const tendrils = cov + 1;
  for (let k = 0; k < tendrils; k++) {
    drawTendril(ras, size, k, cov, reach, vine, leafTip);
  }
}

/** Extra moss "wetness" near lattice struts — mirrors paintPanel's cell phase. */
function crevBias(x: number, y: number): number {
  const CW = 8;
  const RH = 6;
  const row = Math.floor(y / RH);
  const offset = (row & 1) * (CW / 2);
  const lx = (((x + offset) % CW) + CW) % CW;
  const ly = ((y % RH) + RH) % RH;
  // Distance to the nearest strut (cell border) → 1 on a strut, ~0 mid-cell.
  const dx = Math.min(lx, CW - lx);
  const dy = Math.min(ly, RH - ly);
  const near = Math.min(dx, dy);
  return near <= 1 ? 0.5 : near <= 2 ? 0.2 : 0;
}

/** One whiplash tendril: a quadratic-ish arc of vine pixels with leaf tufts. */
function drawTendril(
  ras: Raster,
  size: number,
  k: number,
  cov: number,
  reach: number,
  vine: Ramp,
  leafTip: RGB,
): void {
  // Anchor along the left or bottom edge, alternating, spaced deterministically.
  const fromBottom = k % 2 === 0;
  const slot = (hash01(k * 31 + 7, cov * 13 + 3) * 0.7 + 0.15) * size;
  const len = Math.floor((0.35 + reach * 0.45) * size);
  const curl = (hash01(k * 17 + 1, cov + 9) - 0.5) * 1.6; // whiplash swing
  const dark = darken(vine.steps[0] as RGB, 0.15);
  const wrap = (n: number): number => ((n % size) + size) % size;

  for (let s = 0; s < len; s++) {
    const tt = s / Math.max(1, len - 1);
    // Whiplash S-curve. Coordinates WRAP modulo the tile so a tendril leaving
    // one edge re-enters the opposite edge → the curve is seamless across tiles.
    const swing = Math.sin(tt * Math.PI * 1.3) * curl * 6;
    const px = fromBottom ? wrap(slot + swing) : wrap(s);
    const py = fromBottom ? wrap(size - 1 - s) : wrap(slot + swing);
    // Vine stem: 1px lit core with a darker selout shadow toward the light-away
    // side, so the stem reads as rounded.
    ras.set(px, py, shade(vine, 0.58 + tt * 0.12));
    ras.set(wrap(px + 1), wrap(py + 1), dark);
    // Leaf tufts every few steps, alternating sides — the Art-Nouveau flourish.
    if (s > 2 && s % 4 === (k & 1)) {
      const side = s % 8 < 4 ? 1 : -1;
      leaf(ras, px, py, side, size, vine, leafTip);
    }
  }
}

/** A tiny teardrop leaf, lit on top, anchored at (cx,cy); coords wrap on `P`. */
function leaf(
  ras: Raster,
  cx: number,
  cy: number,
  dir: number,
  P: number,
  vine: Ramp,
  tip: RGB,
): void {
  const w = (n: number): number => ((n % P) + P) % P;
  ras.set(w(cx + dir), cy, shade(vine, 0.5));
  ras.set(w(cx + dir * 2), cy, shade(vine, 0.62));
  ras.set(w(cx + dir * 2), w(cy - 1), tip); // lit tip
  ras.set(w(cx + dir), w(cy + 1), darken(vine.steps[0] as RGB, 0.1)); // base
}
