import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
async function findMatch(page: Page) {
  await page.getByRole("button", { name: "Find a Match", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A New Signal!" }),
  ).toBeVisible();
}
async function acceptMatch(page: Page) {
  await page.getByRole("button", { name: "Accept Match" }).click();
  await expect(page.getByText("Waiting for the other person...")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Message Nova" })).toBeEnabled(
    { timeout: 10000 },
  );
}
async function assertNoOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}
test("a search result follows the user across navigation", async ({ page }) => {
  await page.goto("/discover");
  await page.getByRole("button", { name: "Find a Match", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Messages" })
    .click();
  await expect(
    page.getByRole("heading", { name: "A New Signal!" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page).toHaveURL(/discover/);
});
test("complete desktop flow, keyboard messaging, diagnostics and disconnect recovery", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "Gaming", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Gaming", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("radio", { name: /Interest-Based Discovery/ }).click();
  await expect(
    page.getByRole("radio", { name: /Interest-Based Discovery/ }),
  ).toHaveAttribute("aria-checked", "true");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath("discover-1440.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Find a Match", exact: true }).click();
  await page.getByRole("button", { name: "Cancel search" }).click();
  await page.waitForTimeout(2500);
  await expect(page).toHaveURL(/discover/);
  await findMatch(page);
  await page.screenshot({
    path: testInfo.outputPath("match-1440.png"),
    fullPage: true,
    animations: "disabled",
  });
  await acceptMatch(page);
  const input = page.getByRole("textbox", { name: "Message Nova" });
  await input.fill("Hello Nova!");
  await input.press("Shift+Enter");
  await input.press("a");
  await expect(input).toHaveValue("Hello Nova!\na");
  await input.press("Enter");
  await expect(page.locator(".message-self .message-bubble")).toHaveText(
    "Hello Nova!\na",
  );
  await input.fill("<img src=x onerror=alert(1)>");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".message-self img")).toHaveCount(0);
  await page.getByRole("button", { name: "Connection details" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "All statistics below are mock data",
  );
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Connection details" }),
  ).toBeFocused();
  await input.fill("Keep this draft");
  await page.getByRole("button", { name: "Demo mode" }).click();
  await page
    .getByLabel("Simulate connection state")
    .selectOption("disconnected");
  await page.getByRole("button", { name: "Back to exploring" }).click();
  await expect(input).toBeDisabled();
  await expect(input).toHaveValue("Keep this draft");
  await page.getByRole("button", { name: "Restore demo" }).click();
  await expect(input).toBeEnabled();
  await input.clear();
  await page.screenshot({
    path: testInfo.outputPath("chat-1440.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "End conversation", exact: true })
    .click();
  await page.getByRole("button", { name: "Keep chatting" }).click();
  await expect(input).toBeVisible();
  await page
    .getByRole("button", { name: "End conversation", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "End conversation" })
    .click();
  await expect(page).toHaveURL(/discover/);
  expect(errors).toEqual([]);
});
for (const width of [375, 768, 1024]) {
  test(`responsive discovery, match and chat at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 850 });
    await page.goto("/discover");
    await assertNoOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`discover-${width}.png`),
      fullPage: true,
      animations: "disabled",
    });
    await findMatch(page);
    await assertNoOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`match-${width}.png`),
      fullPage: true,
      animations: "disabled",
    });
    await acceptMatch(page);
    const input = page.getByRole("textbox", { name: "Message Nova" });
    await input.fill("A".repeat(500));
    await input.press("Enter");
    await assertNoOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`chat-${width}.png`),
      fullPage: true,
      animations: "disabled",
    });
    if (width === 375) {
      await page.setViewportSize({ width, height: 480 });
      const box = await input.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y + box!.height).toBeLessThanOrEqual(480);
      await assertNoOverflow(page);
      await page.screenshot({
        path: testInfo.outputPath("chat-keyboard-height.png"),
        fullPage: true,
        animations: "disabled",
      });
    }
  });
}
test("demo rejection, timeout, connection failure, relay and empty chat", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto("/messages");
  await expect(
    page.getByRole("heading", { name: "Your next hello starts here." }),
  ).toBeVisible();
  for (const [scenario, heading] of [
    ["rejected", "A different orbit this time."],
    ["timeout", "This signal drifted away."],
    ["connection-failed", "We couldn’t bridge the distance."],
  ]) {
    await page.goto("/discover");
    await page.getByRole("button", { name: "Demo mode" }).click();
    await page.getByLabel("Next discovery outcome").selectOption(scenario);
    await page.getByRole("button", { name: "Back to exploring" }).click();
    await findMatch(page);
    await page.getByRole("button", { name: "Accept Match" }).click();
    await expect(page.getByRole("heading", { name: heading })).toBeVisible({
      timeout: 11000,
    });
    await page
      .getByRole("button", { name: "Back to Discover", exact: true })
      .click();
    await expect(page).toHaveURL(/discover/);
  }
  await page.getByRole("button", { name: "Demo mode" }).click();
  await page.getByLabel("Next discovery outcome").selectOption("relay");
  await page.getByRole("button", { name: "Back to exploring" }).click();
  await findMatch(page);
  await acceptMatch(page);
  await expect(page.locator(".connection-status")).toContainText("TURN Relay");
  await page.getByRole("button", { name: "Demo mode" }).click();
  await page.getByRole("button", { name: "Clear demo messages" }).click();
  await expect(page.getByText("Break the ice.")).toBeVisible();
});
test("search error, skip, profile editing and reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/discover");
  expect(
    await page
      .locator(".radar-sweep")
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe("none");
  await page.getByRole("button", { name: "Edit profile for Alex" }).click();
  await page.getByLabel("Display name").fill("Orion");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(
    page.getByRole("button", { name: "Edit profile for Orion" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Demo mode" }).click();
  await page.getByLabel("Next discovery outcome").selectOption("search-error");
  await page.getByRole("button", { name: "Back to exploring" }).click();
  await page.getByRole("button", { name: "Find a Match", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("That signal got lost.");
  await page.getByRole("button", { name: "Demo mode" }).click();
  await page.getByLabel("Next discovery outcome").selectOption("success");
  await page.getByRole("button", { name: "Back to exploring" }).click();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A New Signal!" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page).toHaveURL(/discover/);
});
