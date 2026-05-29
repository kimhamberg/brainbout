/**
 * Dependency-free RGBA framebuffer for the build-time art bakery. Runs in plain
 * Bun (no DOM, no happy-dom → avoids the documented Worker+happy-dom segfault).
 * Pure pixel ops; sharp encodes the final PNG (mirrors scripts/gen-icons.ts).
 */

export type RGB = readonly [number, number, number];

export class Raster {
  readonly w: number;
  readonly h: number;
  readonly data: Uint8ClampedArray;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.data = new Uint8ClampedArray(w * h * 4);
  }

  private inB(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  set(x: number, y: number, c: RGB, a = 255): void {
    if (!this.inB(x, y)) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = a;
  }

  /** Alpha of pixel (0 if out of bounds). */
  alphaAt(x: number, y: number): number {
    if (!this.inB(x, y)) return 0;
    return this.data[(y * this.w + x) * 4 + 3] ?? 0;
  }

  fillRect(
    x0: number,
    y0: number,
    w: number,
    h: number,
    c: RGB,
    a = 255,
  ): void {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) this.set(x, y, c, a);
    }
  }

  /** Filled disc — the workhorse for rounded, cozy silhouettes. */
  disc(cx: number, cy: number, r: number, c: RGB, a = 255): void {
    const r2 = r * r;
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y <= r2) this.set(cx + x, cy + y, c, a);
      }
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, c: RGB, a = 255): void {
    let x = x0;
    let y = y0;
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x, y, c, a);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }

  /** Mirror the left half onto the right (vertical symmetry — the cozy cue). */
  mirrorX(): void {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < Math.floor(this.w / 2); x++) {
        const i = (y * this.w + x) * 4;
        const j = (y * this.w + (this.w - 1 - x)) * 4;
        for (let k = 0; k < 4; k++) this.data[j + k] = this.data[i + k] ?? 0;
      }
    }
  }

  /** 1px outline around every opaque pixel, in colour `c` (selout). */
  outline(c: RGB): void {
    const snapshot = new Uint8ClampedArray(this.data);
    const op = (x: number, y: number): boolean =>
      x >= 0 && y >= 0 && x < this.w && y < this.h
        ? (snapshot[(y * this.w + x) * 4 + 3] ?? 0) > 0
        : false;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (op(x, y)) continue;
        if (op(x - 1, y) || op(x + 1, y) || op(x, y - 1) || op(x, y + 1)) {
          this.set(x, y, c, 255);
        }
      }
    }
  }

  /** Composite `src` onto this raster at (dx, dy), source-over. */
  blit(src: Raster, dx: number, dy: number): void {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const a = src.alphaAt(x, y);
        if (a === 0) continue;
        const i = (y * src.w + x) * 4;
        this.set(
          dx + x,
          dy + y,
          [src.data[i] ?? 0, src.data[i + 1] ?? 0, src.data[i + 2] ?? 0],
          a,
        );
      }
    }
  }

  /** A small "z" glyph (top bar, diagonal, bottom bar) of side `s`, top-left at (x,y). */
  glyphZ(x: number, y: number, s: number, c: RGB): void {
    for (let i = 0; i < s; i++) {
      this.set(x + i, y, c); // top bar
      this.set(x + i, y + s - 1, c); // bottom bar
      this.set(x + (s - 1 - i), y + i, c); // diagonal
    }
  }

  /** Three rising "z z z" — the dormant/asleep cue (audit R6). */
  zzz(x: number, y: number, c: RGB): void {
    this.glyphZ(x, y, 3, c);
    this.glyphZ(x + 4, y - 4, 4, c);
    this.glyphZ(x + 9, y - 9, 5, c);
  }
}

/** 4×4 ordered Bayer matrix (0..15) — for hand-placed-looking dither bands. */
export const BAYER4: readonly number[] = [
  0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5,
];

export function bayer(x: number, y: number): number {
  return (BAYER4[(y & 3) * 4 + (x & 3)] ?? 0) / 16;
}
