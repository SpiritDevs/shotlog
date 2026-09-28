import { createSupportHandler } from "shotlog/server";
import { origin, webhookSecret } from "../../../lib/config";

export const runtime = "nodejs";

export const POST = createSupportHandler({
  delivery: {
    webhook: { url: `${origin}/api/inbox`, secret: webhookSecret },
  },
  authorize: () => true,
});
