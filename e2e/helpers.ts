import {
  type APIRequestContext,
  test as base,
  expect,
  type Page,
} from "@playwright/test";
import { PNG } from "pngjs";
import type { Screenshot, SupportLogSubmission } from "shotlog";
import type { InboxEntry } from "../apps/playground/shared.js";

export const test = base;
export { expect };
export const card = (page: Page) =>
  page.getByRole("dialog", { name: "Send a report" });
export const description = (page: Page) =>
  page.getByRole("textbox", { name: "What were you trying to do?" });
export const editor = (page: Page) =>
  page.getByRole("dialog", { name: "Annotate screenshot" });

export async function resetRelay(request: APIRequestContext) {
  // Changing settings recreates the handler, including rate-limit and ID stores.
  for (const rateLimit of [false, true]) {
    const response = await request.put("/_settings", {
      data: { authorize: "allow", rateLimit },
    });
    expect(response.ok()).toBe(true);
  }
  expect((await request.delete("/_inbox")).ok()).toBe(true);
}

export async function inbox(request: APIRequestContext): Promise<InboxEntry[]> {
  const response = await request.get("/_inbox");
  expect(response.ok()).toBe(true);
  return response.json();
}

export async function delivered(request: APIRequestContext, text: string) {
  await expect
    .poll(
      async () =>
        (await inbox(request)).filter((entry) =>
          entry.kind === "webhook"
            ? entry.supportLog.description === text
            : entry.text.includes(text),
        ).length,
    )
    .toBe(2);
  const entries = await inbox(request);
  const webhook = entries.find(
    (entry) =>
      entry.kind === "webhook" && entry.supportLog.description === text,
  );
  const email = entries.find(
    (entry) => entry.kind === "email" && entry.text.includes(text),
  );
  if (webhook?.kind !== "webhook" || email?.kind !== "email")
    throw new Error("Missing deliveries");
  expect(webhook.signatureValid).toBe(true);
  expect(email.subject).toContain(webhook.supportLog.shortId);
  return { webhook, email };
}

export async function openReport(page: Page, text?: string) {
  await page
    .getByRole("button", { name: "Report an issue", exact: true })
    .click();
  await expect(card(page)).toBeVisible();
  if (text) await description(page).fill(text);
}

export async function submit(page: Page, button = "Submit") {
  const [response] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/support") &&
        response.request().method() === "POST",
    ),
    card(page).getByRole("button", { name: button, exact: true }).click(),
  ]);
  return response;
}

export async function expectSent(page: Page) {
  await expect(
    card(page)
      .getByRole("status")
      .filter({ hasText: /^Report sent Reference SL-/ }),
  ).toBeVisible();
}

export async function capture(page: Page) {
  await card(page).getByRole("button", { name: "Screenshot options" }).click();
  await card(page)
    .getByRole("button", { name: "Capture page", exact: true })
    .click();
  await expect(editor(page)).toBeVisible();
}

interface RecordedSubmission {
  readonly body: number[];
  readonly contentType: string;
}

declare global {
  interface Window {
    shotlogRecordedSubmissions: RecordedSubmission[];
  }
}

/** WebKit's routing protocol omits multipart Blob bytes. Record the real wire body
 * before fetch so fault-injection tests can inspect and replay it on every engine. */
export async function recordSubmissions(page: Page) {
  await page.evaluate(() => {
    window.shotlogRecordedSubmissions = [];
    const original = window.fetch;
    window.fetch = async (input, init) => {
      const request = new Request(input, init);
      if (
        new URL(request.url).pathname === "/api/support" &&
        request.method === "POST"
      ) {
        window.shotlogRecordedSubmissions.push({
          body: Array.from(new Uint8Array(await request.clone().arrayBuffer())),
          contentType: request.headers.get("content-type") ?? "",
        });
      }
      return original(request);
    };
  });
}

export async function recordedSubmission(page: Page) {
  const recorded = await page.evaluate(() =>
    window.shotlogRecordedSubmissions.shift(),
  );
  if (!recorded) throw new Error("Missing recorded submission");
  const body = Buffer.from(recorded.body);
  const headers = {
    "content-type": recorded.contentType,
    "content-length": String(body.length),
  };
  const form = await new Response(new Uint8Array(body), { headers }).formData();
  const part = form.get("supportLog");
  if (!(part instanceof Blob)) throw new Error("Missing supportLog part");
  const log: SupportLogSubmission = JSON.parse(await part.text());
  return { body, headers, log };
}

export async function drag(
  page: Page,
  from: [number, number],
  to: [number, number],
) {
  const box = await editor(page)
    .getByLabel(/^Screenshot canvas/)
    .boundingBox();
  if (!box) throw new Error("Missing editor canvas");
  await page.mouse.move(
    box.x + box.width * from[0],
    box.y + box.height * from[1],
  );
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], {
    steps: 8,
  });
  await page.mouse.up();
}

export function fixturePng() {
  const png = new PNG({ width: 280, height: 160 });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 220;
    png.data[i + 1] = 120;
    png.data[i + 2] = 60;
    png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}

/** Keep the real cross-origin URLs and CORS behaviour without public-network timing. */
export async function captureFixtures(page: Page) {
  await page.route("https://example.com/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>Cross-origin fixture</h1>",
    }),
  );
  await page.route("https://www.w3.org/Icons/w3c_home.png", (route) =>
    route.fulfill({ contentType: "image/png", body: fixturePng() }),
  );
  await page.route(
    "https://upload.wikimedia.org/wikipedia/commons/a/a9/Example.jpg",
    (route) =>
      route.fulfill({
        contentType: "image/png",
        headers: { "access-control-allow-origin": "*" },
        body: fixturePng(),
      }),
  );
}

export async function annotateAndRedact(page: Page) {
  await editor(page)
    .getByRole("button", { name: "Rectangle", exact: true })
    .click();
  await drag(page, [0.1, 0.1], [0.3, 0.3]);
  await editor(page)
    .getByRole("button", { name: "Pixelate / Redact", exact: true })
    .click();
  const solid = editor(page).getByRole("button", {
    name: "Solid (strongest)",
    exact: true,
  });
  if ((await solid.getAttribute("aria-pressed")) !== "true")
    await solid.click();
  await expect(solid).toHaveAttribute("aria-pressed", "true");
  await drag(page, [0.45, 0.4], [0.7, 0.6]);
  await editor(page).getByRole("button", { name: "Done", exact: true }).click();
}

export function expectRedactedPng(screenshot: Screenshot | undefined) {
  expect(screenshot?._tag).toBe("Inline");
  if (screenshot?._tag !== "Inline")
    throw new Error("Expected an inline screenshot");
  const png = PNG.sync.read(Buffer.from(screenshot.data, "base64"));
  expect([png.width, png.height]).toEqual([
    screenshot.width,
    screenshot.height,
  ]);
  // Sample a grid well inside the region drawn above, in the delivered PNG.
  for (const x of [0.48, 0.55, 0.66]) {
    for (const y of [0.43, 0.5, 0.57]) {
      const i =
        (Math.floor(png.height * y) * png.width + Math.floor(png.width * x)) *
        4;
      expect([...png.data.subarray(i, i + 4)]).toEqual([0, 0, 0, 255]);
    }
  }
  return screenshot;
}
