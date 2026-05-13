import type { GameId } from "./progress";

export const BRAIN_PATHS = `<path d="M12 18V5"/><path d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4"/><path d="M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5"/><path d="M17.997 5.125a4 4 0 0 1 2.526 5.77"/><path d="M18 18a4 4 0 0 0 2-7.464"/><path d="M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517"/><path d="M6 18a4 4 0 0 1-2-7.464"/><path d="M6.003 5.125a4 4 0 0 0-2.526 5.77"/>`;

const GAME_PATHS: Record<GameId, string> = {
  crown: `<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/>`,
  flux: `<path d="M12 3v18M3.7 7.8 12 12l8.3-4.2M3.7 16.2 12 12l8.3 4.2"/>`,
  lex: `<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>`,
};

export function iconSvg(
  paths: string,
  opts: { size?: number; stroke?: string; strokeWidth?: number } = {},
): string {
  const { size = 24, stroke = "currentColor", strokeWidth = 2 } = opts;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

export const GAME_ICONS: Record<GameId, string> = {
  crown: iconSvg(GAME_PATHS.crown, { size: 18 }),
  flux: iconSvg(GAME_PATHS.flux, { size: 18 }),
  lex: iconSvg(GAME_PATHS.lex, { size: 18 }),
};

export function mountAppIcon(game: GameId, stroke: string): void {
  const slot = document.querySelector(".app-title");
  if (slot) {
    slot.insertAdjacentHTML(
      "afterbegin",
      iconSvg(GAME_PATHS[game], { size: 20, stroke }),
    );
  }
}

export function mountHubIcon(): void {
  const slot = document.querySelector(".hub-icon-slot");
  if (slot) {
    slot.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="hub-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="url(#hub-grad)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><defs><linearGradient id="hub-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="var(--ctp-green)"/><stop offset="50%" stop-color="var(--ctp-blue)"/><stop offset="100%" stop-color="var(--ctp-red)"/></linearGradient></defs>${BRAIN_PATHS}</svg>`;
  }
}
