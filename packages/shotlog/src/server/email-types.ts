/**
 * A binary email attachment. Set contentId to reference it from HTML with `cid:`.
 * @example
 * ```ts
 * import type { EmailAttachment } from "shotlog/server";
 * const attachment: EmailAttachment = {
 *   filename: "details.txt", contentType: "text/plain",
 *   content: new TextEncoder().encode("Support Log details"),
 * };
 * ```
 * @public
 */
export interface EmailAttachment {
  readonly filename: string;
  readonly contentType: string;
  readonly content: Uint8Array;
  readonly contentId?: string;
}

/**
 * A rendered email, independent of a provider SDK.
 * @example
 * ```ts
 * import type { EmailMessage } from "shotlog/server";
 * const message: EmailMessage = {
 *   from: "reports@example.com", to: ["support@example.com"],
 *   subject: "Support Log", html: "<p>Save failed</p>", text: "Save failed", attachments: [],
 * };
 * ```
 * @public
 */
export interface EmailMessage {
  readonly from: string;
  readonly to: readonly string[];
  readonly replyTo?: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly attachments: readonly EmailAttachment[];
}

/**
 * Server-owned email transport. The Relay Endpoint waits for each send without retries.
 * Custom providers must bound their own duration and honour cancellation: cancel the
 * underlying transport before rejecting for cancellation or timeout, so retries cannot
 * overlap an unfinished send. Built-in providers supply their own transport timeouts.
 * @example
 * ```ts
 * import type { EmailProvider } from "shotlog/server";
 * const provider: EmailProvider = {
 *   name: "internal-mail-service",
 *   async send(message) {
 *     const response = await fetch("https://mail.example.com/send", {
 *       method: "POST", signal: AbortSignal.timeout(15000),
 *       headers: { "content-type": "application/json" },
 *       body: JSON.stringify({ ...message, attachments: message.attachments.map((file) => ({
 *         ...file, content: Array.from(file.content),
 *       })) }),
 *     });
 *     await response.body?.cancel();
 *     if (!response.ok) throw new Error("Mail delivery failed");
 *   },
 * };
 * ```
 * @public
 */
export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}

/**
 * Replaceable text in Support Log emails. Host-supplied context keys keep their original names.
 * @example
 * ```ts
 * import type { EmailLabels } from "shotlog/server";
 * const labels: Partial<EmailLabels> = { description: "What happened", screenshot: "Screen capture" };
 * ```
 * @public
 */
export interface EmailLabels {
  /** BCP 47 language of these labels, set on the email's `<html lang>`. */
  readonly lang: string;
  /** Display name for a delivered Type value, used in the subject and heading. */
  readonly type: (value: string) => string;
  readonly description: string;
  readonly screenshot: string;
  readonly reporter: string;
  readonly metadata: string;
  readonly environment: string;
  readonly diagnosticTrail: string;
  readonly console: string;
  readonly network: string;
  readonly none: string;
  readonly supportLogId: string;
  readonly createdAt: string;
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly time: string;
  readonly level: string;
  readonly message: string;
  readonly stack: string;
  readonly method: string;
  readonly status: string;
  readonly url: string;
  readonly route: string;
  readonly title: string;
  readonly referrer: string;
  readonly timeOnPageMs: string;
  readonly userAgent: string;
  readonly browser: string;
  readonly os: string;
  readonly deviceType: string;
  readonly language: string;
  readonly timezone: string;
  readonly screen: string;
  readonly viewport: string;
  readonly devicePixelRatio: string;
  readonly colorScheme: string;
  readonly online: string;
  readonly libraryVersion: string;
}

/**
 * English defaults for every email label.
 * @example
 * ```ts
 * import { defaultEmailLabels } from "shotlog/server";
 * const labels = { ...defaultEmailLabels, description: "Issue" };
 * ```
 * @public
 */
export const defaultEmailLabels: EmailLabels = {
  lang: "en",
  type: (value) => value,
  description: "Description",
  screenshot: "Screenshot",
  reporter: "Reporter",
  metadata: "Metadata",
  environment: "Environment",
  diagnosticTrail: "Diagnostic Trail",
  console: "Console",
  network: "Network",
  none: "None provided",
  supportLogId: "Support Log ID",
  createdAt: "Created at",
  id: "ID",
  name: "Name",
  email: "Email",
  time: "Time",
  level: "Level",
  message: "Message",
  stack: "Stack",
  method: "Method",
  status: "Status",
  url: "URL",
  route: "Route",
  title: "Page title",
  referrer: "Referrer",
  timeOnPageMs: "Time on page (ms)",
  userAgent: "User agent",
  browser: "Browser",
  os: "Operating system",
  deviceType: "Device type",
  language: "Language",
  timezone: "Timezone",
  screen: "Screen",
  viewport: "Viewport",
  devicePixelRatio: "Device pixel ratio",
  colorScheme: "Color scheme",
  online: "Online",
  libraryVersion: "Library version",
};
