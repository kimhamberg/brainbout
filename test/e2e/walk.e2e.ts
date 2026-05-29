import { expect, test } from "@playwright/test";

// Phase-5: the Walk — Grove → Bench → Meadow stitched into one session by the
// scene-router (one-construct-per-moment), each zone threaded into progress/stages.
test("Walk: Grove → Bench → Meadow flows as one session and tallies a summary", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto("/games/verdant-walk.html", { waitUntil: "load" });

  // ── GROVE leg (2 residents) ──
  await page.waitForFunction(
    () => (window as unknown as { __groveReady?: boolean }).__groveReady,
    { timeout: 15_000 },
  );
  const labels = ["fugl", "skog"];
  for (let i = 0; i < 2; i++) {
    const input = page.locator("#grove-input");
    await expect(input).toBeEnabled();
    await input.fill(labels[i] ?? "x");
    await input.press("Enter"); // grade + reveal
    await input.press("Enter"); // advance
  }

  // ── BENCH leg (2 trials) — mounts after the walk transition ──
  await page.waitForFunction(
    () => (window as unknown as { __benchReady?: boolean }).__benchReady,
    { timeout: 10_000 },
  );
  for (let i = 0; i < 2; i++) {
    await page.locator("#bench-same").click();
    await expect(page.locator("#bench-reveal")).toHaveAttribute(
      "data-grade",
      /.+/u,
    );
    await page.locator("#bench-next").click();
  }

  // ── MEADOW leg (6 beats) ──
  await page.waitForFunction(
    () => (window as unknown as { __meadowReady?: boolean }).__meadowReady,
    { timeout: 10_000 },
  );
  interface M {
    phase: string;
    isNoGo: boolean;
    correctSide: "left" | "right" | null;
  }
  for (let guard = 0; guard < 60; guard++) {
    if (
      await page.evaluate(
        () => !!(window as unknown as { __walkDone?: unknown }).__walkDone,
      )
    )
      break;
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

  await page.waitForFunction(
    () => !!(window as unknown as { __walkDone?: unknown }).__walkDone,
    { timeout: 10_000 },
  );
  await expect(page.locator("#walk-summary")).toContainText("pts");
  const out = await page.evaluate(
    () => (window as unknown as { __walkDone?: { kind: string }[] }).__walkDone,
  );
  expect(out?.map((o) => o.kind)).toEqual(["lex", "crown", "flux"]);
  expect(errors).toEqual([]);
});
