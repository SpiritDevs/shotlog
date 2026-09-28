import { Effect } from "effect";
import { UnsupportedRuntime } from "../internal/errors.js";
import { runPublic } from "../internal/runtime.js";
import type { EmailMessage, EmailProvider } from "./email-types.js";
import { buildMime } from "./mime.js";
import { emailTimeoutMs, failed, lazySdk } from "./transport.js";

/**
 * Node-only SMTP connection settings. STARTTLS is negotiated when offered unless secure uses TLS immediately.
 * @example
 * ```ts
 * const options: SmtpOptions = { host: "localhost", port: 2525 };
 * ```
 * @public
 */
export interface SmtpOptions {
  readonly host: string;
  readonly port: number;
  readonly secure?: boolean;
  readonly auth?: { readonly user: string; readonly pass: string };
}

/**
 * Create a lazily loaded Node-only SMTP transport. Install with `npm install nodemailer`.
 * Other runtimes throw UnsupportedRuntime. Sends have no retries and are bounded by
 * 15-second connection, greeting, and socket inactivity timeouts, not a total deadline.
 * Admission and duplicate coalescing remain held until the transport settles.
 * @example
 * ```ts
 * import { smtp } from "shotlog/smtp";
 * const provider = smtp({ host: "127.0.0.1", port: 2525 });
 * ```
 * @public
 */
export function smtp(options: SmtpOptions): EmailProvider {
  const sdk = lazySdk("nodemailer", () => import("nodemailer"));
  const send = Effect.fn("sendSmtpEmail")(function* (message: EmailMessage) {
    if (
      typeof process === "undefined" ||
      process.release?.name !== "node" ||
      !process.versions?.node ||
      "Deno" in globalThis ||
      "Bun" in globalThis
    ) {
      return yield* new UnsupportedRuntime({
        message: "SMTP requires Node.js",
      });
    }
    const { default: nodemailer } = yield* sdk;
    yield* Effect.acquireUseRelease(
      Effect.try({
        try: () =>
          nodemailer.createTransport({
            ...options,
            connectionTimeout: emailTimeoutMs,
            greetingTimeout: emailTimeoutMs,
            socketTimeout: emailTimeoutMs,
          }),
        catch: failed,
      }),
      (transport) =>
        Effect.tryPromise({
          try: async () => {
            // Raw MIME keeps the CID and downloadable copies identical across SMTP and SES.
            const result = await transport.sendMail({
              envelope: { from: message.from, to: [...message.to] },
              raw: new TextDecoder().decode(buildMime(message)),
            });
            if (result.rejected.length > 0)
              throw new Error("SMTP rejected an email recipient");
          },
          catch: failed,
        }),
      (transport) => Effect.sync(() => transport.close()),
    );
  });
  return { name: "smtp", send: (message) => runPublic(send(message)) };
}
