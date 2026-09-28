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
    const sdk = mockSdk();
    if (failure === "missing SDK") {
      vi.doMock("@uploadfile/core/server", () => {
        throw new Error("Cannot find private SDK path");
      });
    } else if (failure === "resolved error") {
      sdk.uploadFiles.mockResolvedValue({
        data: null,
        error: { message: "secret-provider-error" },
      });
    } else if (failure === "rejection") {
      sdk.uploadFiles.mockRejectedValue(new Error("secret-provider-error"));
    } else {
      sdk.getSignedURL.mockRejectedValue(new Error("secret-provider-error"));
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
  await vi.advanceTimersByTimeAsync(30_000);
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
