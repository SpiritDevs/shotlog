/**
 * Server-side Screenshot storage. Implement this interface for S3, R2, or another service.
 * Adapters must honour `info.signal` and cancel their underlying work when it aborts.
 * The handler allows 10 seconds, then falls back to inline PNG delivery.
 * @example
 * ```ts
 * import type { StorageAdapter } from "shotlog/server";
 * const storage: StorageAdapter = {
 *   name: "custom",
 *   async upload(png, { id, filename, signal }) {
 *     const url = `https://files.example.com/screenshots/${encodeURIComponent(id)}/${encodeURIComponent(filename)}`;
 *     const response = await fetch(url, {
 *       method: "PUT", body: new Uint8Array(png), signal,
 *       headers: { "content-type": "image/png" },
 *     });
 *     await response.body?.cancel();
 *     if (!response.ok) throw new Error("Upload failed");
 *     return { url, key: `${id}/${filename}` };
 *   },
 * };
 * ```
 * @public
 */
export interface StorageAdapter {
  /** Name of the storage service. */
  readonly name: string;
  /** Upload the PNG and return an HTTP(S) URL and non-empty storage key. Honour `info.signal`. */
  upload(
    png: Uint8Array,
    info: { id: string; filename: string; signal: AbortSignal },
  ): Promise<{ url: string; key: string }>;
}

/**
 * How the browser sends a Screen Recording straight to storage. `Put` is one presigned HTTP PUT
 * of the whole file, as S3, R2 and GCS issue them; the storage must allow the Host App's
 * origin with CORS. `UploadFile` is the built-in `uploadfile()` adapter's resumable session.
 * @example
 * ```ts
 * import type { RecordingUploadTarget } from "shotlog/server";
 * const target: RecordingUploadTarget = {
 *   _tag: "Put",
 *   url: "https://bucket.example.com/recordings/abc.webm?X-Signature=...",
 *   headers: { "content-type": "video/webm" },
 * };
 * ```
 * @public
 */
export type RecordingUploadTarget =
  | {
      readonly _tag: "Put";
      readonly url: string;
      /** Headers the presigned URL requires, such as `content-type`. */
      readonly headers?: { readonly [name: string]: string };
    }
  | {
      readonly _tag: "UploadFile";
      readonly url: string;
      readonly uploadToken: string;
      readonly partSize: number;
      readonly partCount: number;
    };

/**
 * Storage for Screen Recordings. Videos are too large to pass through the Relay Endpoint, so the
 * browser uploads them directly: `createUpload` authorizes one upload, and `resolveUpload`
 * turns its ticket into a link when the Support Log is submitted.
 *
 * The ticket travels through the browser, so `resolveUpload` must only accept tickets that
 * `createUpload` issued: sign them, or check the key is one it would have made. Otherwise a
 * Reporter could have the Relay Endpoint link any file in the bucket. Both calls get 10 seconds
 * and must honour `signal`.
 * @example
 * ```ts
 * import type { RecordingStorage } from "shotlog/server";
 * declare function presignPut(key: string, type: string): Promise<string>;
 * const storage: RecordingStorage = {
 *   name: "s3",
 *   async createUpload({ mimeType }) {
 *     const key = `recordings/${crypto.randomUUID()}.webm`;
 *     const url = await presignPut(key, mimeType);
 *     return { target: { _tag: "Put", url, headers: { "content-type": mimeType } }, ticket: key };
 *   },
 *   async resolveUpload(ticket) {
 *     if (!/^recordings\/[0-9a-f-]{36}\.webm$/.test(ticket)) throw new Error("Unknown ticket");
 *     return { url: `https://files.example.com/${ticket}`, key: ticket };
 *   },
 * };
 * ```
 * @public
 */
export interface RecordingStorage {
  /** Name of the storage service. */
  readonly name: string;
  /** Authorize one browser upload of exactly `size` bytes. `id` is the Support Log's. */
  createUpload(info: {
    id: string;
    filename: string;
    size: number;
    mimeType: string;
    signal: AbortSignal;
  }): Promise<{ target: RecordingUploadTarget; ticket: string }>;
  /** Check a ticket came from `createUpload` and return a viewable HTTP(S) URL. */
  resolveUpload(
    ticket: string,
    info: { signal: AbortSignal },
  ): Promise<{ url: string; key: string }>;
}
