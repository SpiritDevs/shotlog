/**
 * Replaceable text in Slack messages. Host-supplied Metadata keys keep their original names.
 * @example
 * ```ts
 * import type { SlackLabels } from "shotlog/server";
 * const labels: Partial<SlackLabels> = { reporter: "Customer", page: "Screen" };
 * ```
 * @public
 */
export interface SlackLabels {
  /** Display name for a delivered Type value, used in the header and notification. */
  readonly type: (value: string) => string;
  readonly reporter: string;
  readonly page: string;
  readonly browser: string;
  readonly viewport: string;
  readonly diagnosticTrail: string;
  readonly console: string;
  readonly network: string;
  /** A network entry that failed without an HTTP status. */
  readonly failed: string;
  /** Title and alt text of the uploaded file, followed by the Reference. */
  readonly screenshot: string;
  readonly screenshotInThread: string;
}

/**
 * English Slack message text.
 * @example
 * ```ts
 * import { defaultSlackLabels } from "shotlog/server";
 * const heading = defaultSlackLabels.diagnosticTrail;
 * ```
 * @public
 */
export const defaultSlackLabels: SlackLabels = {
  type: (value) => value,
  reporter: "Reporter",
  page: "Page",
  browser: "Browser",
  viewport: "Viewport",
  diagnosticTrail: "Diagnostic Trail",
  console: "console",
  network: "network",
  failed: "failed",
  screenshot: "Screenshot",
  screenshotInThread: "Screenshot in thread",
};
