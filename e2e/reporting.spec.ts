import {
  annotateAndRedact,
  capture,
  card,
  delivered,
  description,
  editor,
  expect,
  expectRedactedPng,
  expectSent,
  inbox,
  openReport,
  recordedSubmission,
  recordSubmissions,
  resetRelay,
  routeSubmissionOnce,
  submit,
  test,
} from "./helpers.js";

test.beforeEach(async ({ request, page }) => {
  await resetRelay(request);
  await page.goto("/");
});

test("standalone capture, annotations, and solid redaction reach both delivery channels", async ({
  page,
  request,
}) => {
  const text = "The save button needs a rectangle and a private region.";
  await openReport(page, text);
  await card(page).getByRole("radio", { name: "Idea", exact: true }).check();
  await capture(page);
  await annotateAndRedact(page);
  await expect(
    card(page).getByRole("img", { name: "Attached screenshot" }),
  ).toBeVisible();
  expect((await submit(page)).status()).toBe(200);
  await expectSent(page);
  const { webhook, email } = await delivered(request, text);
  expect(webhook.supportLog.type).toBe("Idea");
  const screenshot = webhook.supportLog.screenshot;
  const image = expectRedactedPng(screenshot);
  const inline = email.attachments.find((attachment) => attachment.contentId);
  expect(inline).toMatchObject({
    contentType: "image/png",
    disposition: "inline",
    size: image.size,
  });
  expect(email.sourceHtml).toContain(`cid:${inline?.contentId}`);
  expect(email.attachments).toContainEqual(
    expect.objectContaining({
      contentType: "image/png",
      disposition: "attachment",
      size: image.size,
    }),
  );
});

test("Slack: the Reporter picks a channel and the Screenshot lands in its thread", async ({
  page,
  request,
}) => {
  const settings = { authorize: "allow", rateLimit: false, slack: "choose" };
  expect((await request.put("/_settings", { data: settings })).ok()).toBe(true);
  const text = "Slack should get this in #design-feedback.";
  await openReport(page, text);
  const channel = card(page).getByRole("combobox", { name: "Slack channel" });
  await expect(channel.getByRole("option")).toHaveText([
    "#bugs",
    "#design-feedback",
    "#support",
  ]);
  await channel.selectOption({ label: "#design-feedback" });
  await capture(page);
  await editor(page).getByRole("button", { name: "Done" }).click();
  expect((await submit(page)).status()).toBe(200);
  await expect
    .poll(async () =>
      (await inbox(request)).find(
        (entry) => entry.kind === "slack" && entry.screenshot,
      ),
    )
    .toMatchObject({
      channel: "design-feedback",
      text: expect.stringContaining(text),
      screenshot: expect.stringMatching(/^data:image\/png;base64,/),
    });
});

test("programmatic mode submits the host context without a screenshot", async ({
  page,
  request,
}) => {
  await page.getByRole("checkbox", { name: "Launcher", exact: true }).uncheck();
  await expect(
    page.getByRole("button", { name: "Report an issue" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Open report card (Programmatic)" })
    .click();
  const text = "A report opened by useShotlog.";
  await description(page).fill(text);
  expect((await submit(page)).status()).toBe(200);
  await expectSent(page);
  const { webhook, email } = await delivered(request, text);
  expect(webhook.supportLog.screenshot).toBeUndefined();
  expect(webhook.supportLog.reporter).toMatchObject({
    id: "playground-user",
    email: "alex@example.com",
  });
  expect(webhook.supportLog.metadata).toMatchObject({ tenant: "playground" });
  expect(email.attachments).toEqual([]);
});

test("authorize rejects unauthenticated and forbidden reports without delivery", async ({
  page,
  request,
}) => {
  for (const [value, status, message] of [
    ["unauthorized", 401, "Please sign in, then try again."],
    ["forbidden", 403, "You don't have permission to send a report."],
  ] as const) {
    await page
      .getByRole("combobox", { name: "Authorize", exact: true })
      .selectOption(value);
    await expect(
      page.getByRole("combobox", { name: "Authorize", exact: true }),
    ).toBeEnabled();
    await openReport(page, "An unauthorized report.");
    const send = card(page).getByRole("button", { name: /^(Submit|Retry)$/ });
    const response = page.waitForResponse("**/api/support");
    await send.click();
    expect((await response).status()).toBe(status);
    await expect(
      card(page).getByRole("status").filter({ hasText: message }),
    ).toBeVisible();
    await expect(
      card(page).getByRole("button", { name: "Retry", exact: true }),
    ).toBeEnabled();
    await card(page).getByRole("button", { name: "Close report" }).click();
  }
  expect(await inbox(request)).toEqual([]);
});

test("Fire 20 exhausts the rate limit and the card explains the wait", async ({
  page,
  request,
}) => {
  test.setTimeout(45_000);
  await page.getByRole("button", { name: "Fire 20 submissions" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "20/20 completed" }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole("listitem", { name: /^Submission \d+: 200$/ }),
  ).toHaveCount(5);
  await expect(
    page.getByRole("listitem", { name: /^Submission \d+: 429$/ }),
  ).toHaveCount(15);
  await openReport(page, "A rate-limited card submission.");
  expect((await submit(page)).status()).toBe(429);
  await expect(
    card(page)
      .getByRole("status")
      .filter({
        hasText: /You're sending too fast — try again in \d+ minutes?\./,
      }),
  ).toBeVisible();
  await expect(
    card(page).getByRole("button", { name: "Retry", exact: true }),
  ).toBeEnabled();
  const entries = await inbox(request);
  expect(entries.filter((entry) => entry.kind === "webhook")).toHaveLength(5);
  expect(entries.filter((entry) => entry.kind === "email")).toHaveLength(5);
});

test("oversized PNG is rejected with HTTP 413 and no delivery", async ({
  page,
  request,
}) => {
  const response = page.waitForResponse("**/api/support");
  await page
    .getByRole("button", { name: "Oversized screenshot", exact: true })
    .click();
  const rejected = await response;
  expect(rejected.status()).toBe(413);
  expect(await rejected.json()).toMatchObject({
    ok: false,
    error: { _tag: "PayloadTooLarge" },
  });
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Oversized screenshot: HTTP 413" }),
  ).toBeVisible();
  expect(await inbox(request)).toEqual([]);
});

test("lost response survives reload and Submit deduplicates both channels", async ({
  page,
  request,
}) => {
  const text = "This was delivered before the response disappeared.";
  let deliveredId = "";
  let deliveredShortId = "";
  await recordSubmissions(page);
  await routeSubmissionOnce(page, async (route) => {
    const recorded = await recordedSubmission(page);
    const response = await route.fetch({
      postData: recorded.body,
      headers: { ...route.request().headers(), ...recorded.headers },
    });
    expect(response.status()).toBe(200);
    const result = await response.json();
    expect(result.duplicate).toBe(false);
    deliveredId = result.id;
    deliveredShortId = result.shortId;
    await route.abort("failed");
  });
  await openReport(page, text);
  await card(page).getByRole("button", { name: "Submit", exact: true }).click();
  await expect(
    card(page)
      .getByRole("status")
      .filter({ hasText: "You're offline or couldn't connect." }),
  ).toBeVisible();
  await delivered(request, text);
  await page.reload();
  await openReport(page);
  await expect(description(page)).toHaveValue(text);
  // A fresh page restores the identity, but has no failed attempt in this session.
  const response = await submit(page);
  expect(await response.json()).toMatchObject({
    ok: true,
    id: deliveredId,
    shortId: deliveredShortId,
    duplicate: true,
  });
  await expect(
    card(page)
      .getByRole("status")
      .filter({ hasText: `Reference ${deliveredShortId}` }),
  ).toHaveText(`Report sent Reference ${deliveredShortId}`);
  const entries = await inbox(request);
  // Dual-channel delivery means one webhook and one email for this Support Log.
  expect(entries).toHaveLength(2);
  expect(
    entries.filter(
      (entry) =>
        entry.kind === "webhook" && entry.supportLog.id === deliveredId,
    ),
  ).toHaveLength(1);
  expect(
    entries.filter(
      (entry) =>
        entry.kind === "email" && entry.subject.includes(deliveredShortId),
    ),
  ).toHaveLength(1);
});

test("editing after a failed attempt creates a new ID and delivers the edited report", async ({
  page,
  request,
}) => {
  let failedId = "";
  await recordSubmissions(page);
  await routeSubmissionOnce(page, async (route) => {
    failedId = (await recordedSubmission(page)).log.id;
    await route.abort("failed");
  });
  await openReport(page, "Original description before failure.");
  await card(page).getByRole("button", { name: "Submit", exact: true }).click();
  await expect(
    card(page).getByRole("button", { name: "Retry", exact: true }),
  ).toBeEnabled();
  const text = "Edited description after failure.";
  await description(page).fill(text);
  const response = await submit(page, "Retry");
  const result = await response.json();
  expect(result.duplicate).toBe(false);
  expect(result.id).not.toBe(failedId);
  await expectSent(page);
  const { webhook } = await delivered(request, text);
  expect(webhook.supportLog.id).toBe(result.id);
  expect(await inbox(request)).toHaveLength(2);
});

test("stalled relay reaches the 60-second Offline deadline and Retry succeeds", async ({
  page,
  request,
}) => {
  await page.clock.install();
  // Leave one routed request pending, then advance the actual client timer.
  await routeSubmissionOnce(page, () => {});
  const text = "The relay stopped responding.";
  await openReport(page, text);
  const pending = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/support") && request.method() === "POST",
  );
  await card(page).getByRole("button", { name: "Submit", exact: true }).click();
  await pending;
  await page.clock.fastForward(60_001);
  await expect(
    card(page)
      .getByRole("status")
      .filter({ hasText: "You're offline or couldn't connect." }),
  ).toBeVisible();
  expect(await inbox(request)).toEqual([]);
  // WebKit keeps request interception active while the stalled route is pending and
  // drops multipart Blob bodies on intercepted requests. Real browsers never route.
  await page.unrouteAll({ behavior: "ignoreErrors" });
  expect((await submit(page, "Retry")).status()).toBe(200);
  await expectSent(page);
  await delivered(request, text);
});

test("Diagnostic Trail delivers warnings, errors and failed fetches without URL tokens", async ({
  page,
  request,
}) => {
  await page.getByRole("button", { name: "console.warn", exact: true }).click();
  const error = page.waitForEvent(
    "pageerror",
    (error) => error.message === "Playground uncaught error",
  );
  await page
    .getByRole("button", { name: "Throw an error", exact: true })
    .click();
  await error;
  for (const name of ["Failing fetch", "Request with token"]) {
    const response = page.waitForResponse((response) =>
      response.url().includes("/api/nope"),
    );
    await page.getByRole("button", { name, exact: true }).click();
    expect((await response).status()).toBe(404);
  }
  const text = "Inspect my recent diagnostic failures.";
  await openReport(page, text);
  expect((await submit(page)).status()).toBe(200);
  const { webhook, email } = await delivered(request, text);
  const trail = webhook.supportLog.diagnostics;
  expect(trail?.console).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        level: "warn",
        message: expect.stringContaining("Playground warning"),
      }),
      expect.objectContaining({
        level: "error",
        message: "Playground uncaught error",
      }),
    ]),
  );
  expect(
    trail?.network.filter((entry) => entry.url.endsWith("/api/nope")),
  ).toHaveLength(2);
  for (const entry of trail?.network ?? []) {
    expect(entry.status).toBe(404);
    expect(new URL(entry.url).search).toBe("");
  }
  expect(JSON.stringify(webhook.supportLog)).not.toContain("secret123");
  expect(email.text).not.toContain("secret123");
});
