import { afterEach, expect, test, vi } from "vitest";
import { renderEmail } from "../../src/server/email-template.js";
import {
  createSupportHandler,
  DeliveryFailed,
  ProviderNotInstalled,
  resend,
  UnsupportedRuntime,
} from "../../src/server.js";
import { ses } from "../../src/ses.js";
import { smtp } from "../../src/smtp.js";
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
  vi.doUnmock("@aws-sdk/client-sesv2");
  vi.doUnmock("nodemailer");
  vi.resetModules();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

test.each([
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

test("Resend sends REST field names and treats non-2xx responses as failures without retry", async () => {
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
  expect(init?.method).toBe("POST");
  expect(new Headers(init?.headers).get("authorization")).toBe(
    "Bearer re_test",
  );
  expect(new Headers(init?.headers).get("content-type")).toBe(
    "application/json",
  );
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

test.each(["resend", "ses"] as const)(
  "%s aborts the underlying request before its timeout rejects",
  async (name) => {
    const { SendEmailCommand } = await vi.importActual<
      typeof import("@aws-sdk/client-sesv2")
    >("@aws-sdk/client-sesv2");
    let signal: AbortSignal | undefined;
    const aborted = vi.fn();
    const pending = (value: AbortSignal | null | undefined) => {
      if (!value) throw new Error("Missing transport cancellation signal");
      signal = value;
      return new Promise<never>((_resolve, reject) => {
        value.addEventListener(
          "abort",
          () => {
            aborted();
            reject(value.reason);
          },
          { once: true },
        );
      });
    };
    const fetch = vi.fn<typeof globalThis.fetch>((_url, init) =>
      pending(init?.signal),
    );
    vi.stubGlobal("fetch", fetch);
    const send = vi.fn(
      (_command: unknown, options: { abortSignal: AbortSignal }) =>
        pending(options.abortSignal),
    );
    const destroy = vi.fn();
    vi.doMock("@aws-sdk/client-sesv2", () => ({
      SendEmailCommand,
      SESv2Client: class {
        send = send;
        destroy = destroy;
      },
    }));
    vi.useFakeTimers();
    const provider =
      name === "resend"
        ? resend({ apiKey: "test" })
        : ses({ region: "us-east-1" });
    const result = expect(provider.send(message)).rejects.toBeInstanceOf(
      DeliveryFailed,
    );
    await vi.waitFor(() => expect(signal).toBeDefined());
    await vi.advanceTimersByTimeAsync(15_000);
    await result;
    expect(signal?.aborted).toBe(true);
    expect(aborted).toHaveBeenCalledOnce();
    expect(name === "resend" ? fetch : send).toHaveBeenCalledOnce();
    if (name === "ses") expect(destroy).toHaveBeenCalledOnce();
  },
);

test("SMTP holds admission and coalesces duplicates past 15 seconds until sendMail settles", async () => {
  let release = () => {};
  const sendMail = vi.fn(
    () =>
      new Promise<{ rejected: string[] }>((resolve) => {
        release = () => resolve({ rejected: [] });
      }),
  );
  const close = vi.fn();
  const createTransport = vi.fn(() => ({ sendMail, close }));
  vi.doMock("nodemailer", () => ({ default: { createTransport } }));
  vi.useFakeTimers();
  const handler = createSupportHandler({
    delivery: {
      email: {
        from: message.from,
        to: message.to,
        provider: smtp({ host: "localhost", port: 2525 }),
      },
    },
    authorize: () => true,
    rateLimit: false,
    limits: { concurrentRequests: 2 },
  });
  const settled = vi.fn();
  const first = handler(request()).then((response) => {
    settled();
    return response;
  });
  await vi.waitFor(() => expect(sendMail).toHaveBeenCalledOnce());
  const duplicate = handler(request()).then((response) => {
    settled();
    return response;
  });
  await vi.advanceTimersByTimeAsync(16_000);
  expect(settled).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
  expect(sendMail).toHaveBeenCalledOnce();
  expect(createTransport).toHaveBeenCalledWith({
    host: "localhost",
    port: 2525,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 15_000,
  });
  const blocked = request(submission(2));
  expect((await handler(blocked)).status).toBe(429);
  expect(blocked.bodyUsed).toBe(false);
  release();
  const responses = await Promise.all([first, duplicate]);
  expect(responses.map((response) => response.status)).toEqual([200, 200]);
  expect(
    await Promise.all(responses.map((response) => response.json())),
  ).toEqual([
    expect.objectContaining({ duplicate: false }),
    expect.objectContaining({ duplicate: true }),
  ]);
  expect(close).toHaveBeenCalledOnce();
  sendMail.mockResolvedValue({ rejected: [] });
  expect((await handler(request(submission(2)))).status).toBe(200);
  expect(sendMail).toHaveBeenCalledTimes(2);
});
