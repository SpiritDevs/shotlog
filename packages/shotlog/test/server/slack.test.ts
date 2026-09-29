import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createSupportHandler, type SlackConfig } from "../../src/server.js";
import { png, request, submission } from "./fixtures.js";

const api = "https://slack.test/api";
const uploadUrl = "https://files.slack.test/upload/abc";
const calls: { method: string; params: URLSearchParams | Uint8Array }[] = [];
let respond: (method: string) => Response | undefined = () => undefined;

const ok = (body: Record<string, unknown> = {}) =>
  Response.json({ ok: true, ...body });

beforeEach(() => {
  calls.length = 0;
  respond = () => undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url === uploadUrl) {
        calls.push({
          method: "upload",
          params: new Uint8Array(await new Response(init?.body).arrayBuffer()),
        });
        return new Response("OK");
      }
      const method = url.slice(api.length + 1);
      calls.push({ method, params: new URLSearchParams(String(init?.body)) });
      const custom = respond(method);
      if (custom) return custom;
      switch (method) {
        case "users.conversations":
          return ok({
            channels: [
              { id: "C2", name: "support" },
              { id: "C1", name: "bugs" },
              { id: "C3", name: "random" },
            ],
          });
        case "files.getUploadURLExternal":
          return ok({ upload_url: uploadUrl, file_id: "F1" });
        case "chat.postMessage":
          return ok({ channel: "C9", ts: "1700000000.000100" });
        default:
          return ok();
      }
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const handler = (slack: Partial<SlackConfig> = {}) =>
  createSupportHandler({
    delivery: { slack: { token: "xoxb-test", apiUrl: api, ...slack } },
    authorize: () => true,
    rateLimit: false,
  });

function withChannel(slackChannel: string, screenshot?: Blob) {
  const base = request(
    { ...submission(), description: "Broken <!channel> & more" },
    screenshot,
  );
  return base.formData().then((form) => {
    form.set("slackChannel", slackChannel);
    return new Request(base.url, { method: "POST", body: form });
  });
}

test("uploads first, posts the escaped report, then shares the Screenshot in its thread", async () => {
  const response = await handler({ channel: "#support" })(
    request(
      { ...submission(), description: "Broken <!channel> & more" },
      new Blob([png], { type: "image/png" }),
    ),
  );
  expect(response.status).toBe(200);
  expect(calls.map(({ method }) => method)).toEqual([
    "files.getUploadURLExternal",
    "upload",
    "chat.postMessage",
    "files.completeUploadExternal",
  ]);
  expect(calls[1]?.params).toEqual(png);
  const post = calls[2]?.params as URLSearchParams;
  expect(post.get("channel")).toBe("#support");
  expect(post.get("blocks")).toContain("Broken &lt;!channel&gt; &amp; more");
  expect(post.get("blocks")).not.toContain("<!channel>");
  const share = calls[3]?.params as URLSearchParams;
  // Slack answers with the channel ID, which completeUploadExternal requires.
  expect(share.get("channel_id")).toBe("C9");
  expect(share.get("thread_ts")).toBe("1700000000.000100");
  expect(JSON.parse(share.get("files") ?? "")).toEqual([
    { id: "F1", title: `Screenshot ${submission().shortId}` },
  ]);
});

test("offers only allowed channels and rejects any channel it did not offer", async () => {
  const relay = handler({ channels: ["#support", "C1"] });
  const options = await relay(new Request("https://app.example.com/support"));
  expect(await options.json()).toEqual({
    slackChannels: [
      { id: "C1", name: "bugs" },
      { id: "C2", name: "support" },
    ],
  });

  const rejected = await relay(await withChannel("C3"));
  expect(rejected.status).toBe(400);
  expect(calls.some(({ method }) => method === "chat.postMessage")).toBe(false);

  const accepted = await relay(await withChannel("C2"));
  expect(accepted.status).toBe(200);
  const post = calls.find(({ method }) => method === "chat.postMessage");
  expect((post?.params as URLSearchParams | undefined)?.get("channel")).toBe(
    "C2",
  );
  // The channel list is cached, not fetched per request.
  expect(
    calls.filter(({ method }) => method === "users.conversations"),
  ).toHaveLength(1);
});

test("retries rate limits, fails fast on Slack errors, and keeps a posted report when sharing fails", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  let limited = 1;
  respond = (method) =>
    method === "chat.postMessage" && limited-- > 0
      ? new Response(null, { status: 429 })
      : undefined;
  expect((await handler({ channel: "C1" })(request())).status).toBe(200);
  expect(
    calls.filter(({ method }) => method === "chat.postMessage"),
  ).toHaveLength(2);

  calls.length = 0;
  respond = (method) =>
    method === "chat.postMessage"
      ? Response.json({ ok: false, error: "not_in_channel" })
      : undefined;
  const failed = await handler({ channel: "C1" })(request(submission(2)));
  expect(failed.status).toBe(502);
  expect(await failed.json()).toMatchObject({
    error: { _tag: "DeliveryFailed", channel: "slack" },
  });
  expect(calls).toHaveLength(1);
  expect(error).toHaveBeenCalledWith(
    "shotlog: Slack chat.postMessage failed with not_in_channel",
  );

  respond = (method) =>
    method === "files.completeUploadExternal"
      ? Response.json({ ok: false, error: "file_not_found" })
      : undefined;
  const shared = await handler({ channel: "C1" })(
    request(submission(3), new Blob([png], { type: "image/png" })),
  );
  expect(shared.status).toBe(200);
});

test("routes mapped Types to their own channel and lets Reporters choose for the rest", async () => {
  const relay = handler({ channel: { Bug: "#bugs" } });
  const options = await relay(new Request("https://app.example.com/support"));
  expect(await options.json()).toMatchObject({ slackFixedTypes: ["Bug"] });

  // A mapped Type ignores whatever channel the browser sends.
  expect((await relay(await withChannel("C3"))).status).toBe(200);
  const post = calls.find(({ method }) => method === "chat.postMessage");
  expect((post?.params as URLSearchParams | undefined)?.get("channel")).toBe(
    "#bugs",
  );

  const question = await relay(request({ ...submission(2), type: "Question" }));
  expect(question.status).toBe(400);
});
