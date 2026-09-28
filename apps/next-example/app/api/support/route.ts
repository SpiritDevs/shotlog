import { createSupportHandler } from "shotlog/server";
import { demo, origin, webhookSecret } from "../../../lib/config";

export const runtime = "nodejs";

export const POST = createSupportHandler({
  delivery: {
    webhook: { url: `${origin}/api/inbox`, secret: webhookSecret },
  },
  // Outside the explicit local demo, replace with your session check.
  authorize: () => demo,
  // Vercel overwrites this header. Use your own trusted proxy's header elsewhere.
  ipHeader: "x-real-ip",
});
