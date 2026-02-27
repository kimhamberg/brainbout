# README Redesign: Phone Frame + Dynamic Stats — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Wrap the hub screenshot in a realistic Pixel-style phone frame, auto-generate README stats from the codebase, and update README content to match current project state.

**Architecture:** SVG phone bezel composited with sharp onto the Playwright screenshot. README.md generated from a template (`README.md.tpl`) by a TypeScript script that extracts stats (test count, file counts, etc.) from the codebase. CI workflow auto-commits both screenshot and README on push to master.

**Tech Stack:** sharp (image compositing), tsx (script runner), Playwright (screenshot), vitest --reporter=json (test stats)

---

### Task 1: Create Pixel-style phone frame SVG

**Files:**
- Create: `docs/phone-frame.svg`

**Step 1: Create the SVG**

Create `docs/phone-frame.svg` — a Pixel 9-style phone frame with:
- Canvas size: 556x756 (480+38+38 width, 640+58+58 height — 38px side bezels, 58px top/bottom)
- Outer body: rounded rect with rx=40, fill #1a1a1a, subtle 1px #333 stroke for edge highlight
- Screen cutout: transparent rect at (38, 58) sized 480x640 with rx=8 (subtle inner corners)
- Punch-hole camera: circle at (278, 30) r=6, fill #111
- Power button: right side, rect at (554, 200) sized 2x60, rx=1, fill #2a2a2a
- Volume buttons: right side, rect at (554, 310) sized 2x40 and (554, 365) sized 2x40, same style
- Drop shadow via SVG filter: `<filter id="shadow">` with `feDropShadow dx=0 dy=4 stdDeviation=12 flood-opacity=0.3`

The screen area must be transparent (no fill) so the screenshot shows through when composited.

**Step 2: Verify visually**

Open `docs/phone-frame.svg` in a browser to verify it looks like a Pixel phone.

**Step 3: Commit**

```bash
git add docs/phone-frame.svg
git commit -m "feat: add Pixel-style phone frame SVG for screenshot"
```

---

### Task 2: Add sharp and composite screenshot into phone frame

**Files:**
- Modify: `scripts/screenshot.ts`
- Modify: `package.json` (via npm install)

**Step 1: Install sharp**

```bash
npm install --save-dev sharp
npm install --save-dev @types/sharp
```

**Step 2: Modify screenshot script**

In `scripts/screenshot.ts`, after the existing `page.screenshot({ path: OUTPUT })` line:

1. Import sharp at top: `import sharp from "sharp";`
2. Import path and readFile: `import { readFileSync } from "fs";` and `import { join } from "path";`
3. After `page.screenshot({ path: OUTPUT })`, add compositing:

```typescript
// Composite screenshot into phone frame
const FRAME_SVG = join(import.meta.dirname, "../docs/phone-frame.svg");
const BEZEL_X = 38; // left bezel width
const BEZEL_Y = 58; // top bezel height
const FRAME_W = WIDTH + BEZEL_X * 2;  // 556
const FRAME_H = HEIGHT + BEZEL_Y * 2; // 756

const framePng = await sharp(FRAME_SVG, { density: 72 })
  .resize(FRAME_W, FRAME_H)
  .png()
  .toBuffer();

const screenshotBuf = readFileSync(OUTPUT);

await sharp({
  create: {
    width: FRAME_W,
    height: FRAME_H,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([
    { input: screenshotBuf, left: BEZEL_X, top: BEZEL_Y },
    { input: framePng, left: 0, top: 0 },
  ])
  .png()
  .toFile(OUTPUT);

console.log(`Composited into phone frame (${FRAME_W}x${FRAME_H})`);
```

**Step 3: Run locally and verify**

```bash
npm run screenshot
```

Open `docs/screenshot.png` — should show the hub inside a Pixel-style phone frame.

**Step 4: Commit**

```bash
git add scripts/screenshot.ts package.json package-lock.json
git commit -m "feat: composite screenshot into Pixel phone frame with sharp"
```

---

### Task 3: Create README template with placeholders

**Files:**
- Create: `README.md.tpl`

**Step 1: Create the template**

Create `README.md.tpl` with the updated README content. Use `{{PLACEHOLDER}}` syntax for dynamic values:

```markdown
# Brainbout

[![CI](https://github.com/kimhamberg/brainbout/actions/workflows/ci.yml/badge.svg)](https://github.com/kimhamberg/brainbout/actions/workflows/ci.yml)

A daily brain workout. Train your brain, not your scroll thumb.

{{GAME_COUNT}} timed cognitive games in ~8 minutes. No accounts, no ads, no internet required. Progress tracked locally.

- **Chess960 Rapid** — 15+10 vs Stockfish
- **Reaction Grid** — fast-attention target clicking (60s)
- **Word Recall** — vocabulary with spaced repetition (120s)
- **Quick Math** — adaptive arithmetic (60s)

**[Play online](https://kimhamberg.github.io/brainbout/)** | [Linux](https://github.com/kimhamberg/brainbout/releases/latest/download/brainbout-linux-amd64) | [Windows](https://github.com/kimhamberg/brainbout/releases/latest/download/brainbout-windows-amd64.exe) | [Android](https://github.com/kimhamberg/brainbout/releases/latest/download/brainbout.apk)

![Screenshot](docs/screenshot.png)

## Requirements

- [Node.js](https://nodejs.org) 20+
- [uv](https://docs.astral.sh/uv/) (Python scripts)
- [Go](https://go.dev) 1.23+ (desktop builds only)
- [Android SDK](https://developer.android.com/studio) + [Gradle](https://gradle.org) (Android builds only)

## Quick start

\```
npm install
make dev
\```

## Build

| Target  | Command              | Output                       |
| ------- | -------------------- | ---------------------------- |
| Dev     | `make dev`           | `localhost:5173`             |
| Desktop | `make build-server`  | `chess960`                   |
| Linux   | `make build-linux`   | `chess960-linux-amd64`       |
| Windows | `make build-windows` | `chess960-windows-amd64.exe` |
| Android | `make build-android` | `app-debug.apk`              |
| Clean   | `make clean`         |                              |

The desktop build embeds all web assets into a single binary — no runtime dependencies.

## Lint

\```
make lint
\```

Runs ESLint (TypeScript), Stylelint (CSS), Ruff (Python), staticcheck + go vet (Go), ktlint (Kotlin), and Prettier (all files).

## Tests

\```
npm test
\```

{{TEST_COUNT}} tests across {{TEST_FILES}} files covering position generation, chess clock, cognitive games, engine parsing, timer, and progress tracking.

## Sound

{{SOUND_COUNT}} synthesised sounds generated with NumPy + SciPy + Pedalboard — modal wood synthesis for chess pieces, FM bells, additive warm tones.

\```
.venv/bin/python scripts/gen-sounds.py
\```

## Stack

- [Chessground](https://github.com/lichess-org/chessground) — board UI (rapid)
- [chessops](https://github.com/niklasf/chessops) — Chess960 move validation (rapid)
- [Stockfish WASM](https://github.com/nicfab/stockfish.wasm) — chess engine (rapid)
- [Vite](https://vite.dev) — multi-page build tooling
- [Catppuccin](https://github.com/catppuccin/catppuccin) — color theme (Frappe dark / Latte light)
- [Go](https://go.dev) — desktop server (single binary with embedded assets)
- [Kotlin](https://kotlinlang.org) + [Android WebView](https://developer.android.com/develop/ui/views/layout/webapps/webview) — mobile wrapper
- localStorage — progress tracking

## License

[GPL-3.0](LICENSE)
```

Note: The triple backticks in the template need to be actual backticks (the backslashes above are just escaping for this plan doc).

**Step 2: Commit**

```bash
git add README.md.tpl
git commit -m "feat: add README template with dynamic placeholders"
```

---

### Task 4: Create README stats generator script

**Files:**
- Create: `scripts/readme-stats.ts`

**Step 1: Write the script**

```typescript
import { execSync } from "child_process";
import { readFileSync, writeFileSync, readdirSync } from "fs";

const TPL = readFileSync("README.md.tpl", "utf-8");

// Test stats from vitest JSON reporter
const vitest = JSON.parse(
  execSync("npx vitest run --reporter=json", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }),
);
const testCount = vitest.numTotalTests;
const testFiles = vitest.numTotalTestSuites;

// File counts
const gameCount = readdirSync("games").filter((f: string) => f.endsWith(".html")).length;
const soundCount = readdirSync("public/sounds").filter((f: string) => f.endsWith(".wav")).length;

const readme = TPL
  .replace(/\{\{TEST_COUNT\}\}/g, String(testCount))
  .replace(/\{\{TEST_FILES\}\}/g, String(testFiles))
  .replace(/\{\{GAME_COUNT\}\}/g, String(gameCount))
  .replace(/\{\{SOUND_COUNT\}\}/g, String(soundCount));

writeFileSync("README.md", readme);

console.log(`README.md generated: ${testCount} tests, ${testFiles} files, ${gameCount} games, ${soundCount} sounds`);
```

**Step 2: Add npm script**

Add to `package.json` scripts:
```json
"readme": "tsx scripts/readme-stats.ts"
```

**Step 3: Run locally and verify**

```bash
npm run readme
```

Diff `README.md` to verify placeholders were replaced with correct values (57 tests, 9 files, 4 games, 9 sounds).

**Step 4: Commit**

```bash
git add scripts/readme-stats.ts package.json README.md
git commit -m "feat: auto-generate README from template with codebase stats"
```

---

### Task 5: Update CI workflow to auto-generate README

**Files:**
- Modify: `.github/workflows/screenshot.yml`

**Step 1: Add README generation step**

After the `npm run screenshot` step, add:

```yaml
      - run: npm run readme
```

Update the commit step to include README.md:

```yaml
      - name: Push screenshot and README if changed
        run: |
          git diff --quiet docs/screenshot.png README.md && echo "No changes" && exit 0
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add docs/screenshot.png README.md
          git commit -m "docs: auto-update screenshot and README [skip ci]"
          git push origin master
```

Also add `README.md.tpl` and `scripts/readme-stats.ts` to the paths trigger so changes to the template also trigger regeneration:

```yaml
    paths:
      - "src/**"
      - "index.html"
      - "games/**"
      - "scripts/screenshot.ts"
      - "scripts/readme-stats.ts"
      - "README.md.tpl"
      - "test/**"
```

**Step 2: Commit**

```bash
git add .github/workflows/screenshot.yml
git commit -m "ci: auto-generate README alongside screenshot on push"
```

---

### Task 6: Final verification and push

**Step 1: Run full lint**

```bash
make lint
npm test
```

**Step 2: Run screenshot + readme locally**

```bash
npm run screenshot
npm run readme
```

Verify `docs/screenshot.png` has the phone frame and `README.md` has correct stats.

**Step 3: Push branch**

```bash
git push
```
