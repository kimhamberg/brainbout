import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { BRAIN_PATHS } from "../src/shared/icons";

// Catppuccin Frappe base
const BG = "#303446";

function brainSvg(size: number, padding: number): Buffer {
  const inner = size - padding * 2;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><svg x="${padding}" y="${padding}" width="${inner}" height="${inner}" viewBox="0 0 24 24" fill="none" stroke="url(#g)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#8caaee"/><stop offset="100%" stop-color="#ef9f76"/></linearGradient></defs>${BRAIN_PATHS}</svg></svg>`,
  );
}

const ROOT = join(import.meta.dirname!, "..");

async function genWeb() {
  const outDir = join(ROOT, "public");
  mkdirSync(outDir, { recursive: true });
  const sizes = [
    { name: "apple-touch-icon.png", size: 180 },
    { name: "icon-192.png", size: 192 },
    { name: "icon-512.png", size: 512 },
  ];
  for (const { name, size } of sizes) {
    await sharp(brainSvg(size, Math.round(size * 0.15)))
      .flatten({ background: BG })
      .png()
      .toFile(join(outDir, name));
  }
}

async function genAndroid() {
  // Legacy icons in dp: mdpi=48, hdpi=72, xhdpi=96, xxhdpi=144, xxxhdpi=192.
  // Adaptive foreground/background are 108dp scaled per density.
  const resDir = join(ROOT, "android/app/src/main/res");
  const densities = [
    { name: "mdpi", legacy: 48, adaptive: 108 },
    { name: "hdpi", legacy: 72, adaptive: 162 },
    { name: "xhdpi", legacy: 96, adaptive: 216 },
    { name: "xxhdpi", legacy: 144, adaptive: 324 },
    { name: "xxxhdpi", legacy: 192, adaptive: 432 },
  ] as const;

  for (const d of densities) {
    const dir = join(resDir, `mipmap-${d.name}`);
    mkdirSync(dir, { recursive: true });
    await sharp(brainSvg(d.legacy, Math.round(d.legacy * 0.22)))
      .flatten({ background: BG })
      .png()
      .toFile(join(dir, "ic_launcher.png"));
    await sharp(brainSvg(d.adaptive, Math.round(d.adaptive * 0.22)))
      .png()
      .toFile(join(dir, "ic_launcher_foreground.png"));
  }

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

  const valuesDir = join(resDir, "values");
  mkdirSync(valuesDir, { recursive: true });
  writeFileSync(
    join(valuesDir, "colors.xml"),
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${BG}</color>
</resources>
`,
  );
}

await genWeb();
await genAndroid();
