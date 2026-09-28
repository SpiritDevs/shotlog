/**
 * Server-side Screenshot storage. Implement this interface for S3, R2, or another service.
 * Adapters must honour `info.signal` and cancel their underlying work when it aborts.
 * The handler allows 30 seconds, then falls back to inline PNG delivery.
 * @example
 * ```ts
 * const storage: StorageAdapter = {
 *   name: "custom",
 *   upload: (png, info) => uploadPng(png, info),
 * };
 * ```
 * @public
 */
export interface StorageAdapter {
  /** Name of the storage service. */
  readonly name: string;
  /** Upload the PNG and return its accessible URL and storage key. Honour `info.signal`. */
  upload(
    png: Uint8Array,
    info: { id: string; filename: string; signal: AbortSignal },
  ): Promise<{ url: string; key: string }>;
}
