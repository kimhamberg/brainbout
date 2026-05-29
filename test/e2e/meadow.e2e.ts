import { expect, test } from "@playwright/test";

interface M {
  phase: string;
  isNoGo: boolean;
  correctSide: "left" | "right" | null;
}

// Phase-4: Meadow + Weather — flux go/no-go + cued rule-switch, behind the seam.
// Driven via the isNoGo/correctSide test hooks so we play correctly (HP holds)
// and exercise the full loop incl. a telegraphed weather/rule switch.
test("Meadow: sort by rule / withhold on no-go / survive a weather switch", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto("/games/verdant-meadow.html", { waitUntil: "load" });
  await page.waitForFunction(
    () => (window as unknown as { __meadowReady?: boolean }).__meadowReady,
    { timeout: 15_000 },
  );

  for (let guard = 0; guard < 120; guard++) {
    const done = await page.evaluate(
      () => !!(window as unknown as { __meadowDone?: unknown }).__meadowDone,
    );
    if (done) break;
    const m = (await page.evaluate(
      () => (window as unknown as { __meadow?: M }).__meadow,
    )) as M;
    if (m.phase === "responding") {
      await expect(page.locator("#meadow-left")).toBeEnabled({
        timeout: 5_000,
      });
      if (m.isNoGo) await page.locator("#meadow-hold").click();
      else await page.locator(`#meadow-${m.correctSide ?? "hold"}`).click();
    } else if (m.phase === "revealed") {
      await page.locator("#meadow-next").click();
    }
  }

  await expect(page.locator("#meadow-summary")).toContainText("·");
  const out = await page.evaluate(
    () =>
      (
        window as unknown as {
          __meadowDone?: {
            trials: number;
            meta?: { switchRts?: number[]; repeatRts?: number[] };
          };
        }
      ).__meadowDone,
  );
  // every beat logged exactly one RT (switch or repeat) — guardrails 5/7
  const logged =
    (out?.meta?.switchRts?.length ?? 0) + (out?.meta?.repeatRts?.length ?? 0);
  expect(logged).toBe(out?.trials);
  expect(out?.meta?.switchRts?.length ?? 0).toBeGreaterThan(0); // a switch happened
  expect(errors).toEqual([]);
});
