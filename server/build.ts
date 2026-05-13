import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import process from "node:process";
import { Glob } from "bun";

const ROOT = join(import.meta.dirname, "..");
const DIST = join(ROOT, "dist");

const files = Array.from(
  new Glob("**/*").scanSync({ cwd: DIST, onlyFiles: true }),
);

const dir = mkdtempSync(join(tmpdir(), "brainbout-"));
const entry = join(dir, "entry.ts");

const imports = files
  .map(
    (f, i) =>
      `import f${i} from "${relative(dir, join(DIST, f))}" with { type: "file" };`,
  )
  .join("\n");

const routes = files
  .map((f, i) => {
    const route = `/${f.replaceAll("\\", "/")}`;
    return `  "${route}": f${i},${route === "/index.html" ? `\n  "/": f${i},` : ""}`;
  })
  .join("\n");

writeFileSync(
  entry,
  `// @ts-nocheck
${imports}
import { spawn } from "node:child_process";
import process from "node:process";
import { file, serve } from "bun";

const routes: Record<string, string> = {
${routes}
};

const HEADERS = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

serve({
  port: 8960,
  hostname: "127.0.0.1",
  fetch(req: Request) {
    const { pathname } = new URL(req.url);
    const path = routes[pathname] ?? routes["/index.html"];
    return path ? new Response(file(path), { headers: HEADERS }) : new Response("Not found", { status: 404 });
  },
});

const url = "http://127.0.0.1:8960";
const opener =
  process.platform === "darwin" ? ["open", url]
  : process.platform === "win32" ? ["cmd", "/c", "start", url]
  : ["xdg-open", url];
spawn(opener[0]!, opener.slice(1), { stdio: "ignore", detached: true }).unref();
`,
);

const TARGETS: Record<string, string> = {
  "brainbout-linux-amd64": "bun-linux-x64",
  "brainbout-windows-amd64.exe": "bun-windows-x64",
};

const requested = process.argv[2];
const builds = requested
  ? [{ outfile: requested, target: TARGETS[requested] ?? "bun-linux-x64" }]
  : [
      {
        outfile: "brainbout",
        target:
          process.platform === "win32"
            ? "bun-windows-x64"
            : process.platform === "darwin"
              ? "bun-darwin-x64"
              : "bun-linux-x64",
      },
    ];

for (const { outfile, target } of builds) {
  const proc = Bun.spawnSync({
    cmd: [
      "bun",
      "build",
      "--compile",
      `--target=${target}`,
      "--minify",
      entry,
      "--outfile",
      join(ROOT, outfile),
    ],
    stdout: "inherit",
    stderr: "inherit",
  });
  if (proc.exitCode !== 0) {
    process.exit(proc.exitCode ?? 1);
  }
}
