export * from "./errors.js";
export type * from "./server/config.js";
export type * from "./server/email-types.js";
export { defaultEmailLabels } from "./server/email-types.js";
export { createSupportHandler } from "./server/handler.js";
export type {
  ResendOptions,
  SesCredentials,
  SesOptions,
  SmtpOptions,
} from "./server/providers.js";
export { resend, ses, smtp } from "./server/providers.js";
export { verifyWebhookSignature } from "./server/verify.js";
export { getShortId } from "./short-id.js";
export type * from "./types.js";
