import process from "node:process";

interface Job {
  name: string;
  cmd: string[];
}

const jobs: Job[] = [
  { name: "tsgo", cmd: ["bunx", "tsgo", "--noEmit"] },
  { name: "biome", cmd: ["bunx", "biome", "check"] },
  {
    name: "css",
    cmd: ["bunx", "stylelint", "--max-warnings", "0", "src/**/*.css"],
  },
  {
    name: "html",
    cmd: [
      "bunx",
      "superhtml",
      "check",
      "index.html",
      "games/crown.html",
      "games/flux.html",
      "games/lex.html",
    ],
  },
  { name: "kt", cmd: ["bunx", "ktlint", "android/**/*.kt"] },
];

const t0 = performance.now();
const procs = jobs.map((j) =>
  Bun.spawn(j.cmd, { stdout: "pipe", stderr: "pipe" }),
);
const results = await Promise.all(
  procs.map(async (p, i) => {
    const [out, err, exit] = await Promise.all([
      new Response(p.stdout).text(),
      new Response(p.stderr).text(),
      p.exited,
    ]);
    return { job: jobs[i]!, exit, out, err };
  }),
);

let failed = false;
for (const r of results) {
  const ms = (performance.now() - t0).toFixed(0);
  const tag = r.exit === 0 ? "ok " : "FAIL";
  console.log(`[${tag}] ${r.job.name} (${ms}ms total)`);
  if (r.exit !== 0) {
    failed = true;
    if (r.out) process.stdout.write(r.out);
    if (r.err) process.stderr.write(r.err);
  }
}

process.exit(failed ? 1 : 0);
