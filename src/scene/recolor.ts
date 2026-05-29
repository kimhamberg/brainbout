/**
 * Pure per-species recolour for the bounded template atlas (Q2 / audit VH-3).
 *
 * The atlas bakes a finite set of body-plan TEMPLATES per kingdom at a canonical
 * hue. Per-species identity is a HUE-ROTATION of the canonical template's pixels
 * toward the species hue (delta is small — kingdom bands are narrow — so the
 * baked cool-shadow/warm-light shading + accents survive, only the base hue
 * shifts). Done once per (template, hue-bucket) into a cached texture at load —
 * never a live per-sprite filter. `moonlit` is the dormant/asleep variant (R6).
 *
 * Pure functions over RGBA buffers → unit/fuzz testable, no DOM, no shaders.
 */

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else h = ((rn - gn) / d + 4) * 60;
  return [h, s, l];
}

function hue2rgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hn = (((h % 360) + 360) % 360) / 360;
  return [
    Math.round(hue2rgb(p, q, hn + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, hn) * 255),
    Math.round(hue2rgb(p, q, hn - 1 / 3) * 255),
  ];
}

/** Rotate every opaque pixel's hue by `deg` (preserves S, L, alpha). Pure. */
export function hueRotate(
  src: Uint8ClampedArray,
  deg: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const a = src[i + 3] ?? 0;
    out[i + 3] = a;
    if (a === 0) continue;
    const [h, s, l] = rgbToHsl(src[i] ?? 0, src[i + 1] ?? 0, src[i + 2] ?? 0);
    const [r, g, b] = hslToRgb(h + deg, s, l);
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
  }
  return out;
}

/**
 * Dormant / "moonlit" variant (R6): desaturate and pull hue toward cool teal so
 * a sleeping resident reads as hushed twilight — not grey-dead, not awake.
 */
export function moonlit(src: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const a = src[i + 3] ?? 0;
    out[i + 3] = a;
    if (a === 0) continue;
    const [h, s, l] = rgbToHsl(src[i] ?? 0, src[i + 1] ?? 0, src[i + 2] ?? 0);
    const coolH = h + (220 - h) * 0.5; // blend halfway toward teal-blue
    const [r, g, b] = hslToRgb(coolH, s * 0.4, Math.min(1, l * 0.95 + 0.05));
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
  }
  return out;
}

/** Quantise a hue delta into a small bucket so cached recolours are bounded. */
export function hueBucket(deg: number, quantum = 6): number {
  return Math.round(deg / quantum) * quantum;
}
