/**
 * PixiJS v8 stage + baked-atlas loader (design docs/design/03, audit VH-2/VH-3).
 *
 * Renderer contract: PixiJS v8 has NO automatic WebGL→Canvas2D fallback, so we
 * prefer the WebGLRenderer and, only if GL init fails, fall back to the
 * experimental canvas renderer (pixi ≥8.16). Atlas frames are crisp pixels
 * (`scaleMode: 'nearest'` + `roundPixels`). Per-entry colour would be `sprite.tint`
 * / a cached RenderTexture — never a live per-sprite filter (VH-3).
 */

// CSP-safe shader sync: replaces pixi's `new Function` codegen so a strict
// Content-Security-Policy (no 'unsafe-eval') still runs the renderer. Rides the
// lazy pixi chunk, so the boot shell is unaffected.
import "pixi.js/unsafe-eval";
import {
  Application,
  Assets,
  Rectangle,
  Sprite,
  Texture,
  TextureSource,
} from "pixi.js";
import { hueDeltaFor, type Species, templateKey } from "../content/species";
import { BASE } from "../shared/base";
import { hueBucket, hueRotate, moonlit } from "./recolor";

/**
 * pixi.js is loaded LAZILY: the whole render layer (this module + the zone
 * blocks + pixi, with named imports so pixi stays tree-shaken) is reached only
 * through a dynamic `import()` from each verdant entry, so it code-splits into
 * an on-demand chunk and never sits in the boot shell (audit VH-6). The
 * verdant build enables `splitting`; the bundle-size gate's BOOT column asserts
 * pixi stays out of the eager graph.
 */

export interface AtlasFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface AtlasMeta {
  size: { w: number; h: number };
  frames: Record<string, AtlasFrame>;
}

export interface Atlas {
  /** A sub-texture for a baked frame name (Texture.EMPTY if absent). */
  texture(name: string): Texture;
  /** A ready-to-add sprite for a frame, anchored bottom-centre by default. */
  sprite(name: string, anchorX?: number, anchorY?: number): Sprite;
  /**
   * A sprite for a species: its bounded body-plan template, hue-rotated toward
   * the species hue (and moonlit when dormant), cached per (template, bucket).
   * The atlas stays a fixed size regardless of how many species exist (Q2/VH-3).
   */
  speciesSprite(species: Species, dormant?: boolean): Sprite;
  names(): string[];
}

export interface Stage {
  app: Application;
  atlas: Atlas;
  /** 'webgl' (primary) or 'canvas' (experimental reduced mode, VH-2). */
  rendererKind: "webgl" | "canvas";
}

/** Crisp pixels everywhere by default. */
TextureSource.defaultOptions.scaleMode = "nearest";

async function loadAtlas(baseUrl: string): Promise<Atlas> {
  const meta = (await fetch(`${baseUrl}art/atlas.frames.json`).then((r) =>
    r.json(),
  )) as AtlasMeta;
  const pngUrl = `${baseUrl}art/atlas.png`;
  const sheet = (await Assets.load(pngUrl)) as Texture;
  const source = sheet.source;
  source.scaleMode = "nearest";
  // Keep a bitmap of the sheet so per-species recolour can read template pixels.
  const bitmap = await createImageBitmap(await (await fetch(pngUrl)).blob());

  const cache = new Map<string, Texture>();
  for (const [name, f] of Object.entries(meta.frames)) {
    cache.set(
      name,
      new Texture({ source, frame: new Rectangle(f.x, f.y, f.w, f.h) }),
    );
  }

  // Per-(template, dormant, hue-bucket) recoloured textures — built once, reused.
  const recolorCache = new Map<string, Texture>();
  function speciesTexture(species: Species, dormant: boolean): Texture {
    const name = templateKey(species);
    const f = meta.frames[name];
    if (!f) return cache.get(name) ?? Texture.EMPTY;
    const delta = hueBucket(hueDeltaFor(species));
    const key = `${name}:${dormant ? "d" : "a"}:${String(delta)}`;
    const hit = recolorCache.get(key);
    if (hit) return hit;

    const cv = document.createElement("canvas");
    cv.width = f.w;
    cv.height = f.h;
    const ctx = cv.getContext("2d");
    if (!ctx) return cache.get(name) ?? Texture.EMPTY;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bitmap, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
    const img = ctx.getImageData(0, 0, f.w, f.h);
    const recoloured = dormant
      ? moonlit(hueRotate(img.data, delta))
      : hueRotate(img.data, delta);
    img.data.set(recoloured);
    ctx.putImageData(img, 0, 0);
    const tex = Texture.from(cv);
    tex.source.scaleMode = "nearest";
    recolorCache.set(key, tex);
    return tex;
  }

  return {
    texture: (name) => cache.get(name) ?? Texture.EMPTY,
    sprite: (name, ax = 0.5, ay = 1) => {
      const s = new Sprite(cache.get(name) ?? Texture.EMPTY);
      s.anchor.set(ax, ay);
      return s;
    },
    speciesSprite: (species, dormant = false) => {
      const s = new Sprite(speciesTexture(species, dormant));
      s.anchor.set(0.5, 1);
      return s;
    },
    names: () => [...cache.keys()],
  };
}

export interface StageOptions {
  width: number;
  height: number;
  /** Catppuccin Frappe base by default. */
  background?: string;
}

export async function createStage(
  container: HTMLElement,
  opts: StageOptions,
): Promise<Stage> {
  const app = new Application();
  const common = {
    width: opts.width,
    height: opts.height,
    background: opts.background ?? "#303446",
    antialias: false,
    roundPixels: true,
    autoDensity: true,
    resolution: Math.max(1, Math.min(3, window.devicePixelRatio || 1)),
  };

  try {
    await app.init({ ...common, preference: "webgl" });
  } catch {
    // VH-2: no auto Canvas2D fallback in v8 — try the experimental canvas
    // renderer explicitly (reduced mode), else rethrow.
    await app.init({ ...common, preference: "canvas" });
  }
  // The WebGLRenderer exposes a live `gl` context; the canvas renderer doesn't.
  const rendererKind: "webgl" | "canvas" =
    "gl" in app.renderer ? "webgl" : "canvas";

  container.appendChild(app.canvas);
  const atlas = await loadAtlas(BASE);
  return { app, atlas, rendererKind };
}
