import { Effect, ParseResult, Schema } from "effect";
import {
  PayloadTooLarge,
  UploadFailed,
  ValidationFailed,
} from "../internal/errors.js";
import { RecordingSchema } from "../internal/schema/support-log.js";
import type {
  RecordingLimits,
  RecordingPart,
  RecordingUploadBody,
} from "../internal/wire.js";
import type { Recording } from "../types.js";
import type { RecordingConfig } from "./config.js";

const requestLimit = 4 * 1024;
export const recordingPartLimit = 8 * 1024;
const storageTimeoutMs = 10_000;

export const recordingLimits = (config: RecordingConfig): RecordingLimits => ({
  maxSeconds: config.maxSeconds ?? 300,
  maxBytes: config.maxBytes ?? 200 * 1024 * 1024,
});

const MimeType = Schema.String.pipe(
  Schema.maxLength(100),
  Schema.pattern(/^video\/[\w.+-]+(?:;[\w .=,+-]*)?$/),
);
const PositiveInt = Schema.Int.pipe(Schema.positive());
const UploadRequestSchema = Schema.Struct({
  recordingUpload: Schema.Struct({
    id: Schema.UUID,
    size: PositiveInt,
    mimeType: MimeType,
  }),
});
const RecordingPartSchema = Schema.Struct({
  ticket: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(4096)),
  width: PositiveInt,
  height: PositiveInt,
  durationMs: Schema.NonNegativeInt,
  size: PositiveInt,
  mimeType: MimeType,
});
const HttpUrl = Schema.String.pipe(
  Schema.filter((value) => {
    try {
      return ["http:", "https:"].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }),
);
const TargetSchema = Schema.Union(
  Schema.Struct({
    _tag: Schema.Literal("Put"),
    url: HttpUrl,
    headers: Schema.optionalWith(
      Schema.Record({ key: Schema.String, value: Schema.String }),
      { exact: true },
    ),
  }),
  Schema.Struct({
    _tag: Schema.Literal("UploadFile"),
    url: HttpUrl,
    uploadToken: Schema.String.pipe(Schema.minLength(1)),
    partSize: PositiveInt,
    partCount: PositiveInt,
  }),
);
const UploadSchema = Schema.Struct({
  target: TargetSchema,
  ticket: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(4096)),
});

const issues = (field: string) => (error: ParseResult.ParseError) =>
  new ValidationFailed({
    issues: ParseResult.ArrayFormatter.formatErrorSync(error).map(
      (issue) =>
        `${[field, ...issue.path.map(String)].join(".")}: ${issue.message}`,
    ),
  });

const tooLong = (config: RecordingConfig, durationMs: number) =>
  // A second of grace: the recorder stops itself at the limit, a moment after it.
  durationMs > (recordingLimits(config).maxSeconds + 1) * 1000;

const extension = (mimeType: string) =>
  mimeType.startsWith("video/mp4") ? "mp4" : "webm";

/** Reads the JSON body of a recording upload request, before any storage work. */
export const parseUploadRequest = Effect.fn("parseRecordingUploadRequest")(
  function* (request: Request, config: RecordingConfig) {
    const length = request.headers.get("content-length");
    if (length !== null && Number(length) > requestLimit)
      return yield* new PayloadTooLarge({ limitBytes: requestLimit });
    const text = yield* Effect.tryPromise({
      try: () => request.text(),
      catch: () => new ValidationFailed({ issues: ["Could not read body"] }),
    });
    if (new TextEncoder().encode(text).byteLength > requestLimit)
      return yield* new PayloadTooLarge({ limitBytes: requestLimit });
    const { recordingUpload } = yield* Schema.decodeUnknown(
      Schema.parseJson(UploadRequestSchema),
      { errors: "all" },
    )(text).pipe(Effect.mapError(issues("body")));
    const { maxBytes } = recordingLimits(config);
    if (recordingUpload.size > maxBytes)
      return yield* new PayloadTooLarge({ limitBytes: maxBytes });
    return recordingUpload;
  },
);

export const createUpload = Effect.fn("createRecordingUpload")(function* (
  config: RecordingConfig,
  upload: {
    readonly id: string;
    readonly size: number;
    readonly mimeType: string;
  },
) {
  const result = yield* Effect.tryPromise({
    try: (signal) =>
      config.storage.createUpload({
        ...upload,
        filename: `support-log-${upload.id}.${extension(upload.mimeType)}`,
        signal,
      }),
    catch: (cause) => cause,
  }).pipe(
    Effect.timeoutFail({
      duration: storageTimeoutMs,
      onTimeout: () => new Error("Recording storage timed out"),
    }),
    Effect.flatMap(Schema.decodeUnknown(UploadSchema)),
    // Storage details stay in the server log; the browser learns the upload can't start.
    Effect.catchAll((cause) =>
      Effect.sync(() =>
        console.error(
          `shotlog: ${config.storage.name} could not start a recording upload`,
          cause,
        ),
      ).pipe(
        Effect.zipRight(
          Effect.fail(
            new UploadFailed({ message: "Recording upload could not start" }),
          ),
        ),
      ),
    ),
  );
  const body: RecordingUploadBody = { ok: true, ...result };
  return body;
});

export const parseRecordingPart = Effect.fn("parseRecordingPart")(function* (
  value: string,
) {
  if (new TextEncoder().encode(value).byteLength > recordingPartLimit)
    return yield* new PayloadTooLarge({ limitBytes: recordingPartLimit });
  return yield* Schema.decodeUnknown(Schema.parseJson(RecordingPartSchema), {
    errors: "all",
  })(value).pipe(Effect.mapError(issues("recording")));
});

/** Checks the ticket with storage and builds the delivered Recording. */
export const resolveRecording = Effect.fn("resolveRecording")(function* (
  config: RecordingConfig,
  part: RecordingPart,
) {
  if (part.size > recordingLimits(config).maxBytes)
    return yield* new PayloadTooLarge({
      limitBytes: recordingLimits(config).maxBytes,
    });
  if (tooLong(config, part.durationMs))
    return yield* new ValidationFailed({
      issues: ["recording.durationMs: Longer than the recording limit"],
    });
  return yield* Effect.tryPromise({
    try: (signal) => config.storage.resolveUpload(part.ticket, { signal }),
    catch: (cause) => cause,
  }).pipe(
    Effect.timeoutFail({
      duration: storageTimeoutMs,
      onTimeout: () => new Error("Recording storage timed out"),
    }),
    Effect.flatMap(({ url, key }) =>
      Schema.decodeUnknown(RecordingSchema)({
        url,
        key,
        width: part.width,
        height: part.height,
        durationMs: part.durationMs,
        size: part.size,
        mimeType: part.mimeType,
      } satisfies Recording),
    ),
    Effect.catchAll((cause) =>
      Effect.sync(() =>
        console.error(
          `shotlog: ${config.storage.name} could not resolve a recording upload`,
          cause,
        ),
      ).pipe(
        Effect.zipRight(
          Effect.fail(
            new UploadFailed({ message: "Recording could not be attached" }),
          ),
        ),
      ),
    ),
  );
});
