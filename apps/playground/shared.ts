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

export interface EmailEntry {
  readonly kind: "email";
  readonly id: string;
  readonly subject: string;
  readonly from: string;
  readonly to: string;
  readonly replyTo: string;
  /** CID images have been replaced with data URLs by the local catcher. */
  readonly html: string;
  readonly text: string;
  readonly attachments: readonly {
    readonly filename: string;
    readonly contentType: string;
    readonly size: number;
    readonly contentId?: string;
  }[];
  readonly receivedAt: string;
}

export type InboxEntry = WebhookEntry | EmailEntry;
