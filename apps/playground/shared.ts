import type { SupportLog } from "shotlog";

export interface Settings {
  readonly authorize: "allow" | "unauthorized" | "forbidden";
  readonly rateLimit: boolean;
}

export function isSettings(value: unknown): value is Settings {
  return (
    typeof value === "object" &&
    value !== null &&
    "authorize" in value &&
    ["allow", "unauthorized", "forbidden"].includes(String(value.authorize)) &&
    "rateLimit" in value &&
    typeof value.rateLimit === "boolean"
  );
}

export interface WebhookEntry {
  readonly kind: "webhook";
  readonly id: string;
  readonly receivedAt: string;
  readonly signatureValid: boolean;
  readonly supportLog: SupportLog;
}

// Extend this union with EmailEntry when the SMTP catcher is added.
export type InboxEntry = WebhookEntry;
