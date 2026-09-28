import { afterEach, expect, test, vi } from "vitest";
import { renderEmail } from "../../src/server/email-template.js";
import {
  createSupportHandler,
  DeliveryFailed,
  ProviderNotInstalled,
  resend,
  ses,
  smtp,
  UnsupportedRuntime,
} from "../../src/server.js";
import { png, request, submission } from "./fixtures.js";

const message = renderEmail(
  {
    from: "reports@example.com",
    to: "support@example.com",
    provider: { name: "test", send: async () => {} },
  },
  submission(),
);

afterEach(() => {
  vi.doUnmock("resend");
  vi.doUnmock("@aws-sdk/client-sesv2");
  vi.doUnmock("nodemailer");
  vi.resetModules();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test.each([
  { packageName: "resend", create: () => resend({ apiKey: "test" }) },
  {
    packageName: "@aws-sdk/client-sesv2",
    create: () => ses({ region: "us-east-1" }),
  },
  {
    packageName: "nodemailer",
    create: () => smtp({ host: "127.0.0.1", port: 2525 }),
  },
])(
  "lazily reports missing $packageName only to the server and returns generic 502",
  async ({ packageName, create }) => {
    const load = vi.fn(() => {
      throw new Error("Cannot find package");
    });
    vi.doMock(packageName, load);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const provider = create();
    expect(load).not.toHaveBeenCalled();
    await expect(provider.send(message)).rejects.toMatchObject({
      _tag: "ProviderNotInstalled",
      packageName,
      installCommand: `npm install ${packageName}`,
    });
    const handler = createSupportHandler({
      delivery: { email: { from: message.from, to: message.to, provider } },
      authorize: () => true,
      rateLimit: false,
    });
    const response = await handler(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        _tag: "DeliveryFailed",
        channel: "email",
        message: "Support Log delivery through email failed",
      },
    });
    expect(logged).toHaveBeenCalledWith(
      "shotlog: email provider misconfiguration",
      expect.any(ProviderNotInstalled),
    );
    expect(logged.mock.calls[0]?.[1]).toMatchObject({
      installCommand: `npm install ${packageName}`,
    });
  },
);

test("SMTP rejects a non-Node runtime before importing nodemailer and hides details at the relay", async () => {
  const load = vi.fn();
  vi.doMock("nodemailer", load);
  vi.stubGlobal("process", { ...process, release: { name: "edge" } });
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  const provider = smtp({ host: "127.0.0.1", port: 2525 });
  await expect(provider.send(message)).rejects.toBeInstanceOf(
    UnsupportedRuntime,
  );
  const handler = createSupportHandler({
    delivery: { email: { from: message.from, to: message.to, provider } },
    authorize: () => true,
    rateLimit: false,
  });
  const response = await handler(request());
  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({
    error: { _tag: "DeliveryFailed", channel: "email" },
  });
  expect(logged).toHaveBeenCalledWith(
    "shotlog: email provider misconfiguration",
    expect.any(UnsupportedRuntime),
  );
  expect(load).not.toHaveBeenCalled();
});

test("Resend's installed SDK sends CID attachments and treats returned API errors as failures without retry", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({ id: "sent" }),
  );
  vi.stubGlobal("fetch", fetch);
  const provider = resend({ apiKey: "re_test" });
  const attachment = {
    filename: "screenshot.png",
    contentType: "image/png",
    content: png,
  };
  await provider.send({
    ...message,
    replyTo: "reporter@example.com",
    attachments: [
      { ...attachment, contentId: "screenshot@shotlog" },
      attachment,
    ],
  });
  expect(fetch).toHaveBeenCalledOnce();
  const [url, init] = fetch.mock.calls[0] ?? [];
  expect(url).toBe("https://api.resend.com/emails");
  expect(JSON.parse(String(init?.body))).toMatchObject({
    from: message.from,
    to: message.to,
    reply_to: "reporter@example.com",
    attachments: [
      {
        filename: "screenshot.png",
        content_type: "image/png",
        content_id: "screenshot@shotlog",
        content: Buffer.from(png).toString("base64"),
      },
      {
        filename: "screenshot.png",
        content_type: "image/png",
        content: Buffer.from(png).toString("base64"),
      },
    ],
  });
  fetch.mockResolvedValueOnce(
    Response.json(
      { name: "validation_error", message: "Private provider details" },
      { status: 422 },
    ),
  );
  await expect(provider.send(message)).rejects.toBeInstanceOf(DeliveryFailed);
  expect(fetch).toHaveBeenCalledTimes(2);
});

test("SES uses Raw MIME, disables SDK retries, and releases the client", async () => {
  const { SendEmailCommand } = await vi.importActual<
    typeof import("@aws-sdk/client-sesv2")
  >("@aws-sdk/client-sesv2");
  const send = vi.fn(
    async (_command: InstanceType<typeof SendEmailCommand>) => ({}),
  );
  const destroy = vi.fn();
  const options = vi.fn();
  vi.doMock("@aws-sdk/client-sesv2", () => ({
    SendEmailCommand,
    SESv2Client: class {
      constructor(config: unknown) {
        options(config);
      }
      send = send;
      destroy = destroy;
    },
  }));
  await ses({ region: "ap-southeast-2" }).send(message);
  expect(options).toHaveBeenCalledWith({
    region: "ap-southeast-2",
    maxAttempts: 1,
  });
  const command = send.mock.calls[0]?.[0];
  expect(command).toBeInstanceOf(SendEmailCommand);
  expect(command?.input).toMatchObject({
    FromEmailAddress: message.from,
    Destination: { ToAddresses: message.to },
    Content: { Raw: { Data: expect.any(Uint8Array) } },
  });
  expect(new TextDecoder().decode(command?.input.Content?.Raw?.Data)).toContain(
    "Content-Type: multipart/mixed",
  );
  expect(send).toHaveBeenCalledOnce();
  expect(destroy).toHaveBeenCalledOnce();
});
