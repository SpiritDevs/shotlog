import type {
  DeliveryFailed,
  Diagnostics,
  Environment,
  Forbidden,
  JsonValue,
  Offline,
  PayloadTooLarge,
  ProviderNotInstalled,
  RateLimited,
  Reporter,
  Screenshot,
  ShotlogError,
  SupportLog,
  SupportLogSubmission,
  Unauthorized,
  UnsupportedRuntime,
  UploadFailed,
  ValidationFailed,
} from "shotlog";
import type { ShotlogError as NodeError } from "shotlog/node";
import type {
  ShotlogError as ServerError,
  StorageAdapter,
  WebhookConfig,
} from "shotlog/server";
import { expectTypeOf, test } from "vitest";

declare const error: ShotlogError;
declare const storage: StorageAdapter;

test("webhook upload requires storage and base64 excludes it", () => {
  const base64 = {
    url: "https://example.com",
    secret: "secret",
  } satisfies WebhookConfig;
  const upload: WebhookConfig = {
    ...base64,
    screenshotMode: "upload",
    storage,
  };
  // @ts-expect-error Upload mode must provide a StorageAdapter.
  const invalid: WebhookConfig = { ...base64, screenshotMode: "upload" };
  // @ts-expect-error Storage is only valid in upload mode.
  const unused: WebhookConfig = { ...base64, storage };
  void upload;
  void invalid;
  void unused;
});

// Compiled declarations are tested through the same exports that Host Apps resolve.
test("public errors narrow by _tag", () => {
  expectTypeOf<ServerError>().toEqualTypeOf<ShotlogError>();
  expectTypeOf<NodeError>().toEqualTypeOf<ShotlogError>();
  switch (error._tag) {
    case "Unauthorized":
      expectTypeOf(error).toEqualTypeOf<Unauthorized>();
      break;
    case "Forbidden":
      expectTypeOf(error).toEqualTypeOf<Forbidden>();
      break;
    case "RateLimited":
      expectTypeOf(error).toEqualTypeOf<RateLimited>();
      expectTypeOf(error.retryAfterSeconds).toEqualTypeOf<number>();
      break;
    case "PayloadTooLarge":
      expectTypeOf(error).toEqualTypeOf<PayloadTooLarge>();
      expectTypeOf(error.limitBytes).toEqualTypeOf<number>();
      break;
    case "ValidationFailed":
      expectTypeOf(error).toEqualTypeOf<ValidationFailed>();
      expectTypeOf(error.issues).toEqualTypeOf<readonly string[]>();
      break;
    case "DeliveryFailed":
      expectTypeOf(error).toEqualTypeOf<DeliveryFailed>();
      expectTypeOf(error.channel).toEqualTypeOf<
        "email" | "webhook" | "slack" | "custom"
      >();
      break;
    case "UploadFailed":
      expectTypeOf(error).toEqualTypeOf<UploadFailed>();
      break;
    case "Offline":
      expectTypeOf(error).toEqualTypeOf<Offline>();
      break;
    case "ProviderNotInstalled":
      expectTypeOf(error).toEqualTypeOf<ProviderNotInstalled>();
      expectTypeOf(error.packageName).toEqualTypeOf<string>();
      expectTypeOf(error.installCommand).toEqualTypeOf<string>();
      break;
    case "UnsupportedRuntime":
      expectTypeOf(error).toEqualTypeOf<UnsupportedRuntime>();
      break;
    default:
      expectTypeOf(error).toBeNever();
  }
});

test("Support Log exposes the complete plain JSON contract", () => {
  expectTypeOf<SupportLog>().not.toBeAny();
  expectTypeOf<SupportLog>().toEqualTypeOf<{
    readonly schemaVersion: 1;
    readonly id: string;
    readonly shortId: string;
    readonly createdAt: string;
    readonly type: string;
    readonly description: string;
    readonly screenshot?: Screenshot;
    readonly environment: Environment;
    readonly reporter?: Reporter;
    readonly metadata?: { readonly [key: string]: JsonValue };
    readonly diagnostics?: Diagnostics;
  }>();
  expectTypeOf<SupportLogSubmission>().toEqualTypeOf<
    Omit<SupportLog, "screenshot">
  >();
  expectTypeOf<SupportLog>().toEqualTypeOf<
    import("../src/types.js").SupportLog
  >();
  expectTypeOf<SupportLog>().toEqualTypeOf<
    import("shotlog/server").SupportLog
  >();
  expectTypeOf<SupportLog>().toEqualTypeOf<import("shotlog/node").SupportLog>();
});
