/**
 * PixiJS v8 stage + baked-atlas loader (design docs/design/03, audit VH-2/VH-3).
 *
 * Renderer contract: PixiJS v8 has NO automatic WebGL→Canvas2D fallback, so we
 * prefer the WebGLRenderer and, only if GL init fails, fall back to the
 * experimental canvas renderer (pixi ≥8.16). Atlas frames are crisp pixels
 * (`scaleMode: 'nearest'` + `roundPixels`). Per-entry colour would be `sprite.tint`
 * / a cached RenderTexture — never a live per-sprite filter (VH-3).
 */

import {
  Application,
  Assets,
  Rectangle,
  Sprite,
  Texture,
  TextureSource,
} from "pixi.js";
import { BASE } from "../shared/base";

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
  const sheet = (await Assets.load(`${baseUrl}art/atlas.png`)) as Texture;
  const source = sheet.source;
  source.scaleMode = "nearest";

  const cache = new Map<string, Texture>();
  for (const [name, f] of Object.entries(meta.frames)) {
    cache.set(
      name,
      new Texture({ source, frame: new Rectangle(f.x, f.y, f.w, f.h) }),
    );
  }
  return {
    texture: (name) => cache.get(name) ?? Texture.EMPTY,
    sprite: (name, ax = 0.5, ay = 1) => {
      const s = new Sprite(cache.get(name) ?? Texture.EMPTY);
      s.anchor.set(ax, ay);
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
