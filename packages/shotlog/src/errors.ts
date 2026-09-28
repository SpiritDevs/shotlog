/**
 * The Relay Endpoint requires authentication.
 * @example
 * ```ts
 * throw new Unauthorized();
 * ```
 * @public
 */
export class Unauthorized extends Error {
  readonly _tag = "Unauthorized";
  constructor(message = "Authentication is required", options?: ErrorOptions) {
    super(message, options);
    this.name = this._tag;
  }
}

/**
 * The Authorize Hook denied this Reporter.
 * @example
 * ```ts
 * throw new Forbidden();
 * ```
 * @public
 */
export class Forbidden extends Error {
  readonly _tag = "Forbidden";
  constructor(
    message = "You cannot submit a Support Log",
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = this._tag;
  }
}

/**
 * The Reporter must wait before submitting again.
 * @example
 * ```ts
 * throw new RateLimited(60);
 * ```
 * @public
 */
export class RateLimited extends Error {
  readonly _tag = "RateLimited";
  constructor(
    readonly retryAfterSeconds: number,
    message = `Try again in ${retryAfterSeconds} seconds`,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = this._tag;
  }
}

/**
 * A Support Log or Screenshot exceeded a size limit.
 * @example
 * ```ts
 * throw new PayloadTooLarge(5 * 1024 * 1024);
 * ```
 * @public
 */
export class PayloadTooLarge extends Error {
  readonly _tag = "PayloadTooLarge";
  constructor(
    readonly limitBytes: number,
    message = `The payload exceeds ${limitBytes} bytes`,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = this._tag;
  }
}

/**
 * A Support Log failed validation.
 * @example
 * ```ts
 * throw new ValidationFailed(["description is required"]);
 * ```
 * @public
 */
export class ValidationFailed extends Error {
  readonly _tag = "ValidationFailed";
  constructor(
    readonly issues: readonly string[],
    message = "The Support Log is invalid",
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = this._tag;
  }
}

/**
 * A Delivery Channel could not deliver the Support Log. `custom` means a Host App `onSubmit` failed.
 * @example
 * ```ts
 * throw new DeliveryFailed("webhook");
 * ```
 * @public
 */
export class DeliveryFailed extends Error {
  readonly _tag = "DeliveryFailed";
  constructor(
    readonly channel: "email" | "webhook" | "custom",
    message = `Support Log delivery through ${channel} failed`,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = this._tag;
  }
}

/**
 * A Storage Adapter could not upload the Screenshot.
 * @example
 * ```ts
 * throw new UploadFailed("Screenshot upload timed out");
 * ```
 * @public
 */
export class UploadFailed extends Error {
  readonly _tag = "UploadFailed";
  constructor(message = "Screenshot upload failed", options?: ErrorOptions) {
    super(message, options);
    this.name = this._tag;
  }
}

/**
 * The browser is offline.
 * @example
 * ```ts
 * throw new Offline();
 * ```
 * @public
 */
export class Offline extends Error {
  readonly _tag = "Offline";
  constructor(message = "You are offline", options?: ErrorOptions) {
    super(message, options);
    this.name = this._tag;
  }
}

/**
 * A configured provider's optional peer dependency is missing.
 * @example
 * ```ts
 * throw new ProviderNotInstalled("resend");
 * ```
 * @public
 */
export class ProviderNotInstalled extends Error {
  readonly _tag = "ProviderNotInstalled";
  readonly installCommand: string;
  constructor(
    readonly packageName: string,
    message = `Install ${packageName} to use this provider`,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = this._tag;
    this.installCommand = `npm install ${packageName}`;
  }
}

/**
 * A feature cannot run in the current runtime, such as SMTP on an edge runtime.
 * @example
 * ```ts
 * throw new UnsupportedRuntime("SMTP requires Node.js");
 * ```
 * @public
 */
export class UnsupportedRuntime extends Error {
  readonly _tag = "UnsupportedRuntime";
  constructor(
    message = "This runtime is not supported",
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = this._tag;
  }
}

/**
 * All expected public failures, discriminated by `_tag`.
 * @example
 * ```ts
 * function retryDelay(error: ShotlogError) {
 *   return error._tag === "RateLimited" ? error.retryAfterSeconds : 0;
 * }
 * ```
 * @public
 */
export type ShotlogError =
  | Unauthorized
  | Forbidden
  | RateLimited
  | PayloadTooLarge
  | ValidationFailed
  | DeliveryFailed
  | UploadFailed
  | Offline
  | ProviderNotInstalled
  | UnsupportedRuntime;
