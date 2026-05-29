import { expect, test } from "@playwright/test";

// Phase-0 live-render slice: the baked atlas renders in-engine via PixiJS WebGL.
test("Verdant Hollow render spike: WebGL stage mounts + draws the atlas cleanly", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto("/games/verdant.html", { waitUntil: "load" });

  // the demo sets this once the atlas is loaded + the scene composed
  await page.waitForFunction(
    () => (window as unknown as { __verdantReady?: boolean }).__verdantReady,
    { timeout: 15_000 },
  );

  const info = await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>("#stage canvas");
    if (!c) return { present: false, webgl: false, w: 0 };
    const gl = c.getContext("webgl2") ?? c.getContext("webgl");
    return { present: true, webgl: gl !== null, w: c.width };
  });

  expect(info.present).toBe(true);
  expect(info.webgl).toBe(true);
  expect(info.w).toBeGreaterThan(0);
  expect(await page.textContent("#status")).toContain("renderer: webgl");
  expect(errors).toEqual([]);
});
