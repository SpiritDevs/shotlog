/**
 * A value that can travel as JSON in Host Context.
 * @example
 * ```ts
 * import type { JsonValue } from "shotlog";
 * const plan: JsonValue = { name: "pro", seats: 4 };
 * ```
 * @public
 */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/**
 * A delivered Support Log. This is the Webhook body and what the email is rendered from.
 * @example
 * ```ts
 * import type { SupportLog } from "shotlog";
 * function subject(log: SupportLog) { return `[${log.type}] ${log.shortId}`; }
 * ```
 * @public
 */
export interface SupportLog {
  /**
   * Payload contract version. Receivers can validate against `shotlog/schema.json`.
   * Version 2 added `recording`; `shotlog/schema.v1.json` still describes version 1.
   */
  readonly schemaVersion: 2;
  /** UUID generated in the browser; the Relay Endpoint dedupes retries by it. */
  readonly id: string;
  /** Readable form of `id`, e.g. `SL-7F3K`. Not unique on its own. */
  readonly shortId: string;
  /** ISO 8601 timestamp of report identity creation; retries retain it. */
  readonly createdAt: string;
  /** Type chosen by the Reporter, e.g. `Bug`. Host Apps configure the list. */
  readonly type: string;
  /** What the Reporter was trying to do. */
  readonly description: string;
  readonly screenshot?: Screenshot;
  /** A Screen Recording the Reporter made, uploaded straight from the browser to storage. */
  readonly recording?: Recording;
  readonly environment: Environment;
  readonly reporter?: Reporter;
  /** Free-form Host Context, limited to 16 KiB of serialized UTF-8 JSON. */
  readonly metadata?: { readonly [key: string]: JsonValue };
  readonly diagnostics?: Diagnostics;
}

/**
 * The JSON part sent to the Relay Endpoint. The PNG travels as a separate multipart file, and
 * a Screen Recording as a ticket for a finished upload.
 * @example
 * ```ts
 * import type { SupportLogSubmission } from "shotlog";
 * const jsonPart = (log: SupportLogSubmission) => JSON.stringify(log);
 * ```
 * @public
 */
export type SupportLogSubmission = Omit<SupportLog, "screenshot" | "recording">;

/**
 * A Screen Recording: a video of the Reporter's tab, with any drawings they made while recording.
 * `url` may expire when the storage is private; keep `key` to re-sign it.
 * @example
 * ```ts
 * import type { Recording } from "shotlog";
 * const minutes = (recording: Recording) => Math.ceil(recording.durationMs / 60_000);
 * ```
 * @public
 */
export interface Recording {
  readonly url: string;
  /** Storage key, for deleting or re-signing the file later. */
  readonly key: string;
  /** Video dimensions in pixels. */
  readonly width: number;
  readonly height: number;
  readonly durationMs: number;
  /** Video size in bytes. */
  readonly size: number;
  /** The browser's recording format, e.g. `video/webm` or `video/mp4`. */
  readonly mimeType: string;
}

/**
 * PNG dimensions in image pixels, byte length, and upload fallback status.
 * @example
 * ```ts
 * import type { ScreenshotInfo } from "shotlog";
 * const image: ScreenshotInfo = { width: 800, height: 600, size: 42000, mimeType: "image/png" };
 * ```
 * @public
 */
export interface ScreenshotInfo {
  readonly width: number;
  readonly height: number;
  /** PNG size in bytes. */
  readonly size: number;
  readonly mimeType: "image/png";
  /** Set when an upload failed and the Screenshot fell back to inline base64. */
  readonly uploadError?: string;
}

/**
 * The flattened, annotated PNG: inline base64 or a Storage Adapter link.
 * @example
 * ```ts
 * import type { Screenshot } from "shotlog";
 * function source(image: Screenshot) {
 *   return image._tag === "Uploaded" ? image.url : `data:image/png;base64,${image.data}`;
 * }
 * ```
 * @public
 */
export type Screenshot =
  | (ScreenshotInfo & { readonly _tag: "Inline"; readonly data: string })
  | (ScreenshotInfo & {
      readonly _tag: "Uploaded";
      readonly url: string;
      /** Storage key, for deleting or re-signing the file later. */
      readonly key: string;
    });

/**
 * Width and height in CSS pixels.
 * @example
 * ```ts
 * import type { Size } from "shotlog";
 * const viewport: Size = { width: 1440, height: 900 };
 * ```
 * @public
 */
export interface Size {
  readonly width: number;
  readonly height: number;
}

/**
 * Browser and page details captured automatically for a Support Log.
 * @example
 * ```ts
 * import type { Environment } from "shotlog";
 * const page = (environment: Environment) => environment.url;
 * ```
 * @public
 */
export interface Environment {
  /** Page URL without credentials or query string; its fragment is retained. */
  readonly url: string;
  readonly route: string;
  readonly title: string;
  readonly referrer: string;
  /** Milliseconds since the document time origin, including across SPA route changes. */
  readonly timeOnPageMs: number;
  readonly userAgent: string;
  readonly browser: string;
  readonly os: string;
  readonly deviceType: "desktop" | "mobile" | "tablet" | "unknown";
  /** BCP 47 locale, e.g. `en-AU`. */
  readonly language: string;
  /** IANA timezone, e.g. `Australia/Sydney`. */
  readonly timezone: string;
  readonly screen: Size;
  readonly viewport: Size;
  readonly devicePixelRatio: number;
  readonly colorScheme: "light" | "dark";
  readonly online: boolean;
  /** shotlog version that produced the Support Log. */
  readonly libraryVersion: string;
}

/**
 * Who is reporting, plus any JSON fields the Host App adds (plan, role, ...).
 * Limited to 16 KiB of serialized UTF-8 JSON.
 * @example
 * ```ts
 * import type { Reporter } from "shotlog";
 * const reporter: Reporter = { id: "user-42", email: "ada@example.com", plan: "pro" };
 * ```
 * @public
 */
export type Reporter = {
  readonly id?: string;
  /** Used as the email Reply-To when present. */
  readonly email?: string;
  readonly name?: string;
} & { readonly [key: string]: JsonValue };

/**
 * A console warning or error captured by the Diagnostic Trail.
 * @example
 * ```ts
 * import type { ConsoleEntry } from "shotlog";
 * const entry: ConsoleEntry = { level: "warn", message: "Save failed", at: new Date().toISOString() };
 * ```
 * @public
 */
export interface ConsoleEntry {
  readonly level: "error" | "warn";
  readonly message: string;
  readonly stack?: string;
  /** ISO 8601 timestamp. */
  readonly at: string;
}

/**
 * A failed request captured by the Diagnostic Trail. Never includes bodies or headers.
 * @example
 * ```ts
 * import type { NetworkEntry } from "shotlog";
 * const entry: NetworkEntry = { method: "POST", url: "https://app.example.com/save", status: 500, at: new Date().toISOString() };
 * ```
 * @public
 */
export interface NetworkEntry {
  readonly method: string;
  /** Request URL with credentials, query string, and fragment stripped. */
  readonly url: string;
  /** HTTP status, or `0` for a network error. */
  readonly status: number;
  /** ISO 8601 timestamp. */
  readonly at: string;
}

/**
 * The bounded Diagnostic Trail: up to 50 console entries and 50 failed requests.
 * @example
 * ```ts
 * import type { Diagnostics } from "shotlog";
 * const diagnostics: Diagnostics = { console: [], network: [] };
 * ```
 * @public
 */
export interface Diagnostics {
  readonly console: readonly ConsoleEntry[];
  readonly network: readonly NetworkEntry[];
}
