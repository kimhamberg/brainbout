import sharp from "sharp";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

// Catppuccin Frappe base (#303446)
const BG_COLOR = "#303446";

// The brain SVG scaled to fit adaptive icon foreground (108dp, 72dp safe zone)
// We render the brain at ~66% of the canvas so it sits within the safe zone
function makeForegroundSvg(size: number): Buffer {
  const padding = Math.round(size * 0.22); // ~22% padding each side ≈ 56% icon area
  const inner = size - padding * 2;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <svg x="${padding}" y="${padding}" width="${inner}" height="${inner}" viewBox="0 0 24 24" fill="none" stroke="url(#g)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#8caaee"/><stop offset="100%" stop-color="#ef9f76"/></linearGradient></defs>
    <path d="M12 18V5"/>
    <path d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4"/>
    <path d="M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5"/>
    <path d="M17.997 5.125a4 4 0 0 1 2.526 5.77"/>
    <path d="M18 18a4 4 0 0 0 2-7.464"/>
    <path d="M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517"/>
    <path d="M6 18a4 4 0 0 1-2-7.464"/>
    <path d="M6.003 5.125a4 4 0 0 0-2.526 5.77"/>
  </svg>
</svg>`);
}

// Adaptive icon sizes: foreground/background are 108dp
// Legacy icon sizes in dp: mdpi=48, hdpi=72, xhdpi=96, xxhdpi=144, xxxhdpi=192
const densities = [
  { name: "mdpi", legacy: 48, adaptive: 108 },
  { name: "hdpi", legacy: 72, adaptive: 162 },
  { name: "xhdpi", legacy: 96, adaptive: 216 },
  { name: "xxhdpi", legacy: 144, adaptive: 324 },
  { name: "xxxhdpi", legacy: 192, adaptive: 432 },
] as const;

const resDir = join(import.meta.dirname!, "../android/app/src/main/res");

async function main() {
  for (const d of densities) {
    const dir = join(resDir, `mipmap-${d.name}`);
    mkdirSync(dir, { recursive: true });

    // Legacy icon (square with rounded appearance via launcher)
    await sharp(makeForegroundSvg(d.legacy))
      .flatten({ background: BG_COLOR })
      .png()
      .toFile(join(dir, "ic_launcher.png"));

    // Adaptive foreground (transparent background, brain centered)
    await sharp(makeForegroundSvg(d.adaptive))
      .png()
      .toFile(join(dir, "ic_launcher_foreground.png"));

    console.log(
      `  ${d.name}: ${d.legacy}px legacy, ${d.adaptive}px foreground`,
    );
  }

  // Adaptive icon XML
  const xmlDir = join(resDir, "mipmap-anydpi-v26");
  mkdirSync(xmlDir, { recursive: true });

  writeFileSync(
    join(xmlDir, "ic_launcher.xml"),
    `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`,
  );

  // Background color resource
  const valuesDir = join(resDir, "values");
  mkdirSync(valuesDir, { recursive: true });

  writeFileSync(
    join(valuesDir, "colors.xml"),
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${BG_COLOR}</color>
</resources>
`,
  );

  console.log("Android icons generated.");
}

main();
