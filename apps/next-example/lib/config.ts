// Local example only. Production hosts should supply their own secret and auth.
export const webhookSecret =
  process.env.SHOTLOG_WEBHOOK_SECRET ?? "shotlog-next-example-local-secret";
export const origin =
  process.env.NEXT_EXAMPLE_ORIGIN ?? "http://127.0.0.1:5300";
