import { Effect } from "effect";
import {
  DeliveryFailed,
  type InternalError,
  ProviderNotInstalled,
  UnsupportedRuntime,
} from "../internal/errors.js";
import { runPublic } from "../internal/runtime.js";
import { emailTimeoutMs } from "./email.js";
import type { EmailMessage, EmailProvider } from "./email-types.js";
import { base64, buildMime } from "./mime.js";

/**
 * Resend credentials, held only on the server.
 * @example
 * ```ts
 * const options: ResendOptions = { apiKey: process.env.RESEND_API_KEY! };
 * ```
 * @public
 */
export interface ResendOptions {
  readonly apiKey: string;
}

/**
 * Explicit AWS credentials. Omit credentials in SesOptions to use the SDK's default chain.
 * @example
 * ```ts
 * const credentials: SesCredentials = { accessKeyId, secretAccessKey };
 * ```
 * @public
 */
export interface SesCredentials {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly sessionToken?: string;
}

/**
 * SES region and optional static or refreshed credentials, without SDK types in the public API.
 * @example
 * ```ts
 * const options: SesOptions = { region: "ap-southeast-2" };
 * ```
 * @public
 */
export interface SesOptions {
  readonly region: string;
  readonly credentials?: SesCredentials | (() => Promise<SesCredentials>);
}

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

function lazySdk<A>(packageName: string, load: () => Promise<A>) {
  let pending: Promise<A> | undefined;
  return Effect.tryPromise({
    try: () => (pending ??= load()),
    catch: (cause) =>
      new ProviderNotInstalled({
        packageName,
        message: `Install this email provider with: npm install ${packageName}`,
        cause,
      }),
  });
}

const failed = (cause: unknown) =>
  new DeliveryFailed({ channel: "email", cause });

function provider(
  name: string,
  send: (message: EmailMessage) => Effect.Effect<void, InternalError>,
): EmailProvider {
  return {
    name,
    send: (message) =>
      runPublic(
        send(message).pipe(
          Effect.timeoutFail({
            duration: emailTimeoutMs,
            onTimeout: () => failed(new Error("Email send timed out")),
          }),
        ),
      ),
  };
}

/**
 * Create a lazily loaded Resend transport. Install with `npm install resend`.
 * Sends once, with a 15-second timeout. Missing SDKs throw ProviderNotInstalled.
 * @example
 * ```ts
 * const provider = resend({ apiKey: process.env.RESEND_API_KEY! });
 * ```
 * @public
 */
export function resend(options: ResendOptions): EmailProvider {
  const sdk = lazySdk("resend", () => import("resend"));
  return provider(
    "resend",
    Effect.fn("sendResendEmail")(function* (message: EmailMessage) {
      const { Resend } = yield* sdk;
      yield* Effect.tryPromise({
        try: async () => {
          const client = new Resend(options.apiKey);
          const { error } = await client.emails.send({
            from: message.from,
            to: [...message.to],
            ...(message.replyTo ? { replyTo: message.replyTo } : {}),
            subject: message.subject,
            html: message.html,
            text: message.text,
            attachments: message.attachments.map(
              ({ content, ...attachment }) => ({
                ...attachment,
                content: base64(content),
              }),
            ),
          });
          if (error) throw error;
        },
        catch: failed,
      });
    }),
  );
}

/**
 * Create a lazily loaded SES v2 transport using raw MIME. Install with `npm install @aws-sdk/client-sesv2`.
 * SDK retries are disabled; each send has a 15-second timeout.
 * @example
 * ```ts
 * const provider = ses({ region: "ap-southeast-2" });
 * ```
 * @public
 */
export function ses(options: SesOptions): EmailProvider {
  const sdk = lazySdk(
    "@aws-sdk/client-sesv2",
    () => import("@aws-sdk/client-sesv2"),
  );
  return provider(
    "ses",
    Effect.fn("sendSesEmail")(function* (message: EmailMessage) {
      const { SESv2Client, SendEmailCommand } = yield* sdk;
      yield* Effect.acquireUseRelease(
        Effect.try({
          try: () => new SESv2Client({ ...options, maxAttempts: 1 }),
          catch: failed,
        }),
        (client) =>
          Effect.tryPromise({
            try: async (abortSignal) => {
              await client.send(
                new SendEmailCommand({
                  FromEmailAddress: message.from,
                  Destination: { ToAddresses: [...message.to] },
                  Content: { Raw: { Data: buildMime(message) } },
                }),
                { abortSignal },
              );
            },
            catch: failed,
          }),
        (client) => Effect.sync(() => client.destroy()),
      );
    }),
  );
}

/**
 * Create a lazily loaded Node-only SMTP transport. Install with `npm install nodemailer`.
 * Other runtimes throw UnsupportedRuntime; sends have a 15-second timeout and no retries.
 * @example
 * ```ts
 * const provider = smtp({ host: "127.0.0.1", port: 2525 });
 * ```
 * @public
 */
export function smtp(options: SmtpOptions): EmailProvider {
  const sdk = lazySdk("nodemailer", () => import("nodemailer"));
  return provider(
    "smtp",
    Effect.fn("sendSmtpEmail")(function* (message: EmailMessage) {
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
    }),
  );
}
