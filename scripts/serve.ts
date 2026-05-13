import { join } from "node:path";

export const COOP_COEP_HEADERS = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

const ROOT_FILES = new Set([
  "/favicon.svg",
  "/apple-touch-icon.png",
  "/manifest.json",
]);

const STOCKFISH_RE = /^\/stockfish\/(.+)$/u;

/** Resolve a request pathname to an on-disk file under the repo. */
export function resolveAsset(root: string, pathname: string): string {
  const sf = STOCKFISH_RE.exec(pathname);
  if (sf) {
    return join(root, "node_modules/stockfish/bin", sf[1]!);
  }
  if (ROOT_FILES.has(pathname)) {
    return join(root, pathname);
  }
  return join(root, "public", pathname);
}

/** Fallback fetch handler: serve files from `root` using {@link resolveAsset}. */
export function assetFetch(root: string, opts: { headers?: HeadersInit } = {}) {
  return async (req: Request): Promise<Response> => {
    const { pathname } = new URL(req.url);
    const f = Bun.file(resolveAsset(root, pathname));
    if (await f.exists()) {
      return new Response(f, opts.headers ? { headers: opts.headers } : {});
    }
    return new Response("Not Found", { status: 404 });
  };
}
