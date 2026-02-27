# Catppuccin Latte/Frappe Theme Toggle — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:executing-plans to implement this plan task-by-task.

**Goal:** Add light/dark mode toggle using Catppuccin Latte (light) and Frappe (dark), with custom Catppuccin-complementary chess board colors.

**Architecture:** CSS custom properties switch via `data-theme` attribute on `<html>`. A shared `theme.ts` module handles detection (OS preference), persistence (localStorage), and toggling. Board squares use `conic-gradient` with CSS vars instead of hardcoded SVGs.

**Tech Stack:** Vanilla TypeScript, CSS custom properties, localStorage, matchMedia API.

---

### Task 1: Create theme module with test

**Files:**

- Create: `src/shared/theme.ts`
- Create: `test/theme.test.ts`

**Step 1: Write the failing test**

```typescript
// test/theme.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("theme", () => {
  let matchMediaMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");

    matchMediaMock = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal("matchMedia", matchMediaMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults to frappe when OS prefers dark", async () => {
    matchMediaMock.mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
    });
    const { initTheme } = await import("../src/shared/theme");
    initTheme();
    expect(document.documentElement.dataset.theme).toBe("frappe");
  });

  it("defaults to latte when OS prefers light", async () => {
    matchMediaMock.mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
    });

    vi.resetModules();
    const { initTheme } = await import("../src/shared/theme");
    initTheme();
    expect(document.documentElement.dataset.theme).toBe("latte");
  });

  it("uses localStorage override when set", async () => {
    localStorage.setItem("theme", "latte");
    matchMediaMock.mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
    });

    vi.resetModules();
    const { initTheme } = await import("../src/shared/theme");
    initTheme();
    expect(document.documentElement.dataset.theme).toBe("latte");
  });

  it("toggleTheme flips from frappe to latte", async () => {
    vi.resetModules();
    matchMediaMock.mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
    });
    const { initTheme, toggleTheme } = await import("../src/shared/theme");
    initTheme();
    toggleTheme();
    expect(document.documentElement.dataset.theme).toBe("latte");
    expect(localStorage.getItem("theme")).toBe("latte");
  });

  it("toggleTheme flips from latte to frappe", async () => {
    localStorage.setItem("theme", "latte");
    vi.resetModules();
    matchMediaMock.mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
    });
    const { initTheme, toggleTheme } = await import("../src/shared/theme");
    initTheme();
    toggleTheme();
    expect(document.documentElement.dataset.theme).toBe("frappe");
    expect(localStorage.getItem("theme")).toBe("frappe");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run test/theme.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// src/shared/theme.ts
type Theme = "latte" | "frappe";

function detect(): Theme {
  const saved = localStorage.getItem("theme");
  if (saved === "latte" || saved === "frappe") return saved;
  return matchMedia("(prefers-color-scheme: light)").matches
    ? "latte"
    : "frappe";
}

function apply(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

export function initTheme(): void {
  apply(detect());
  matchMedia("(prefers-color-scheme: light)").addEventListener(
    "change",
    (e) => {
      if (!localStorage.getItem("theme")) {
        apply(e.matches ? "latte" : "frappe");
      }
    },
  );
}

export function toggleTheme(): void {
  const current = document.documentElement.dataset.theme as Theme;
  const next: Theme = current === "frappe" ? "latte" : "frappe";
  localStorage.setItem("theme", next);
  apply(next);
}

export function renderToggle(container: HTMLElement): void {
  const btn = document.createElement("button");
  btn.id = "theme-btn";
  btn.className = "theme-toggle";
  btn.setAttribute("aria-label", "Toggle theme");
  btn.addEventListener("click", () => {
    toggleTheme();
    updateIcon(btn);
  });
  container.appendChild(btn);
  updateIcon(btn);
}

function updateIcon(btn: HTMLElement): void {
  const isLight = document.documentElement.dataset.theme === "latte";
  btn.innerHTML = isLight
    ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z"/></svg>`
    : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run test/theme.test.ts`
Expected: PASS (all 5 tests)

**Step 5: Commit**

```bash
git add src/shared/theme.ts test/theme.test.ts
git commit -m "feat: theme module with OS detection and toggle"
```

---

### Task 2: Update style.css with dual palettes and toggle button styles

**Files:**

- Modify: `src/style.css`

**Step 1: Replace `:root` with dual palette definitions**

Replace the existing `:root { ... }` block (lines 1-15) with:

```css
/* Catppuccin Frappé (dark) — https://catppuccin.com/palette (MIT) */
:root,
[data-theme="frappe"] {
  --ctp-base: #303446;
  --ctp-mantle: #292c3c;
  --ctp-surface0: #414559;
  --ctp-surface1: #51576d;
  --ctp-surface2: #626880;
  --ctp-text: #c6d0f5;
  --ctp-subtext0: #a5adce;
  --ctp-blue: #8caaee;
  --ctp-green: #a6d189;
  --ctp-red: #e78284;
  --ctp-yellow: #e5c890;
  --ctp-peach: #ef9f76;
}

/* Catppuccin Latte (light) */
[data-theme="latte"] {
  --ctp-base: #eff1f5;
  --ctp-mantle: #e6e9ef;
  --ctp-surface0: #ccd0da;
  --ctp-surface1: #bcc0cc;
  --ctp-surface2: #acb0be;
  --ctp-text: #4c4f69;
  --ctp-subtext0: #6c6f85;
  --ctp-blue: #1e66f5;
  --ctp-green: #40a02b;
  --ctp-red: #d20f39;
  --ctp-yellow: #df8e1d;
  --ctp-peach: #fe640b;
}
```

**Step 2: Add toggle button styles**

Append to `src/style.css`, after the `.skip-btn:hover` rule:

```css
.theme-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: none;
  border: 1px solid var(--ctp-surface1);
  border-radius: 4px;
  color: var(--ctp-subtext0);
  cursor: pointer;
}

.theme-toggle:hover {
  border-color: var(--ctp-blue);
  color: var(--ctp-text);
}
```

**Step 3: Commit**

```bash
git add src/style.css
git commit -m "feat: dual Catppuccin palettes and toggle button styles"
```

---

### Task 3: Create board-theme.css with Catppuccin board overrides

**Files:**

- Create: `src/shared/board-theme.css`

**Step 1: Create the board theme file**

```css
/* Catppuccin-complementary chess board — overrides chessground.brown.css */

/*
 * Board squares via conic-gradient + CSS vars (replaces hardcoded SVG).
 * Frappe: cool slate (surface1/surface0)
 * Latte: soft gray (mantle/surface1)
 */

:root,
[data-theme="frappe"] {
  --board-light: #51576d;
  --board-dark: #414559;
  --board-last-move: rgba(140, 170, 238, 0.35);
  --board-selected: rgba(140, 170, 238, 0.4);
  --board-move-dest: 166, 209, 137;
  --board-check: 231, 130, 132;
  --board-premove: 239, 159, 118;
  --board-coord-dark: rgba(198, 208, 245, 0.8);
  --board-coord-light: rgba(65, 69, 89, 0.8);
}

[data-theme="latte"] {
  --board-light: #e6e9ef;
  --board-dark: #bcc0cc;
  --board-last-move: rgba(30, 102, 245, 0.25);
  --board-selected: rgba(30, 102, 245, 0.3);
  --board-move-dest: 64, 160, 43;
  --board-check: 210, 15, 57;
  --board-premove: 254, 100, 11;
  --board-coord-dark: rgba(76, 79, 105, 0.8);
  --board-coord-light: rgba(188, 192, 204, 0.8);
}

/* Board squares */
cg-board {
  background-color: var(--board-light);
  background-image: conic-gradient(
    var(--board-dark) 25%,
    var(--board-light) 0 50%,
    var(--board-dark) 0 75%,
    var(--board-light) 0
  );
  background-size: 25% 25%;
}

/* Interactive states */
cg-board square.move-dest {
  background: radial-gradient(
    rgba(var(--board-move-dest), 0.5) 22%,
    rgb(var(--board-move-dest)) 0,
    rgba(0, 0, 0, 0.3) 0,
    rgba(0, 0, 0, 0) 0
  );
}

cg-board square.oc.move-dest {
  background: radial-gradient(
    transparent 0%,
    transparent 80%,
    rgba(var(--board-move-dest), 0.3) 80%
  );
}

cg-board square.move-dest:hover {
  background: rgba(var(--board-move-dest), 0.3);
}

cg-board square.premove-dest {
  background: radial-gradient(
    rgba(var(--board-premove), 0.5) 22%,
    rgb(var(--board-premove)) 0,
    rgba(0, 0, 0, 0.3) 0,
    rgba(0, 0, 0, 0) 0
  );
}

cg-board square.oc.premove-dest {
  background: radial-gradient(
    transparent 0%,
    transparent 80%,
    rgba(var(--board-premove), 0.2) 80%
  );
}

cg-board square.premove-dest:hover {
  background: rgba(var(--board-premove), 0.2);
}

cg-board square.last-move {
  background-color: var(--board-last-move);
}

cg-board square.selected {
  background-color: var(--board-selected);
}

cg-board square.check {
  background: radial-gradient(
    ellipse at center,
    rgba(var(--board-check), 1) 0%,
    rgba(var(--board-check), 0.8) 25%,
    rgba(var(--board-check), 0) 89%,
    rgba(var(--board-check), 0) 100%
  );
}

cg-board square.current-premove {
  background-color: rgba(var(--board-premove), 0.5);
}

/* Coordinate label colors */
.orientation-white .ranks :nth-child(odd),
.orientation-white .files :nth-child(even),
.orientation-black .ranks :nth-child(even),
.orientation-black .files :nth-child(odd),
coords.squares:nth-of-type(odd) :nth-child(even),
coords.squares:nth-of-type(even) :nth-child(odd) {
  color: var(--board-coord-dark);
}

.orientation-white .ranks :nth-child(even),
.orientation-white .files :nth-child(odd),
.orientation-black .ranks :nth-child(odd),
.orientation-black .files :nth-child(even),
coords.squares:nth-of-type(odd) :nth-child(odd),
coords.squares:nth-of-type(even) :nth-child(even) {
  color: var(--board-coord-light);
}
```

**Step 2: Commit**

```bash
git add src/shared/board-theme.css
git commit -m "feat: Catppuccin chess board theme with CSS custom properties"
```

---

### Task 4: Add FOUC prevention script to all HTML pages

**Files:**

- Modify: `index.html`
- Modify: `games/rapid.html`
- Modify: `games/reaction.html`
- Modify: `games/vocab.html`
- Modify: `games/math.html`

**Step 1: Add inline script to each HTML `<head>`**

In every HTML file, add this immediately after `<meta name="viewport" .../>` and before the first `<link>`:

```html
<script>
  (function () {
    var t = localStorage.getItem("theme");
    if (!t)
      t = matchMedia("(prefers-color-scheme:light)").matches
        ? "latte"
        : "frappe";
    document.documentElement.dataset.theme = t;
  })();
</script>
```

**Step 2: Add theme toggle button to each header**

In `index.html` (hub), change the header to:

```html
<header>
  <h1>Brainbout</h1>
  <button
    class="theme-toggle"
    id="theme-btn"
    aria-label="Toggle theme"
  ></button>
</header>
```

In `games/rapid.html`, `games/reaction.html`, `games/math.html`, wrap the buttons:

```html
<header>
  <h1>Chess960 Rapid</h1>
  <div>
    <button
      class="theme-toggle"
      id="theme-btn"
      aria-label="Toggle theme"
    ></button>
    <button class="skip-btn" id="skip-btn">Skip</button>
  </div>
</header>
```

In `games/vocab.html` (already has a wrapper div), add before lang-btn:

```html
<header>
  <h1>Word Recall</h1>
  <div>
    <button
      class="theme-toggle"
      id="theme-btn"
      aria-label="Toggle theme"
    ></button>
    <button class="lang-toggle" id="lang-btn">NO</button>
    <button class="skip-btn" id="skip-btn">Skip</button>
  </div>
</header>
```

**Step 3: Commit**

```bash
git add index.html games/*.html
git commit -m "feat: FOUC prevention script and theme toggle button in all pages"
```

---

### Task 5: Wire theme module in all TypeScript entry points

**Files:**

- Modify: `src/hub.ts` (add import at top)
- Modify: `src/games/rapid.ts` (add imports at top)
- Modify: `src/games/reaction.ts` (add import at top)
- Modify: `src/games/vocab.ts` (add import at top)
- Modify: `src/games/math.ts` (add import at top)

**Step 1: Add theme imports to each file**

At the top of `src/hub.ts`, add:

```typescript
import { initTheme, renderToggle } from "./shared/theme";
```

At the bottom of `src/hub.ts`, after `render();`, add:

```typescript
initTheme();
const themeBtn = document.getElementById("theme-btn");
if (themeBtn) renderToggle(themeBtn.parentElement!);
```

Wait — since we already put a `#theme-btn` placeholder in HTML, we just need `initTheme()` and to populate the icon. Actually, `renderToggle` creates the button element. Let's simplify: the HTML already has the button, so theme.ts should find it and wire it up.

**Revised approach:** Change `renderToggle` to `wireToggle` — it finds the existing `#theme-btn` and wires click + sets icon. This avoids duplicating the button.

In each TS entry file, add at the top:

```typescript
import { initTheme, wireToggle } from "./shared/theme";
```

And at the bottom (or after DOM-dependent init), add:

```typescript
initTheme();
wireToggle();
```

For `src/games/rapid.ts` only, also add after the chessground CSS imports:

```typescript
import "../shared/board-theme.css";
```

**Step 2: Commit**

```bash
git add src/hub.ts src/games/rapid.ts src/games/reaction.ts src/games/vocab.ts src/games/math.ts
git commit -m "feat: wire theme toggle in all page entry points"
```

---

### Task 6: Lint, test, and verify

**Step 1: Run all tests**

Run: `npx vitest run`
Expected: all tests pass (including new theme test)

**Step 2: Run linter**

Run: `npx eslint src/ test/`
Expected: no errors

**Step 3: Build**

Run: `npx vite build`
Expected: successful build

**Step 4: Manual verification**

Run: `npx vite dev` and check:

- [ ] Hub page: toggle button visible, click switches light/dark
- [ ] Rapid page: board colors change with theme
- [ ] Reaction/Vocab/Math pages: all switch correctly
- [ ] Refresh preserves theme choice (localStorage)
- [ ] Clear localStorage → follows OS preference

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: lint, format, and final verification"
```
