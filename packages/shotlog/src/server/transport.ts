import { Effect } from "effect";
import {
  DeliveryFailed,
  type InternalError,
  ProviderNotInstalled,
} from "../internal/errors.js";
import { runPublic } from "../internal/runtime.js";
import type { EmailMessage, EmailProvider } from "./email-types.js";

export const emailTimeoutMs = 15_000;

export function lazySdk<A>(packageName: string, load: () => Promise<A>) {
  let pending: Promise<A> | undefined;
  return Effect.tryPromise({
    try: () => (pending ??= load()),
    catch: (cause) =>
      new ProviderNotInstalled({
        packageName,
        message: `Install this provider with: npm install ${packageName}`,
        cause,
      }),
  });
}

export const failed = (cause: unknown) =>
  new DeliveryFailed({ channel: "email", cause });

export function timedProvider(
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
