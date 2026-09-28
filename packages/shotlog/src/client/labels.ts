import type { ShotlogError } from "../errors.js";
import type { ShotlogLabels } from "./types.js";

export const defaultLabels: ShotlogLabels = {
  launcher: "Report an issue",
  title: "Send a report",
  close: "Close report",
  type: "Type",
  bug: "Bug",
  question: "Question",
  idea: "Idea",
  description: "What were you trying to do?",
  descriptionRequired: "Please describe what you were trying to do.",
  includedDetails: (consoleCount, networkCount) =>
    `Included details · ${consoleCount} console · ${networkCount} network`,
  environment: "Environment",
  reporter: "Reporter",
  metadata: "Metadata",
  diagnosticTrail: "Diagnostic Trail",
  consoleEntries: "Console errors and warnings",
  networkEntries: "Failed network requests",
  detailKey: (key) =>
    Object.hasOwn(detailKeys, key) ? (detailKeys[key] ?? key) : key,
  detailsEmpty: "None",
  detailsLoading: "Loading details…",
  detailsUnavailable: "Could not collect details. Close and expand to retry.",
  diagnosticsDisabled: "Recording is off.",
  detailsRefresh: "These details are refreshed when you submit.",
  submit: "Submit",
  retry: "Retry",
  sending: "Sending…",
  sent: (shortId) => `Sent ✓ · ${shortId}`,
  unauthorized: "Please sign in, then try again.",
  forbidden: "You don't have permission to send a report.",
  rateLimited: (minutes) =>
    `You're sending too fast — try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`,
  payloadTooLarge: "This report is too large. Please shorten it and try again.",
  validationFailed:
    "We couldn't process this report. Check the details and try again.",
  deliveryFailed: "Your report couldn't be delivered. Please try again.",
  uploadFailed: "Your screenshot couldn't be uploaded. Please try again.",
  offline:
    "You're offline or couldn't connect. Check your connection and retry.",
  providerNotInstalled:
    "Support reporting isn't configured yet. Please try again later.",
  unsupportedRuntime: "Support reporting isn't available in this browser.",
};

export function errorMessage(
  error: ShotlogError,
  labels: ShotlogLabels,
): string {
  switch (error._tag) {
    case "Unauthorized":
      return labels.unauthorized;
    case "Forbidden":
      return labels.forbidden;
    case "RateLimited":
      return labels.rateLimited(
        Math.max(1, Math.ceil(error.retryAfterSeconds / 60)),
      );
    case "PayloadTooLarge":
      return labels.payloadTooLarge;
    case "ValidationFailed":
      return labels.validationFailed;
    case "DeliveryFailed":
      return labels.deliveryFailed;
    case "UploadFailed":
      return labels.uploadFailed;
    case "Offline":
      return labels.offline;
    case "ProviderNotInstalled":
      return labels.providerNotInstalled;
    case "UnsupportedRuntime":
      return labels.unsupportedRuntime;
  }
}

const detailKeys: Readonly<Record<string, string>> = {
  url: "URL",
  route: "Route",
  title: "Page title",
  referrer: "Referrer",
  timeOnPageMs: "Time on page (ms)",
  userAgent: "User agent",
  browser: "Browser",
  os: "Operating system",
  deviceType: "Device type",
  language: "Language",
  timezone: "Timezone",
  screen: "Screen",
  viewport: "Viewport",
  devicePixelRatio: "Pixel ratio",
  colorScheme: "Colour scheme",
  online: "Online",
  libraryVersion: "Library version",
  id: "ID",
  email: "Email",
  name: "Name",
  level: "Level",
  message: "Message",
  stack: "Stack",
  at: "Timestamp",
  method: "Method",
  status: "Status",
};
