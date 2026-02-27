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
      if (localStorage.getItem("theme") === null) {
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

function updateIcon(btn: HTMLElement): void {
  const isLight = document.documentElement.dataset.theme === "latte";
  btn.innerHTML = isLight
    ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z"/></svg>`
    : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
}

export function wireToggle(): void {
  const btn = document.getElementById("theme-btn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    toggleTheme();
    updateIcon(btn);
  });
  updateIcon(btn);
}
