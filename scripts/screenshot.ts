import { chromium } from "playwright";
import { createServer } from "vite";

const WIDTH = 480;
const HEIGHT = 640;
const OUTPUT = "docs/screenshot.png";

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

  console.log(`Screenshot saved to ${OUTPUT}`);
}

void main();
