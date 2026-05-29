import { expect, type Page, test } from "@playwright/test";

interface M {
  phase: string;
  isNoGo: boolean;
  correctSide: "left" | "right" | null;
}
interface Done {
  trials: number;
  endReason: string;
  durationMs: number;
  meta?: { switchRts?: number[]; repeatRts?: number[]; falseAlarms?: number };
}

// Phase-4: Meadow + Weather — flux go/no-go + cued rule-switch, behind the seam.
// Driven via the isNoGo/correctSide hooks. A no-go is withheld by NOT tapping —
// we let the beat time out (true-timeout no-go), never a "leave it" button.
async function playMeadow(page: Page, maxSteps: number): Promise<void> {
  for (let guard = 0; guard < maxSteps; guard++) {
    const done = await page.evaluate(
      () => !!(window as unknown as { __meadowDone?: unknown }).__meadowDone,
    );
    if (done) break;
    const m = (await page.evaluate(
      () => (window as unknown as { __meadow?: M }).__meadow,
    )) as M;
    if (m.phase === "responding") {
      await expect(page.locator("#meadow-left")).toBeEnabled({ timeout: 6000 });
      if (m.isNoGo) {
        // withhold: do nothing, let the beat time out into a correct withhold
        await page.waitForFunction(
          () =>
            (window as unknown as { __meadow?: M }).__meadow?.phase !==
            "responding",
          { timeout: 6000 },
        );
      } else {
        await page.locator(`#meadow-${m.correctSide ?? "left"}`).click();
      }
    } else if (m.phase === "revealed") {
      await page.locator("#meadow-next").click();
    }
  }
}

function attachErrorSink(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

async function waitReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => (window as unknown as { __meadowReady?: boolean }).__meadowReady,
    { timeout: 15_000 },
  );
}

function readDone(page: Page): Promise<Done | undefined> {
  return page.evaluate(
    () => (window as unknown as { __meadowDone?: Done }).__meadowDone,
  );
}

test("Meadow: sort by rule / withhold a no-go by NOT tapping / survive a weather switch", async ({
  page,
}) => {
  const errors = attachErrorSink(page);
  await page.goto("/games/verdant-meadow.html?n=26", { waitUntil: "load" }); // count-bound → a switch is guaranteed
  await waitReady(page);
  await playMeadow(page, 200);

  await expect(page.locator("#meadow-summary")).toContainText("·");
  const out = await readDone(page);
  // every beat logged exactly one RT (switch or repeat) — guardrails 5/7
  const logged =
    (out?.meta?.switchRts?.length ?? 0) + (out?.meta?.repeatRts?.length ?? 0);
  expect(logged).toBe(out?.trials);
  expect(out?.meta?.switchRts?.length ?? 0).toBeGreaterThan(0); // a switch happened
  expect(errors).toEqual([]);
});

test("Meadow: the standalone session is time-bounded (ends on the clock, not a beat count)", async ({
  page,
}) => {
  const errors = attachErrorSink(page);
  // no beat cap (maxTrials = Infinity); the ONLY clean exit is the time budget.
  await page.goto("/games/verdant-meadow.html?ms=2500", { waitUntil: "load" });
  await waitReady(page);
  await playMeadow(page, 400);

  const out = await readDone(page);
  expect(out?.endReason).toBe("completed"); // not "failed" → it ran out the clock
  expect(out?.durationMs).toBeGreaterThanOrEqual(2500);
  expect(errors).toEqual([]);
});
