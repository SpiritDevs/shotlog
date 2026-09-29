import type { ShotlogError } from "../errors.js";
import type { ShotlogLabels, ShotlogTypeOption } from "./types.js";

export function typeValue(option: ShotlogTypeOption): string {
  return typeof option === "string" ? option : option.value;
}

export function typeLabel(
  option: ShotlogTypeOption,
  labels: ShotlogLabels,
): string {
  if (typeof option !== "string" && option.label !== undefined)
    return option.label;
  const value = typeValue(option);
  switch (value) {
    case "Bug":
      return labels.bug;
    case "Question":
      return labels.question;
    case "Idea":
      return labels.idea;
    default:
      return value;
  }
}

export const defaultLabels: ShotlogLabels = {
  lang: "en",
  launcher: "Report an issue",
  title: "Send a report",
  close: "Close report",
  type: "Type",
  bug: "Bug",
  question: "Question",
  idea: "Idea",
  description: "What were you trying to do?",
  descriptionRequired: "Please describe what you were trying to do.",
  screenshot: "Screenshot",
  screenshotOptions: "Screenshot options",
  capturePage: "Capture page",
  captureScreen: "Capture exact screen",
  captureDelayed: "Capture in 5 seconds",
  countdown: (seconds) => `Capturing in ${seconds}…`,
  cancelCountdown: "Cancel",
  slackChannel: "Slack channel",
  slackNoChannels: "No channels available",
  uploadImage: "Upload image",
  screenshotPreview: "Attached screenshot",
  removeScreenshot: "Remove",
  capturingScreenshot: "Capturing screenshot…",
  pageCaptureFailed:
    "Couldn't capture this page. Try Capture exact screen or Upload image.",
  pageCaptureFailedWithoutScreen:
    "Couldn't capture this page. Try Upload image.",
  screenCaptureFailed:
    "Couldn't capture your screen. Try Capture page or Upload image.",
  imageFailed: "Couldn't open this image. Try another image or Capture page.",
  editScreenshot: "Edit",
  editorTitle: "Annotate screenshot",
  editorCancel: "Cancel",
  editorDone: "Done",
  editorSaving: "Saving…",
  editorFailed: "Couldn’t save this screenshot. Try again.",
  editorDiscardChanges: "Discard your annotation changes?",
  editorKeepEditing: "Keep editing",
  editorDiscard: "Discard",
  editorTextSmall: "Small text",
  editorTextMedium: "Medium text",
  editorTextLarge: "Large text",
  editorTools: "Annotation tools",
  editorStyle: "Annotation style",
  editorCanvas:
    "Screenshot canvas. Choose a tool to draw; use Select to move annotations.",
  editorSelect: "Select / Move",
  editorArrow: "Arrow",
  editorRectangle: "Rectangle",
  editorOval: "Oval",
  editorText: "Text",
  editorTextInput: "Annotation text",
  editorFreehand: "Freehand",
  editorHighlighter: "Highlighter",
  editorStep: "Step Counter",
  editorSpotlight: "Spotlight",
  editorRedact: "Pixelate / Redact",
  editorCrop: "Crop",
  editorApplyCrop: "Apply crop",
  editorCropHint: "Press Enter to apply crop. Undo restores the previous crop.",
  editorRed: "Red",
  editorYellow: "Yellow",
  editorGreen: "Green",
  editorBlue: "Blue",
  editorBlackWhite: "Black / White (click to switch)",
  editorThin: "Thin",
  editorMedium: "Medium",
  editorThick: "Thick",
  editorRounded: "Rounded",
  editorSolid: "Solid (strongest)",
  editorUndo: "Undo (⌘/Ctrl+Z)",
  editorRedo: "Redo (⇧⌘/Ctrl+Shift+Z)",
  editorToolSelected: (tool) => `${tool} selected`,
  recordScreen: "Record screen",
  recordingLimit: (seconds) =>
    seconds % 60 ? `Up to ${seconds} s` : `Up to ${seconds / 60} min`,
  recording: "Screen recording",
  removeRecording: "Remove",
  recordingFailed: "Couldn't record your screen. Try again.",
  recordingTooLarge: "That recording is too large. Try a shorter one.",
  recordingTools: "Recording controls",
  recordingMove: "Move toolbar",
  recordingElapsed: (time) => `Recording, ${time}`,
  recordingPointer: "Use the page",
  recordingPen: "Draw",
  recordingClear: "Clear drawings",
  recordingMute: "Mute microphone",
  recordingUnmute: "Unmute microphone",
  recordingNoMicrophone: "No microphone",
  recordingFinish: "Finish",
  recordingDiscard: "Discard recording",
  recordingConfirmDiscard: "Discard?",
  uploadingRecording: (percent) => `Uploading recording… ${percent}%`,
  includedDetails: (consoleCount, networkCount) =>
    `Included details · ${consoleCount} console · ${networkCount} network`,
  detailsSummary: "Included details",
  consoleCount: (count) => `${count} console`,
  networkCount: (count) => `${count} network`,
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
  sentTitle: "Report sent",
  sent: (shortId) => `Reference ${shortId}`,
  resizeCard: "Resize report card",
  unauthorized: "Please sign in, then try again.",
  forbidden: "You don't have permission to send a report.",
  rateLimited: (minutes) =>
    `You're sending too fast — try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`,
  payloadTooLarge:
    "This report is too large. Remove the screenshot or shorten the description, then try again.",
  validationFailed:
    "We couldn't process this report. Check the details and try again.",
  deliveryFailed: "Your report couldn't be delivered. Please try again.",
  uploadFailed: "Your screenshot couldn't be uploaded. Please try again.",
  recordingUploadFailed:
    "Your screen recording couldn't be uploaded. Please try again.",
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
