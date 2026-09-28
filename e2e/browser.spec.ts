import AxeBuilder from "@axe-core/playwright";
import type { SupportLog, SupportLogSubmission } from "shotlog";
import {
  capture,
  captureFixtures,
  card,
  description,
  editor,
  expect,
  expectSent,
  fixturePng,
  openReport,
  resetRelay,
  submit,
  test,
} from "./helpers.js";

declare global {
  interface Window {
    shotlogHostKeys: string[];
    shotlogCustomSubmissions: SupportLogSubmission[];
  }
}

test.beforeEach(async ({ request, page }) => {
  await resetRelay(request);
  await page.goto("/");
});

test("aggressive host CSS reset preserves the Report Card's computed styles", async ({
  page,
}) => {
  await captureFixtures(page);
  await openReport(page);
  const title = card(page).getByRole("heading", { name: "Send a report" });
  const baseline = await title.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      fontSize: style.fontSize,
      fontFamily: style.fontFamily,
      fontWeight: style.fontWeight,
    };
  });
  expect(baseline.fontSize).toBe("18px");
  await card(page).getByRole("button", { name: "Close report" }).click();
  await page.getByRole("link", { name: "Capture tests", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Capture stress page" }),
  ).toHaveCSS("font-size", "30px");
  await openReport(page);
  for (const [property, value] of Object.entries(baseline)) {
    expect(
      await title.evaluate(
        (node, property) => Reflect.get(getComputedStyle(node), property),
        property,
      ),
    ).toBe(value);
  }
  await expect(description(page)).toHaveCSS("font-size", "14px");
  await expect(card(page)).toHaveCSS("position", "fixed");
});

test("awkward page capture completes without shifting the live page", async ({
  page,
}) => {
  await captureFixtures(page);
  await page.goto("/#/capture");
  const marker = page.getByRole("heading", {
    name: "Scroll marker 2",
    exact: true,
  });
  await marker.scrollIntoViewIfNeeded();
  const before = await marker.boundingBox();
  expect(before).not.toBeNull();
  await openReport(page, "Capturing media, CORS, glass, and sticky content.");
  await capture(page);
  await expect(marker).toHaveJSProperty("isConnected", true);
  expect(await marker.boundingBox()).toEqual(before);
  await editor(page).getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    card(page).getByRole("img", { name: "Attached screenshot" }),
  ).toBeVisible();
  expect(await marker.boundingBox()).toEqual(before);
});

test("keyboard focus stays inside the card and Esc restores the Launcher", async ({
  page,
}) => {
  const launcher = page.getByRole("button", {
    name: "Report an issue",
    exact: true,
  });
  await launcher.focus();
  await launcher.press("Enter");
  await expect(description(page)).toBeFocused();
  await description(page).fill("Keep this draft when I close the card.");
  const close = card(page).getByRole("button", { name: "Close report" });
  const send = card(page).getByRole("button", { name: "Submit", exact: true });
  await send.focus();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(send).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(card(page)).toHaveCount(0);
  await expect(launcher).toBeFocused();
  await launcher.press("Enter");
  await expect(description(page)).toHaveValue(
    "Keep this draft when I close the card.",
  );
});

test("open Report Card has no serious or critical axe violations", async ({
  page,
}) => {
  await openReport(page);
  const results = await new AxeBuilder({ page })
    .include("[data-shotlog]")
    .analyze();
  expect(
    results.violations.filter(
      (violation) =>
        violation.impact === "serious" || violation.impact === "critical",
    ),
  ).toEqual([]);
});

test("editor tool shortcuts do not reach a Host App document keydown listener", async ({
  page,
}) => {
  await page.evaluate(() => {
    window.shotlogHostKeys = [];
    document.addEventListener("keydown", (event) =>
      window.shotlogHostKeys.push(event.key),
    );
  });
  // Prove the Host App listener is active before entering the editor.
  await page.keyboard.press("q");
  expect(await page.evaluate(() => window.shotlogHostKeys)).toEqual(["q"]);
  await openReport(page);
  await card(page).getByLabel("Upload image", { exact: true }).setInputFiles({
    name: "fixture.png",
    mimeType: "image/png",
    buffer: fixturePng(),
  });
  await expect(editor(page)).toBeVisible();
  await page.evaluate(() => {
    window.shotlogHostKeys = [];
  });
  await editor(page)
    .getByLabel(/^Screenshot canvas/)
    .focus();
  for (const [key, name] of [
    ["r", "Rectangle"],
    ["a", "Arrow"],
    ["v", "Select / Move"],
  ] as const) {
    await page.keyboard.press(key);
    await expect(
      editor(page).getByRole("button", { name, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  }
  expect(await page.evaluate(() => window.shotlogHostKeys)).toEqual([]);
  await editor(page).getByRole("button", { name: "Done", exact: true }).click();
  await card(page).getByRole("button", { name: "Close report" }).click();
  await page.keyboard.press("q");
  expect(await page.evaluate(() => window.shotlogHostKeys)).toEqual(["q"]);
});

test("Next.js built-package consumer delivers a signed webhook and rejects unsigned requests", async ({
  page,
  request,
  browserName,
}) => {
  const origin = "http://127.0.0.1:5300";
  const before: unknown[] = await (
    await request.get(`${origin}/api/inbox`)
  ).json();
  const rejected = await request.post(`${origin}/api/inbox`, {
    data: { id: "forged", description: "Unsigned payload" },
  });
  expect(rejected.status()).toBe(401);
  expect(await (await request.get(`${origin}/api/inbox`)).json()).toHaveLength(
    before.length,
  );
  await page.goto(origin);
  const text = `Next.js production report from ${browserName}.`;
  await openReport(page, text);
  const response = await submit(page);
  expect(response.status()).toBe(200);
  const result = await response.json();
  await expectSent(page);
  await expect
    .poll(async () => {
      const entries: { signatureValid: boolean; supportLog: SupportLog }[] =
        await (await request.get(`${origin}/api/inbox`)).json();
      return entries.find((entry) => entry.supportLog.id === result.id);
    })
    .toMatchObject({
      signatureValid: true,
      supportLog: { id: result.id, description: text, type: "Bug" },
    });
});

test("custom onSubmit receives the log and a typed failure shows its rate-limit message", async ({
  page,
  request,
}) => {
  await page.goto("/#/custom");
  await openReport(page, "Send with the Host App's custom delivery.");
  await card(page).getByRole("button", { name: "Submit", exact: true }).click();
  await expectSent(page);
  const logs = await page.evaluate(() => window.shotlogCustomSubmissions);
  expect(logs).toHaveLength(1);
  expect(logs[0]).toMatchObject({
    schemaVersion: 1,
    description: "Send with the Host App's custom delivery.",
    type: "Bug",
    shortId: expect.stringMatching(/^SL-/),
  });
  await card(page).getByRole("button", { name: "Close report" }).click();
  await openReport(page, "Second custom call should be rate limited.");
  await card(page).getByRole("button", { name: "Submit", exact: true }).click();
  await expect(
    card(page)
      .getByRole("status")
      .filter({ hasText: "You're sending too fast — try again in 2 minutes." }),
  ).toBeVisible();
  await expect(
    card(page).getByRole("button", { name: "Retry", exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(() => window.shotlogCustomSubmissions),
  ).toHaveLength(2);
  expect(await (await request.get("/_inbox")).json()).toEqual([]);
});
