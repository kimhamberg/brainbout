# README Redesign: Phone Frame + Dynamic Stats

## 1. Pixel-style Phone Frame

Create a static SVG phone bezel in Pixel 9 style:
- Thin uniform bezels (~3% of width)
- Large rounded corners (device-level ~40px radius)
- Centered punch-hole camera cutout (small circle, top center)
- Subtle side buttons (power, volume) as thin rounded rects
- Dark frame color (#1a1a1a) with subtle edge highlight
- Drop shadow for depth

File: `docs/phone-frame.svg` (static, committed once)

### Compositing in screenshot script

`scripts/screenshot.ts` changes:
1. Add `sharp` as a dev dependency
2. After Playwright captures the raw screenshot (480x640):
   - Render `phone-frame.svg` to PNG at target size using sharp
   - Composite the screenshot into the screen area
   - Output final `docs/screenshot.png`

The SVG uses a transparent screen area so the screenshot shows through.

## 2. Dynamic README via Template

### Template: `README.md.tpl`

Markdown file with `{{PLACEHOLDER}}` tokens:

| Placeholder       | Source                                     |
| ----------------- | ------------------------------------------ |
| `{{TEST_COUNT}}`  | vitest --reporter=json, count tests        |
| `{{TEST_FILES}}`  | vitest --reporter=json, count test suites  |
| `{{GAME_COUNT}}`  | count `games/*.html`                       |
| `{{SOUND_COUNT}}` | count `public/sounds/*.wav`                |
| `{{LINT_TOOLS}}`  | hardcoded list (changes rarely)            |

### Generator: `scripts/readme-stats.ts`

TypeScript script that:
1. Runs `npx vitest run --reporter=json` and parses output
2. Globs for countable files
3. Reads `README.md.tpl`, replaces placeholders, writes `README.md`

### CI integration

Extend the screenshot workflow (or add a step) to also run the README generator after screenshot capture, then commit both if changed.

## 3. README Content Updates

- Lint section: add ruff (Python) to the description
- Stack section: add sound generation (NumPy + SciPy + Pedalboard)
- Requirements: add uv (Python scripts)
- Fix test file count (will be auto-generated anyway)
- Update build table if needed
