import { expect, test } from "@playwright/test";

// Phase-2: the Grove zone — typed recall wakes dormant residents, behind the
// BlockOutcome seam, rendered with per-species hue-rotated templates.
test("Grove: typing a name wakes the resident; the session completes cleanly", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto("/games/verdant-grove.html", { waitUntil: "load" });
  await page.waitForFunction(
    () => (window as unknown as { __groveReady?: boolean }).__groveReady,
    { timeout: 15_000 },
  );

  const input = page.locator("#grove-input");

  // First resident (fresh deck → deck order): "fugl". Type it → it wakes.
  await input.fill("fugl");
  await input.press("Enter"); // grade + reveal
  await expect(page.locator("#grove-reveal")).toContainText("fugl");
  await expect(page.locator("#grove-reveal")).toHaveAttribute(
    "data-grade",
    "good",
  );
  const woke1 = await page.evaluate(
    () => (window as unknown as { __grove?: { woke: number } }).__grove?.woke,
  );
  expect(woke1).toBe(1);
  await page.screenshot({ path: "/tmp/grove-render.png" });

  // Finish the rest of the session (deck order).
  for (const name of ["skog", "blomst", "katt", "rød"]) {
    await input.press("Enter"); // advance from the revealed state
    await input.fill(name);
    await input.press("Enter"); // grade + reveal
  }
  await input.press("Enter"); // advance past the last → completes

  await expect(page.locator("#grove-summary")).toContainText("woke 5/5");
  expect(errors).toEqual([]);
});
