# Catppuccin Latte/Frappe Theme Toggle

## Goal

Add light/dark mode toggle using Catppuccin Latte (light) and Frappe (dark) palettes, including custom Catppuccin-complementary chess board colors.

## Current State

- All CSS uses `--ctp-*` custom properties defined in `src/style.css`
- Only Frappe (dark) palette defined
- Chessground board uses hardcoded brown theme from `chessground.brown.css`
- 5 HTML pages: hub + 4 games (rapid, reaction, vocab, math)

## Design

### Theme Detection & Persistence

New module `src/shared/theme.ts` (~30 lines):

1. On load: check `localStorage.getItem("theme")`
2. If null, read `window.matchMedia("(prefers-color-scheme: light)")`
3. Set `data-theme="latte"` or `data-theme="frappe"` on `<html>`
4. `toggleTheme()` flips the attribute and persists to localStorage
5. Listen to `matchMedia("(prefers-color-scheme: light)")` change event — if no localStorage override, follow OS live

### FOUC Prevention

Inline `<script>` in every HTML `<head>` before CSS:

```html
<script>
  (function(){var t=localStorage.getItem("theme");if(!t)t=matchMedia("(prefers-color-scheme:light)").matches?"latte":"frappe";document.documentElement.dataset.theme=t})()
</script>
```

### CSS Palette Definitions

In `src/style.css`, replace the single `:root` block:

```css
:root, [data-theme="frappe"] {
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

### Custom Chess Board Theme

New file `src/shared/board-theme.css` (~50 lines):

Overrides Chessground's `cg-board` background and interactive state colors.

**Frappe board (cool slate):**
- Light squares: `#626880` (surface2)
- Dark squares: `#414559` (surface0) via SVG overlay

**Latte board (soft gray):**
- Light squares: `#e6e9ef` (mantle)
- Dark squares: `#bcc0cc` (surface1) via SVG overlay

**Interactive states (both themes, using CSS vars):**
- Move destinations: `--ctp-green` based radial gradient
- Last move: `--ctp-blue` at 0.4 opacity
- Selected square: `--ctp-blue` at 0.4 opacity
- Check: `--ctp-red` radial gradient
- Premove: `--ctp-peach` based

### Toggle Button

Sun/moon icon in every page's `<header>`, right-aligned. Pure CSS/HTML icon (SVG inline), ~24px. No text label.

- Hub page: after `<h1>`
- Game pages: between `<h1>` and skip button

Styled in `src/style.css` as part of shared header styles.

### Files Changed

| File | Change |
|------|--------|
| `src/style.css` | Dual palette + toggle button styles |
| `src/shared/theme.ts` | New — theme detection, toggle, persistence |
| `src/shared/board-theme.css` | New — Catppuccin board color overrides |
| `index.html` | FOUC script |
| `games/rapid.html` | FOUC script |
| `games/reaction.html` | FOUC script |
| `games/vocab.html` | FOUC script |
| `games/math.html` | FOUC script |
| `src/hub.ts` | Import theme, render toggle |
| `src/games/rapid.ts` | Import theme + board-theme.css, render toggle |
| `src/games/reaction.ts` | Import theme, render toggle |
| `src/games/vocab.ts` | Import theme, render toggle |
| `src/games/math.ts` | Import theme, render toggle |

No new dependencies. No game logic changes.
