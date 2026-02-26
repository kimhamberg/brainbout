import { chromium } from "playwright";
import { createServer } from "vite";

const WIDTH = 1280;
const HEIGHT = 800;
const OUTPUT = "docs/screenshot.png";

async function main(): Promise<void> {
  const server = await createServer({ server: { port: 5199 } });
  await server.listen();

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
  });

  await page.goto("http://localhost:5199");
  await page.waitForSelector("#board cg-board piece", { timeout: 10_000 });
  // Let chessground animations settle
  await page.waitForTimeout(500);

  await page.screenshot({ path: OUTPUT });

  await browser.close();
  await server.close();

  console.log(`Screenshot saved to ${OUTPUT}`);
}

void main();
