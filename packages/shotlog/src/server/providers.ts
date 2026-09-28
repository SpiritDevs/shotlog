import { Effect } from "effect";
import type { EmailMessage, EmailProvider } from "./email-types.js";
import { base64 } from "./mime.js";
import { failed, timedProvider } from "./transport.js";

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
 * Create a Resend REST transport; no provider SDK is required.
 * Sends once, with a 15-second timeout that aborts the request.
 * @example
 * ```ts
 * const provider = resend({ apiKey: process.env.RESEND_API_KEY! });
 * ```
 * @public
 */
export function resend(options: ResendOptions): EmailProvider {
  return timedProvider(
    "resend",
    Effect.fn("sendResendEmail")((message: EmailMessage) =>
      Effect.tryPromise({
        try: async (signal) => {
          const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            redirect: "manual",
            signal,
            headers: {
              Authorization: `Bearer ${options.apiKey}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              from: message.from,
              to: message.to,
              subject: message.subject,
              html: message.html,
              text: message.text,
              ...(message.replyTo ? { reply_to: message.replyTo } : {}),
              attachments: message.attachments.map((attachment) => ({
                filename: attachment.filename,
                content: base64(attachment.content),
                content_type: attachment.contentType,
                ...(attachment.contentId
                  ? { content_id: attachment.contentId }
                  : {}),
              })),
            }),
          });
          await response.body?.cancel();
          if (!response.ok)
            throw new Error(`Resend returned HTTP ${response.status}`);
        },
        catch: failed,
      }),
    ),
  );
}
