/**
 * A value that can travel as JSON in Host Context.
 * @example
 * ```ts
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
 * function subject(log: SupportLog) { return `[${log.type}] ${log.shortId}`; }
 * ```
 * @public
 */
export interface SupportLog {
  /** Payload contract version. Receivers can validate against `shotlog/schema.json`. */
  readonly schemaVersion: 1;
  /** UUID generated in the browser; the Relay Endpoint dedupes retries by it. */
  readonly id: string;
  /** Readable form of `id`, e.g. `SL-7F3K`. Not unique on its own. */
  readonly shortId: string;
  /** ISO 8601 timestamp of when the Report Card was opened. */
  readonly createdAt: string;
  /** Type chosen by the Reporter, e.g. `Bug`. Host Apps configure the list. */
  readonly type: string;
  /** What the Reporter was trying to do. */
  readonly description: string;
  readonly screenshot?: Screenshot;
  readonly environment: Environment;
  readonly reporter?: Reporter;
  /** Free-form data from the Host App. */
  readonly metadata?: { readonly [key: string]: JsonValue };
  readonly diagnostics?: Diagnostics;
}

/**
 * The JSON part sent to the Relay Endpoint; the PNG travels as a separate multipart file.
 * @example
 * ```ts
 * const jsonPart = (log: SupportLogSubmission) => JSON.stringify(log);
 * ```
 * @public
 */
export type SupportLogSubmission = Omit<SupportLog, "screenshot">;

/**
 * Fields shared by both Screenshot variants.
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
 * const page = (environment: Environment) => environment.url;
 * ```
 * @public
 */
export interface Environment {
  readonly url: string;
  readonly route: string;
  readonly title: string;
  readonly referrer: string;
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
 * Limited to 16 KB of serialized JSON.
 * @example
 * ```ts
 * const reporter: Reporter = { id: "user-42", email: "ada@example.com", plan: "pro" };
 * ```
 * @public
 */
export interface Reporter {
  readonly [key: string]: JsonValue;
  readonly id?: string;
  /** Used as the email Reply-To when present. */
  readonly email?: string;
  readonly name?: string;
}

/**
 * A console warning or error captured by the Diagnostic Trail.
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
 * @public
 */
export interface NetworkEntry {
  readonly method: string;
  /** Request URL with the query string stripped. */
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
 * const diagnostics: Diagnostics = { console: [], network: [] };
 * ```
 * @public
 */
export interface Diagnostics {
  readonly console: readonly ConsoleEntry[];
  readonly network: readonly NetworkEntry[];
}
