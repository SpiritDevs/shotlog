import { Effect } from "effect";
import * as Public from "../errors.js";
import { UploadFailed } from "../internal/errors.js";
import { runPublic } from "../internal/runtime.js";
import type { RecordingStorage, StorageAdapter } from "./storage-types.js";
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
 * Create a lazy UploadFile Storage Adapter, for webhook Screenshots and Screen Recordings.
 * Install with `npm install @uploadfile/core`.
 * A missing SDK rejects uploads with ProviderNotInstalled. Other failures reject with UploadFailed.
 * Private URLs are signed once per Support Log and reused across webhook retries.
 * Links expire (7 days by default and at most); delayed delivery leaves less time.
 * Receivers should retain the key and re-sign when needed.
 * The Relay Endpoint applies a 10-second timeout and falls back to inline PNG delivery on failure.
 * Screen Recordings upload from the browser with a session scoped to that one file; the token
 * never leaves the server.
 * @example
 * ```ts
 * import { uploadfile } from "shotlog/uploadfile";
 * const storage = uploadfile({ acl: "private", signedUrlExpiresIn: 3600 });
 * // createSupportHandler({ ..., recording: { storage } })
 * ```
 * @public
 */
export function uploadfile(
  options: UploadfileOptions = {},
): StorageAdapter & RecordingStorage {
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
  const api = (
    UFApi: typeof import("@uploadfile/core/server").UFApi,
    signal: AbortSignal,
  ) => {
    if (!token) throw new Error("UploadFile token is not configured");
    return new UFApi({
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
  };
  return {
    name: "uploadfile",
    upload: (png, { id, filename, signal }) =>
      runPublic(
        Effect.gen(function* () {
          const { UFApi, UFFile } = yield* sdk;
          return yield* Effect.tryPromise({
            try: async () => {
              signal.throwIfAborted();
              const uf = api(UFApi, signal);
              const file = new UFFile([new Uint8Array(png)], filename, {
                type: "image/png",
                customId: id,
              });
              const res = await uf.uploadFiles(file, { acl, signal });
              if (res.error || !res.data)
                throw new Error("Screenshot upload failed");
              signal.throwIfAborted();
              const url =
                acl === "private"
                  ? (await uf.getSignedURL(res.data.key, { expiresIn })).ufsUrl
                  : res.data.ufsUrl;
              signal.throwIfAborted();
              return { url, key: res.data.key };
            },
            catch: (cause) => new UploadFailed({ cause }),
          });
        }),
      ),
    // The service's upload session protocol, which @uploadfile/core does not expose on its own:
    // the server reserves the file and the browser sends the parts with a session-only token.
    async createUpload({ filename, size, mimeType, signal }) {
      if (!token)
        throw new Public.UploadFailed("UploadFile token is not configured");
      const { apiKey, service } = readToken(token);
      const response = await fetch(`${service}/api/v1/uploads`, {
        method: "POST",
        signal,
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          files: [
            {
              name: filename,
              size,
              type: mimeType.split(";", 1)[0],
              lastModified: Date.now(),
              contentDisposition: "inline",
              acl,
            },
          ],
          routeSlug: "__server_upload",
          metadata: {},
          awaitServerData: false,
        }),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Public.UploadFailed(
          `UploadFile refused the upload (${response.status})`,
        );
      }
      const session = ((await response.json()) as { uploads?: unknown[] })
        .uploads?.[0];
      if (!isSession(session) || session.size !== size)
        throw new Public.UploadFailed("UploadFile returned no session");
      return {
        target: {
          _tag: "UploadFile",
          url: session.url,
          uploadToken: session.uploadToken,
          partSize: session.partSize,
          partCount: session.partCount,
        },
        ticket: await signTicket(token, {
          key: session.key,
          url: session.ufsUrl,
        }),
      };
    },
    resolveUpload: (ticket, { signal }) =>
      runPublic(
        Effect.gen(function* () {
          if (!token)
            return yield* new UploadFailed({
              message: "UploadFile token is not configured",
            });
          const upload = yield* Effect.promise(() => readTicket(token, ticket));
          if (!upload)
            return yield* new UploadFailed({
              message: "Recording ticket is invalid",
            });
          if (acl !== "private") return { url: upload.url, key: upload.key };
          const { UFApi } = yield* sdk;
          return yield* Effect.tryPromise({
            try: async () => ({
              url: (
                await api(UFApi, signal).getSignedURL(upload.key, { expiresIn })
              ).ufsUrl,
              key: upload.key,
            }),
            catch: (cause) => new UploadFailed({ cause }),
          });
        }),
      ),
  };
}

interface Session {
  readonly url: string;
  readonly key: string;
  readonly ufsUrl: string;
  readonly uploadToken: string;
  readonly size: number;
  readonly partSize: number;
  readonly partCount: number;
}

function isSession(value: unknown): value is Session {
  if (typeof value !== "object" || value === null) return false;
  const session = value as Record<string, unknown>;
  return (
    ["url", "key", "ufsUrl", "uploadToken"].every(
      (field) => typeof session[field] === "string" && session[field] !== "",
    ) &&
    ["size", "partSize", "partCount"].every((field) =>
      Number.isSafeInteger(session[field]),
    )
  );
}

/** The token is base64 JSON with the API key and, for non-production services, their origin. */
function readToken(token: string): { apiKey: string; service: string } {
  let parsed: { apiKey?: unknown; url?: unknown; env?: unknown };
  try {
    parsed = JSON.parse(new TextDecoder().decode(fromBase64(token)));
  } catch {
    throw new Public.UploadFailed("UploadFile token is invalid");
  }
  if (typeof parsed.apiKey !== "string" || !parsed.apiKey.startsWith("sk_"))
    throw new Public.UploadFailed("UploadFile token is invalid");
  const service =
    typeof parsed.url === "string"
      ? new URL(parsed.url).origin
      : parsed.env === "staging"
        ? "https://staging.uploadfile.dev"
        : "https://www.uploadfile.dev";
  return { apiKey: parsed.apiKey, service };
}

interface Ticket {
  readonly key: string;
  readonly url: string;
}

const encoder = new TextEncoder();
const hmac = (token: string) =>
  crypto.subtle.importKey(
    "raw",
    encoder.encode(`shotlog-recording:${token}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );

/** A ticket passes through the browser, so it is signed with a key derived from the token. */
async function signTicket(token: string, ticket: Ticket): Promise<string> {
  const payload = toBase64Url(encoder.encode(JSON.stringify(ticket)));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmac(token),
    encoder.encode(payload),
  );
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

async function readTicket(
  token: string,
  ticket: string,
): Promise<Ticket | undefined> {
  const [payload, signature, extra] = ticket.split(".");
  if (!payload || !signature || extra !== undefined) return undefined;
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmac(token),
      fromBase64(signature),
      encoder.encode(payload),
    );
    if (!valid) return undefined;
    const value: unknown = JSON.parse(
      new TextDecoder().decode(fromBase64(payload)),
    );
    return typeof value === "object" &&
      value !== null &&
      "key" in value &&
      typeof value.key === "string" &&
      "url" in value &&
      typeof value.url === "string"
      ? { key: value.key, url: value.url }
      : undefined;
  } catch {
    return undefined;
  }
}

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(
    atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=")),
    (character) => character.charCodeAt(0),
  );
}
