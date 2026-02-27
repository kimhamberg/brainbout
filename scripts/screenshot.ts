import { join } from "path";
import { chromium } from "playwright";
import sharp from "sharp";
import { createServer } from "vite";

const WIDTH = 480;
const HEIGHT = 640;
const OUTPUT = "docs/screenshot.png";

// Phone frame compositing constants
const BEZEL_X = 38;
const BEZEL_Y = 58;
const FRAME_W = 556; // WIDTH + BEZEL_X * 2
const FRAME_H = 756; // HEIGHT + BEZEL_Y * 2
const FRAME_SVG = join(import.meta.dirname, "..", "docs", "phone-frame.svg");

async function main(): Promise<void> {
  const server = await createServer({ server: { port: 5199 } });
  await server.listen();

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
  });

  await page.goto("http://localhost:5199");
  // Force dark theme (Frappe) for a richer screenshot
  await page.evaluate(() => {
    localStorage.setItem("theme", "frappe");
    document.documentElement.dataset.theme = "frappe";
  });
  await page.waitForSelector(".game-list", { timeout: 10_000 });
  // Let transitions settle
  await page.waitForTimeout(300);

  await page.screenshot({ path: OUTPUT });

  await browser.close();
  await server.close();

  // Composite screenshot into phone frame
  const frame = await sharp(FRAME_SVG, { density: 72 })
    .resize(FRAME_W, FRAME_H)
    .png()
    .toBuffer();

  const screenshot = await sharp(OUTPUT).png().toBuffer();

  await sharp({
    create: {
      width: FRAME_W,
      height: FRAME_H,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: screenshot, left: BEZEL_X, top: BEZEL_Y },
      { input: frame, left: 0, top: 0 },
    ])
    .png()
    .toFile(OUTPUT);

  console.log(`Screenshot saved to ${OUTPUT} (${FRAME_W}x${FRAME_H})`);
}

void main();
