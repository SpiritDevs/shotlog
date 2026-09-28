import type { SupportLog } from "shotlog";

export interface Settings {
  readonly authorize: "allow" | "unauthorized" | "forbidden";
  readonly rateLimit: boolean;
  /** Omitted means off, so older callers reset Slack too. */
  readonly slack?: "off" | "fixed" | "choose";
}

export function isSettings(value: unknown): value is Settings {
  return (
    typeof value === "object" &&
    value !== null &&
    "authorize" in value &&
    ["allow", "unauthorized", "forbidden"].includes(String(value.authorize)) &&
    "rateLimit" in value &&
    typeof value.rateLimit === "boolean" &&
    (!("slack" in value) ||
      ["off", "fixed", "choose"].includes(String(value.slack)))
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
  /** Original HTML retains cid: references for delivery assertions. */
  readonly sourceHtml: string;
  readonly text: string;
  readonly attachments: readonly {
    readonly filename: string;
    readonly contentType: string;
    readonly size: number;
    readonly disposition: string;
    readonly contentId?: string;
  }[];
  readonly receivedAt: string;
}

export interface SlackEntry {
  readonly kind: "slack";
  readonly id: string;
  readonly receivedAt: string;
  readonly channel: string;
  readonly text: string;
  readonly blocks: readonly SlackBlock[];
  /** Shared into the message's thread; a data URL once the upload completes. */
  readonly screenshot?: string;
}

export type SlackText = { readonly type: string; readonly text: string };
export type SlackBlock =
  | { readonly type: "header"; readonly text: SlackText }
  | {
      readonly type: "section";
      readonly text?: SlackText;
      readonly fields?: readonly SlackText[];
    }
  | { readonly type: "context"; readonly elements: readonly SlackText[] };

export type InboxEntry = WebhookEntry | EmailEntry | SlackEntry;
