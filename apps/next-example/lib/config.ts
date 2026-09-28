export const demo = process.env.SHOTLOG_DEMO === "1";
const configuredSecret = process.env.SHOTLOG_WEBHOOK_SECRET;
if (!demo && !configuredSecret)
  throw new Error("SHOTLOG_WEBHOOK_SECRET is required unless SHOTLOG_DEMO=1");
export const webhookSecret =
  configuredSecret || "shotlog-next-example-local-secret";
export const origin =
  process.env.NEXT_EXAMPLE_ORIGIN ?? "http://127.0.0.1:5300";
