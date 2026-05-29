/**
 * Golden-hash manifest (design docs/design/01, audit VH-11). SHA-256 of each
 * committed PNG + a timestamp-free combined digest. The test gate asserts the
 * digest === a checked-in constant on the pinned Bun toolchain.
 */

import { createHash } from "node:crypto";

export function sha256(buf: Uint8Array | Uint8ClampedArray): string {
  return createHash("sha256").update(buf).digest("hex");
}

export interface AtlasManifest {
  seed: string;
  atlases: { file: string; sha256: string; frames: number }[];
  digest: string;
}

export function buildManifest(
  seed: string,
  atlases: { file: string; png: Uint8Array; frames: number }[],
): AtlasManifest {
  const entries = atlases.map((a) => ({
    file: a.file,
    sha256: sha256(a.png),
    frames: a.frames,
  }));
  const digest = sha256(
    new TextEncoder().encode(entries.map((e) => e.sha256).join("")),
  );
  return { seed, atlases: entries, digest };
}
