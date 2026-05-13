import { join } from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";
import index from "../index.html";
import { assetFetch } from "./serve";

const WIDTH = 480;
const HEIGHT = 640;
const OUTPUT = "docs/screenshot.png";

const BEZEL_X = 38;
const BEZEL_Y = 58;
const FRAME_W = 556;
const FRAME_H = 756;
const ROOT = join(import.meta.dirname, "..");
const FRAME_SVG = join(ROOT, "docs", "phone-frame.svg");

async function main(): Promise<void> {
  const server = Bun.serve({
    port: 5199,
    routes: { "/": index },
    fetch: assetFetch(ROOT),
  });

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
  });

  await page.goto(server.url.href);
  await page.evaluate(() => {
    localStorage.setItem("theme", "frappe");
    document.documentElement.dataset.theme = "frappe";
  });
  await page.locator(".game-list").waitFor({ timeout: 10_000 });
  await page.waitForTimeout(300);

  await page.screenshot({ path: OUTPUT });

  await browser.close();
  await server.stop();

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
}

void main();
