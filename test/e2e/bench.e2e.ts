import { expect, test } from "@playwright/test";

// Phase-3: the Propagation Bench — mental-rotation SAME/MOVED under RT, behind
// the BlockOutcome seam, with the trial-clock grading real reaction time.
test("Bench: judge SAME/MOVED across trials; RT logged; session completes", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto("/games/verdant-bench.html", { waitUntil: "load" });
  await page.waitForFunction(
    () => (window as unknown as { __benchReady?: boolean }).__benchReady,
    { timeout: 15_000 },
  );

  // Play 6 trials. Buttons are disabled until the trial-clock arms input
  // (post-paint) — Playwright auto-waits for enabled before clicking.
  for (let i = 0; i < 6; i++) {
    await page.locator("#bench-same").click(); // judge (answer doesn't matter for the flow test)
    await expect(page.locator("#bench-reveal")).toHaveAttribute(
      "data-grade",
      /.+/u,
    );
    await page.locator("#bench-next").click(); // advance
  }

  await expect(page.locator("#bench-summary")).toContainText("/6 correct");

  // RT-by-transform was logged (the empirical-validity hook, VH-9).
  const meta = await page.evaluate(
    () =>
      (
        window as unknown as {
          __benchDone?: { meta?: { rtByTransform?: Record<string, number[]> } };
        }
      ).__benchDone?.meta?.rtByTransform,
  );
  const totalRts = Object.values(meta ?? {}).reduce((n, a) => n + a.length, 0);
  expect(totalRts).toBe(6);
  expect(errors).toEqual([]);
});
