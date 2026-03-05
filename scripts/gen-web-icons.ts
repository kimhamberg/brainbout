import sharp from "sharp";
import { mkdirSync } from "fs";
import { resolve } from "path";

const BRAIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 24 24" fill="none" stroke="url(#g)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#8caaee"/><stop offset="100%" stop-color="#ef9f76"/></linearGradient></defs><path d="M12 18V5"/><path d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4"/><path d="M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5"/><path d="M17.997 5.125a4 4 0 0 1 2.526 5.77"/><path d="M18 18a4 4 0 0 0 2-7.464"/><path d="M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517"/><path d="M6 18a4 4 0 0 1-2-7.464"/><path d="M6.003 5.125a4 4 0 0 0-2.526 5.77"/></svg>`;

const BG_COLOR = { r: 48, g: 52, b: 70 }; // Frappe base (#303446)

const sizes = [
  { name: "apple-touch-icon.png", size: 180 },
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
];

const outDir = resolve(import.meta.dirname ?? ".", "../public");
mkdirSync(outDir, { recursive: true });

for (const { name, size } of sizes) {
  const padding = Math.round(size * 0.15);
  const iconSize = size - padding * 2;

  const icon = await sharp(Buffer.from(BRAIN_SVG))
    .resize(iconSize, iconSize)
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { ...BG_COLOR, alpha: 1 },
    },
  })
    .composite([{ input: icon, top: padding, left: padding }])
    .png()
    .toFile(resolve(outDir, name));

  console.log(`Generated ${name} (${String(size)}x${String(size)})`);
}
