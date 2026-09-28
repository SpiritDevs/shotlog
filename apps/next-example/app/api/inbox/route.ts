import type { SupportLog } from "shotlog";
import { verifyWebhookSignature } from "shotlog/server";
import { webhookSecret } from "../../../lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const entries: { signatureValid: true; supportLog: SupportLog }[] = [];

export async function POST(request: Request) {
  const payload = await request.text();
  const valid = await verifyWebhookSignature({
    payload,
    header: request.headers.get("x-shotlog-signature"),
    secret: webhookSecret,
  });
  if (!valid) return new Response("Invalid signature", { status: 401 });
  const supportLog: SupportLog = JSON.parse(payload);
  if (!entries.some((entry) => entry.supportLog.id === supportLog.id)) {
    entries.unshift({ signatureValid: true, supportLog });
    entries.length = Math.min(entries.length, 100);
  }
  return new Response(null, { status: 204 });
}

export function GET() {
  return Response.json(entries, { headers: { "cache-control": "no-store" } });
}
