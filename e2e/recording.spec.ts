import type { Page } from "@playwright/test";
import {
  card,
  delivered,
  expect,
  expectSent,
  openReport,
  resetRelay,
  test,
} from "./helpers.js";

declare global {
  interface Window {
    shotlogCustomRecordings: {
      size: number;
      type: string;
      durationMs: number;
    }[];
  }
}

// Chromium alone can accept the tab-sharing picker without a person (see playwright.config.ts).
test.skip(
  ({ browserName }) => browserName !== "chromium",
  "Screen sharing needs a person outside Chromium",
);

test.beforeEach(async ({ request, page }) => {
  await resetRelay(request);
  await page.goto("/");
});

const toolbar = (page: Page) =>
  page.getByRole("toolbar", { name: "Recording controls" });
const marks = (page: Page) =>
  page
    .locator("[data-shotlog]")
    .evaluate(
      (host) =>
        host.shadowRoot?.querySelectorAll(".recording-marks > *").length ?? 0,
    );

async function drag(page: Page, from: [number, number], to: [number, number]) {
  await page.mouse.move(...from);
  await page.mouse.down();
  await page.mouse.move(...to, { steps: 6 });
  await page.mouse.up();
}

test("records the tab with drawings that fade, then delivers the video link", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const text = "Recording: the address form loses what I typed.";
  await openReport(page, text);
  await card(page)
    .getByRole("button", { name: /^Record screen/ })
    .click();
  await expect(toolbar(page)).toBeVisible();
  await expect(card(page)).toBeHidden();
  await expect(
    toolbar(page).getByRole("button", { name: "Mute microphone" }),
  ).toBeEnabled();

  // The page stays usable until a tool is chosen.
  await expect(
    toolbar(page).getByRole("button", { name: "Use the page" }),
  ).toHaveAttribute("aria-pressed", "true");
  await toolbar(page).getByRole("button", { name: "Rectangle" }).click();
  await drag(page, [200, 200], [420, 320]);
  await toolbar(page).getByRole("button", { name: "Arrow" }).click();
  await drag(page, [700, 500], [450, 330]);
  expect(await marks(page)).toBe(2);
  await toolbar(page).getByRole("button", { name: "Clear drawings" }).click();
  expect(await marks(page)).toBe(0);

  // Drawing again inside the ten seconds keeps everything and restarts the wait.
  await toolbar(page)
    .getByRole("button", { name: "Draw", exact: true })
    .click();
  await drag(page, [300, 500], [500, 560]);
  await page.waitForTimeout(6_000);
  await toolbar(page).getByRole("button", { name: "Oval" }).click();
  await drag(page, [800, 150], [1000, 260]);
  await page.waitForTimeout(6_000);
  expect(await marks(page)).toBe(2);
  await expect.poll(() => marks(page), { timeout: 6_000 }).toBe(0);

  await toolbar(page).getByRole("button", { name: "Finish" }).click();
  await expect(toolbar(page)).toBeHidden();
  const attached = card(page).getByText("Screen recording");
  await expect(attached).toBeVisible();
  await card(page).getByRole("button", { name: "Submit", exact: true }).click();
  await expectSent(page);

  const { webhook, email } = await delivered(request, text);
  const recording = webhook.supportLog.recording;
  expect(webhook.supportLog.schemaVersion).toBe(2);
  expect(recording).toMatchObject({
    mimeType: expect.stringMatching(/^video\/webm/),
    ...page.viewportSize(),
  });
  expect(recording?.durationMs).toBeGreaterThan(14_000);
  expect(email.text).toContain(recording?.url);
  const video = await request.get(recording?.url ?? "");
  expect(video.ok()).toBe(true);
  expect((await video.body()).length).toBe(recording?.size);
});

test("discarding asks twice and keeps nothing", async ({ page }) => {
  await openReport(page, "Discarded recording");
  await card(page)
    .getByRole("button", { name: /^Record screen/ })
    .click();
  const discard = toolbar(page).getByRole("button", {
    name: "Discard recording",
  });
  await discard.click();
  await toolbar(page).getByRole("button", { name: "Discard?" }).click();
  await expect(toolbar(page)).toBeHidden();
  await expect(card(page)).toBeVisible();
  await expect(card(page).getByText("Screen recording")).toHaveCount(0);
  await expect(
    card(page).getByRole("button", { name: /^Record screen/ }),
  ).toBeFocused();
});

test("a custom onSubmit opts in and receives the video itself", async ({
  page,
}) => {
  await page.goto("/#/custom");
  await openReport(page, "Recorded without a Relay Endpoint");
  await card(page)
    .getByRole("button", { name: /^Record screen/ })
    .click();
  await expect(toolbar(page)).toBeVisible();
  await page.waitForTimeout(1_500);
  await toolbar(page).getByRole("button", { name: "Finish" }).click();
  await expect(card(page).getByText("Screen recording")).toBeVisible();
  await card(page).getByRole("button", { name: "Submit", exact: true }).click();
  await expectSent(page);
  const [recording] = await page.evaluate(() => window.shotlogCustomRecordings);
  expect(recording?.type).toMatch(/^video\/webm/);
  expect(recording?.size).toBeGreaterThan(0);
  expect(recording?.durationMs).toBeGreaterThan(1_000);
});
