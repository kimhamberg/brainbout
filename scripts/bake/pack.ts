/**
 * Shelf bin-packer → one atlas raster + a JSON frame-map (design docs/design/01).
 * Spike-minimal (fixed-width shelves); the real bakery can swap in MaxRects.
 */

import { Raster } from "./raster";

export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Packed {
  atlas: Raster;
  frames: Record<string, Frame>;
}

export function pack(
  items: { name: string; ras: Raster }[],
  atlasW = 512,
  pad = 1,
): Packed {
  const frames: Record<string, Frame> = {};
  let x = pad;
  let y = pad;
  let shelfH = 0;
  // first pass: lay out positions, track total height
  for (const { name, ras } of items) {
    if (x + ras.w + pad > atlasW) {
      x = pad;
      y += shelfH + pad;
      shelfH = 0;
    }
    frames[name] = { x, y, w: ras.w, h: ras.h };
    x += ras.w + pad;
    shelfH = Math.max(shelfH, ras.h);
  }
  const atlasH = y + shelfH + pad;
  const atlas = new Raster(atlasW, atlasH);
  for (const { name, ras } of items) {
    const f = frames[name] as Frame;
    atlas.blit(ras, f.x, f.y);
  }
  return { atlas, frames };
}
