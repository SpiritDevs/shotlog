/**
 * A binary email attachment. Set contentId to reference it from HTML with `cid:`.
 * @example
 * ```ts
 * const attachment: EmailAttachment = { filename: "screenshot.png", contentType: "image/png", content: png };
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
 * await provider.send(message);
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
 * const provider: EmailProvider = { name: "custom", send: async (message) => mailer.send(message) };
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
 * const labels: Partial<EmailLabels> = { description: "What happened", screenshot: "Screen capture" };
 * ```
 * @public
 */
export interface EmailLabels {
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
 * const labels = { ...defaultEmailLabels, description: "Issue" };
 * ```
 * @public
 */
export const defaultEmailLabels: EmailLabels = {
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
