import { afterEach, expect, test, vi } from "vitest";
import {
  createSupportHandler,
  ProviderNotInstalled,
  UploadFailed,
} from "../../src/server.js";
import { uploadfile } from "../../src/uploadfile.js";
import { png, request, submission } from "./fixtures.js";

const data = {
  key: "file-key",
  url: "https://legacy.example.com/file-key",
  ufsUrl: "https://files.example.com/file-key",
};
const signedUrl = "https://files.example.com/file-key?signed=example";
const info = () => ({
  id: submission().id,
  filename: `support-log-${submission().id}.png`,
  signal: new AbortController().signal,
});

function mockSdk() {
  const uploadFiles = vi.fn().mockResolvedValue({ data, error: null });
  const getSignedURL = vi.fn().mockResolvedValue({ ufsUrl: signedUrl });
  const configure =
    vi.fn<(options: { token?: string; fetch: typeof fetch }) => void>();
  const load = vi.fn(() => ({
    UFApi: class {
      constructor(options: { token?: string; fetch: typeof fetch }) {
        configure(options);
      }
      uploadFiles = uploadFiles;
      getSignedURL = getSignedURL;
    },
    UFFile: class extends Blob {
      constructor(
        parts: BlobPart[],
        readonly name: string,
        readonly options: BlobPropertyBag & { customId: string },
      ) {
        super(parts, options);
      }
    },
  }));
  vi.doMock("@uploadfile/core/server", load);
  return { uploadFiles, getSignedURL, configure, load };
}

afterEach(() => {
  vi.doUnmock("@uploadfile/core/server");
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

test("loads lazily, captures the token at call time, and uploads a PNG with its ID and abort signal", async () => {
  const sdk = mockSdk();
  vi.stubEnv("UPLOADFILE_TOKEN", "first-token");
  const adapter = uploadfile();
  expect(sdk.load).not.toHaveBeenCalled();
  vi.stubEnv("UPLOADFILE_TOKEN", "changed-token");
  const metadata = info();
  expect(await adapter.upload(png, metadata)).toEqual({
    url: data.ufsUrl,
    key: data.key,
  });
  expect(sdk.configure).toHaveBeenCalledWith(
    expect.objectContaining({ token: "first-token" }),
  );
  const file: Blob = sdk.uploadFiles.mock.calls[0]?.[0];
  expect(file).toMatchObject({
    name: metadata.filename,
    type: "image/png",
    options: { customId: metadata.id },
  });
  expect(new Uint8Array(await file.arrayBuffer())).toEqual(png);
  expect(sdk.uploadFiles).toHaveBeenCalledWith(file, {
    acl: "public-read",
    signal: metadata.signal,
  });
  expect(sdk.getSignedURL).not.toHaveBeenCalled();
  await uploadfile({ token: "explicit-token" }).upload(png, info());
  expect(sdk.configure).toHaveBeenLastCalledWith(
    expect.objectContaining({ token: "explicit-token" }),
  );
  await uploadfile().upload(png, info());
  expect(sdk.configure).toHaveBeenLastCalledWith(
    expect.objectContaining({ token: "changed-token" }),
  );
});

test.each([undefined, 3600, 604800])(
  "private uploads return expiring signed URLs (expiry %s)",
  async (signedUrlExpiresIn) => {
    const sdk = mockSdk();
    const adapter = uploadfile({
      token: "test-token",
      acl: "private",
      ...(signedUrlExpiresIn === undefined ? {} : { signedUrlExpiresIn }),
    });
    expect(await adapter.upload(png, info())).toEqual({
      url: signedUrl,
      key: data.key,
    });
    expect(sdk.uploadFiles).toHaveBeenCalledWith(
      expect.any(Blob),
      expect.objectContaining({ acl: "private" }),
    );
    expect(sdk.getSignedURL).toHaveBeenCalledExactlyOnceWith(data.key, {
      expiresIn: signedUrlExpiresIn ?? 604800,
    });
  },
);

test("rejects invalid signed URL durations before loading the SDK", () => {
  const sdk = mockSdk();
  for (const signedUrlExpiresIn of [0, -1, 0.5, 604801, Number.NaN, Infinity]) {
    expect(() => uploadfile({ acl: "private", signedUrlExpiresIn })).toThrow(
      TypeError,
    );
  }
  expect(sdk.load).not.toHaveBeenCalled();
});

test("does not pick up a token set after an unconfigured adapter was created", async () => {
  const sdk = mockSdk();
  vi.stubEnv("UPLOADFILE_TOKEN", undefined);
  const adapter = uploadfile();
  vi.stubEnv("UPLOADFILE_TOKEN", "later-token");
  await expect(adapter.upload(png, info())).rejects.toBeInstanceOf(
    UploadFailed,
  );
  expect(sdk.configure).not.toHaveBeenCalled();
});

test.each(["resolved error", "rejection", "signing error", "missing SDK"])(
  "%s rejects with a public error and the relay still delivers inline",
  async (failure) => {
    if (failure === "missing SDK") {
      vi.doMock("@uploadfile/core/server", () => {
        throw new Error("Cannot find private SDK path");
      });
    } else {
      const sdk = mockSdk();
      if (failure === "resolved error") {
        sdk.uploadFiles.mockResolvedValue({
          data: null,
          error: { message: "secret-provider-error" },
        });
      } else if (failure === "rejection") {
        sdk.uploadFiles.mockRejectedValue(new Error("secret-provider-error"));
      } else {
        sdk.getSignedURL.mockRejectedValue(new Error("secret-provider-error"));
      }
    }
    const adapter = uploadfile({ token: "test-token", acl: "private" });
    await expect(adapter.upload(png, info())).rejects.toBeInstanceOf(
      failure === "missing SDK" ? ProviderNotInstalled : UploadFailed,
    );
    if (failure === "missing SDK") {
      await expect(adapter.upload(png, info())).rejects.toMatchObject({
        packageName: "@uploadfile/core",
        installCommand: "npm install @uploadfile/core",
      });
    }
    const fetchStub = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 204 }),
    );
    vi.stubGlobal("fetch", fetchStub);
    const handler = createSupportHandler({
      delivery: {
        webhook: {
          url: "https://receiver.example.com",
          secret: "test-secret",
          screenshotMode: "upload",
          storage: adapter,
        },
      },
      authorize: () => true,
      rateLimit: false,
    });
    const response = await handler(request(submission(), new Blob([png])));
    expect(response.status).toBe(200);
    expect(
      JSON.parse(String(fetchStub.mock.calls[0]?.[1]?.body)),
    ).toMatchObject({
      ...submission(),
      screenshot: {
        _tag: "Inline",
        data: Buffer.from(png).toString("base64"),
        uploadError: "Screenshot upload failed",
      },
    });
  },
);

test("an aborted upload never starts SDK work after lazy loading", async () => {
  const sdk = mockSdk();
  const controller = new AbortController();
  controller.abort();
  await expect(
    uploadfile({ token: "test-token" }).upload(png, {
      ...info(),
      signal: controller.signal,
    }),
  ).rejects.toBeInstanceOf(UploadFailed);
  expect(sdk.configure).not.toHaveBeenCalled();
  expect(sdk.uploadFiles).not.toHaveBeenCalled();
});

test("the handler deadline also aborts the private URL signing request", async () => {
  const sdk = mockSdk();
  let signingSignal: AbortSignal | null | undefined;
  const fetchStub = vi.fn<typeof fetch>((url, init) => {
    if (url === "https://sign.example.com") {
      signingSignal = init?.signal;
      return new Promise((_resolve, reject) => {
        signingSignal?.addEventListener(
          "abort",
          () => reject(new Error("aborted")),
          { once: true },
        );
      });
    }
    return Promise.resolve(new Response(null, { status: 204 }));
  });
  vi.stubGlobal("fetch", fetchStub);
  sdk.getSignedURL.mockImplementation(async () => {
    const config = sdk.configure.mock.calls[0]?.[0];
    await config?.fetch("https://sign.example.com", {
      signal: new AbortController().signal,
    });
    return { ufsUrl: signedUrl };
  });
  vi.useFakeTimers();
  const handler = createSupportHandler({
    delivery: {
      webhook: {
        url: "https://receiver.example.com",
        secret: "test-secret",
        screenshotMode: "upload",
        storage: uploadfile({ token: "test-token", acl: "private" }),
      },
    },
    authorize: () => true,
    rateLimit: false,
  });
  const response = handler(request(submission(), new Blob([png])));
  await vi.waitFor(() => expect(signingSignal).toBeDefined());
  await vi.advanceTimersByTimeAsync(10_000);
  expect((await response).status).toBe(200);
  expect(signingSignal?.aborted).toBe(true);
  const payload = JSON.parse(String(fetchStub.mock.calls[1]?.[1]?.body));
  expect(payload.screenshot).toMatchObject({
    _tag: "Inline",
    uploadError: "Screenshot upload timed out",
  });
  expect(sdk.uploadFiles).toHaveBeenCalledOnce();
  expect(sdk.uploadFiles.mock.calls[0]?.[1].signal.aborted).toBe(true);
});

const recordingToken = btoa(
  JSON.stringify({
    apiKey: "sk_test_key",
    appId: "app",
    regions: ["sea1"],
    url: "https://uf.example.com",
  }),
);
const session = {
  url: "https://uf.example.com/api/v1/uploads/session-1",
  key: "video-key",
  ufsUrl: "https://files.example.com/f/video-key",
  uploadToken: "session-only-token",
  sessionId: "session-1",
  size: 5000,
  partSize: 4096,
  partCount: 2,
};
const recordingInfo = () => ({
  id: submission().id,
  filename: `support-log-${submission().id}.webm`,
  size: 5000,
  mimeType: "video/webm;codecs=vp9,opus",
  signal: new AbortController().signal,
});

test("reserves a recording upload with the token, handing the browser only the session", async () => {
  const fetchStub = vi.fn<typeof fetch>(async () =>
    Response.json({ uploads: [session] }),
  );
  vi.stubGlobal("fetch", fetchStub);
  const upload = await uploadfile({ token: recordingToken }).createUpload(
    recordingInfo(),
  );
  const [url, init] = fetchStub.mock.calls[0] ?? [];
  expect(url).toBe("https://uf.example.com/api/v1/uploads");
  expect(new Headers(init?.headers).get("authorization")).toBe(
    "Bearer sk_test_key",
  );
  expect(JSON.parse(String(init?.body))).toMatchObject({
    files: [
      {
        name: `support-log-${submission().id}.webm`,
        size: 5000,
        type: "video/webm",
        acl: "public-read",
      },
    ],
  });
  expect(upload.target).toEqual({
    _tag: "UploadFile",
    url: session.url,
    uploadToken: "session-only-token",
    partSize: 4096,
    partCount: 2,
  });
  expect(JSON.stringify(upload)).not.toContain("sk_test_key");
  expect(
    await uploadfile({ token: recordingToken }).resolveUpload(upload.ticket, {
      signal: new AbortController().signal,
    }),
  ).toEqual({ url: session.ufsUrl, key: "video-key" });
});

test("only resolves tickets it signed, and signs private recordings on resolve", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ uploads: [session] })),
  );
  const { ticket } = await uploadfile({ token: recordingToken }).createUpload(
    recordingInfo(),
  );
  const signal = new AbortController().signal;
  const [payload = "", signature = ""] = ticket.split(".");
  const forged = `${btoa(JSON.stringify({ key: "payroll.pdf", url: "https://files.example.com/f/payroll.pdf" })).replace(/=+$/, "")}.${signature}`;
  for (const bad of [forged, `${payload}.x${signature.slice(1)}`, "nonsense"])
    await expect(
      uploadfile({ token: recordingToken }).resolveUpload(bad, { signal }),
    ).rejects.toBeInstanceOf(UploadFailed);
  const otherToken = btoa(
    JSON.stringify({ apiKey: "sk_other", appId: "a", regions: ["r"] }),
  );
  await expect(
    uploadfile({ token: otherToken }).resolveUpload(ticket, { signal }),
  ).rejects.toBeInstanceOf(UploadFailed);
  const sdk = mockSdk();
  const { uploadfile: fresh } = await import("../../src/uploadfile.js");
  expect(
    await fresh({ token: recordingToken, acl: "private" }).resolveUpload(
      ticket,
      { signal },
    ),
  ).toEqual({ url: signedUrl, key: "video-key" });
  expect(sdk.getSignedURL).toHaveBeenCalledWith("video-key", {
    expiresIn: 604800,
  });
});

test("fails a recording upload without a usable token or session", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ uploads: [{ ...session, size: 1 }] })),
  );
  await expect(
    uploadfile({ token: "" }).createUpload(recordingInfo()),
  ).rejects.toBeInstanceOf(UploadFailed);
  await expect(
    uploadfile({ token: "not-base64-json" }).createUpload(recordingInfo()),
  ).rejects.toBeInstanceOf(UploadFailed);
  await expect(
    uploadfile({ token: recordingToken }).createUpload(recordingInfo()),
  ).rejects.toBeInstanceOf(UploadFailed);
});
