import { Effect } from "effect";
import type { EmailMessage, EmailProvider } from "./email-types.js";
import { buildMime } from "./mime.js";
import { failed, lazySdk, timedProvider } from "./transport.js";

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
 * Create a lazily loaded SES v2 transport using raw MIME. Install with `npm install @aws-sdk/client-sesv2`.
 * SDK retries are disabled; each send has a 15-second timeout that aborts the request.
 * @example
 * ```ts
 * import { ses } from "shotlog/ses";
 * const provider = ses({ region: "ap-southeast-2" });
 * ```
 * @public
 */
export function ses(options: SesOptions): EmailProvider {
  const sdk = lazySdk(
    "@aws-sdk/client-sesv2",
    () => import("@aws-sdk/client-sesv2"),
  );
  return timedProvider(
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
