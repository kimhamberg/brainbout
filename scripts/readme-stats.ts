import { execSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");

// 1. Run vitest and parse JSON output
const vitestJson = execSync("npx vitest run --reporter=json", {
  cwd: root,
  stdio: ["pipe", "pipe", "pipe"],
  encoding: "utf-8",
});

const vitest = JSON.parse(vitestJson) as {
  numTotalTests: number;
  testResults: unknown[];
};

const testCount = vitest.numTotalTests;
const testFiles = vitest.testResults.length;

// 2. Count games/*.html files
const gameCount = readdirSync(join(root, "games")).filter((f) =>
  f.endsWith(".html"),
).length;

// 3. Count public/sounds/*.wav files
const soundCount = readdirSync(join(root, "public", "sounds")).filter((f) =>
  f.endsWith(".wav"),
).length;

// 4. Read template, replace placeholders, write README.md
const template = readFileSync(join(root, "README.md.tpl"), "utf-8");

const readme = template
  .replace(/\{\{TEST_COUNT\}\}/gu, String(testCount))
  .replace(/\{\{TEST_FILES\}\}/gu, String(testFiles))
  .replace(/\{\{GAME_COUNT\}\}/gu, String(gameCount))
  .replace(/\{\{SOUND_COUNT\}\}/gu, String(soundCount));

writeFileSync(join(root, "README.md"), readme);
