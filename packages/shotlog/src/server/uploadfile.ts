import { Effect } from "effect";
import { UploadFailed } from "../internal/errors.js";
import { runPublic } from "../internal/runtime.js";
import type { StorageAdapter } from "./storage-types.js";
import { lazySdk } from "./transport.js";

/**
 * UploadFile credentials and Screenshot access policy, held only on the server.
 * @example
 * ```ts
 * import type { UploadfileOptions } from "shotlog/uploadfile";
 * const options: UploadfileOptions = { acl: "private", signedUrlExpiresIn: 3600 };
 * ```
 * @public
 */
export interface UploadfileOptions {
  /** Defaults to process.env.UPLOADFILE_TOKEN, read when uploadfile() is called. */
  readonly token?: string;
  /** Defaults to public-read: anyone with the URL can view the Screenshot. */
  readonly acl?: "public-read" | "private";
  /** Private links expire after this many seconds. Positive integer; default and maximum: 604800 (7 days). */
  readonly signedUrlExpiresIn?: number;
}

/**
 * Create a lazy UploadFile Storage Adapter. Install with `npm install @uploadfile/core`.
 * A missing SDK rejects uploads with ProviderNotInstalled. Other failures reject with UploadFailed.
 * Private URLs are signed once per Support Log and reused across webhook retries.
 * Links expire (7 days by default and at most); delayed delivery leaves less time.
 * Receivers should retain the key and re-sign when needed.
 * The Relay Endpoint applies a 10-second timeout and falls back to inline PNG delivery on failure.
 * @example
 * ```ts
 * import { uploadfile } from "shotlog/uploadfile";
 * const storage = uploadfile({ acl: "private", signedUrlExpiresIn: 3600 });
 * ```
 * @public
 */
export function uploadfile(options: UploadfileOptions = {}): StorageAdapter {
  const token =
    options.token ??
    (typeof process === "undefined" ? undefined : process.env.UPLOADFILE_TOKEN);
  const acl = options.acl ?? "public-read";
  const expiresIn = options.signedUrlExpiresIn ?? 604800;
  if (!Number.isInteger(expiresIn) || expiresIn <= 0 || expiresIn > 604800)
    throw new TypeError(
      "shotlog: signedUrlExpiresIn must be an integer between 1 and 604800 seconds",
    );
  const sdk = lazySdk(
    "@uploadfile/core",
    () => import("@uploadfile/core/server"),
  );
  return {
    name: "uploadfile",
    upload: (png, { id, filename, signal }) =>
      runPublic(
        Effect.gen(function* () {
          const { UFApi, UFFile } = yield* sdk;
          return yield* Effect.tryPromise({
            try: async () => {
              signal.throwIfAborted();
              if (!token) throw new Error("UploadFile token is not configured");
              const api = new UFApi({
                token,
                // getSignedURL has no signal option; bind all SDK requests to this upload.
                fetch: (input, init) => {
                  const requestSignal =
                    init && "signal" in init
                      ? init.signal
                      : input instanceof Request
                        ? input.signal
                        : undefined;
                  return fetch(input, {
                    ...init,
                    signal: requestSignal
                      ? AbortSignal.any([signal, requestSignal])
                      : signal,
                  });
                },
              });
              const file = new UFFile([new Uint8Array(png)], filename, {
                type: "image/png",
                customId: id,
              });
              const res = await api.uploadFiles(file, { acl, signal });
              if (res.error || !res.data)
                throw new Error("Screenshot upload failed");
              signal.throwIfAborted();
              const url =
                acl === "private"
                  ? (await api.getSignedURL(res.data.key, { expiresIn })).ufsUrl
                  : res.data.ufsUrl;
              signal.throwIfAborted();
              return { url, key: res.data.key };
            },
            catch: (cause) => new UploadFailed({ cause }),
          });
        }),
      ),
  };
}
