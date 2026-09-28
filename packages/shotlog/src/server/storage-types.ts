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
