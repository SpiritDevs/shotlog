import { Schema } from "effect";
import { getShortId } from "../../short-id.js";
import type * as Public from "../../types.js";

type JsonValue = Public.JsonValue;

const JsonValueSchema: Schema.Schema<JsonValue> = Schema.suspend(() =>
  Schema.Union(
    Schema.Null,
    Schema.Boolean,
    Schema.JsonNumber,
    Schema.String,
    Schema.Array(JsonValueSchema),
    Schema.Record({ key: Schema.String, value: JsonValueSchema }),
  ),
).annotations({ identifier: "JsonValue" });

const withinJsonByteLimit = (value: object) =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength <= 16_384;
const jsonByteLimitAnnotations = {
  message: () => "Must be at most 16384 bytes of serialized UTF-8 JSON",
  jsonSchema: { "x-maxSerializedBytes": 16_384 },
};
const NonEmptyString = Schema.String.pipe(Schema.minLength(1));
const PositiveInt = Schema.Int.pipe(Schema.positive());
const Dimensions = Schema.Struct({ width: PositiveInt, height: PositiveInt });
const Timestamp = Schema.String.pipe(
  Schema.pattern(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/,
  ),
  Schema.filter(
    (value) => {
      const day = value.slice(0, 10);
      const date = new Date(`${day}T00:00:00.000Z`);
      return (
        Number.isFinite(Date.parse(value)) &&
        Number.isFinite(date.getTime()) &&
        date.toISOString().startsWith(day)
      );
    },
    { jsonSchema: { format: "date-time" } },
  ),
);

export const ReporterSchema = Schema.Struct(
  {
    id: Schema.optionalWith(Schema.String, { exact: true }),
    email: Schema.optionalWith(Schema.String, { exact: true }),
    name: Schema.optionalWith(Schema.String, { exact: true }),
  },
  { key: Schema.String, value: JsonValueSchema },
).pipe(Schema.filter(withinJsonByteLimit, jsonByteLimitAnnotations));

const MetadataSchema = Schema.Record({
  key: Schema.String,
  value: JsonValueSchema,
}).pipe(Schema.filter(withinJsonByteLimit, jsonByteLimitAnnotations));

export const EnvironmentSchema = Schema.Struct({
  url: NonEmptyString,
  route: Schema.String,
  title: Schema.String,
  referrer: Schema.String,
  timeOnPageMs: Schema.NonNegativeInt,
  userAgent: Schema.String,
  browser: NonEmptyString,
  os: NonEmptyString,
  deviceType: Schema.Literal("desktop", "mobile", "tablet", "unknown"),
  language: NonEmptyString,
  timezone: NonEmptyString,
  screen: Dimensions,
  viewport: Dimensions,
  devicePixelRatio: Schema.Number.pipe(Schema.finite(), Schema.positive()),
  colorScheme: Schema.Literal("light", "dark"),
  online: Schema.Boolean,
  libraryVersion: NonEmptyString,
});

export const DiagnosticsSchema = Schema.Struct({
  console: Schema.Array(
    Schema.Struct({
      level: Schema.Literal("error", "warn"),
      message: Schema.String.pipe(Schema.maxLength(2_000)),
      stack: Schema.optionalWith(Schema.String.pipe(Schema.maxLength(4_000)), {
        exact: true,
      }),
      at: Timestamp,
    }),
  ).pipe(Schema.maxItems(50)),
  network: Schema.Array(
    Schema.Struct({
      method: NonEmptyString,
      url: NonEmptyString,
      status: Schema.Union(
        Schema.Literal(0),
        Schema.Int.pipe(Schema.between(100, 599)),
      ),
      at: Timestamp,
    }),
  ).pipe(Schema.maxItems(50)),
});

const screenshotFields = {
  ...Dimensions.fields,
  size: PositiveInt,
  mimeType: Schema.Literal("image/png"),
  uploadError: Schema.optionalWith(Schema.String, { exact: true }),
};
export const ScreenshotSchema = Schema.Union(
  Schema.Struct({
    _tag: Schema.Literal("Inline"),
    ...screenshotFields,
    data: NonEmptyString.pipe(
      Schema.pattern(
        /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
      ),
    ),
  }),
  Schema.Struct({
    _tag: Schema.Literal("Uploaded"),
    ...screenshotFields,
    url: Schema.String.pipe(
      Schema.filter(
        (value) => {
          if (!URL.canParse(value)) return false;
          const { protocol } = new URL(value);
          return protocol === "https:" || protocol === "http:";
        },
        { jsonSchema: { format: "uri", pattern: "^https?://" } },
      ),
    ),
    key: NonEmptyString,
  }),
);

export const schemaVersion = 1;

const supportLogFields = {
  schemaVersion: Schema.Literal(schemaVersion),
  id: Schema.UUID,
  shortId: Schema.String.pipe(Schema.pattern(/^SL-[0-9A-HJKMNP-TV-Z]{4}$/)),
  createdAt: Timestamp,
  type: NonEmptyString.pipe(Schema.maxLength(40)),
  description: Schema.String.pipe(
    Schema.minLength(1),
    Schema.maxLength(10_000),
  ),
  environment: EnvironmentSchema,
  reporter: Schema.optionalWith(ReporterSchema, { exact: true }),
  metadata: Schema.optionalWith(MetadataSchema, { exact: true }),
  diagnostics: Schema.optionalWith(DiagnosticsSchema, { exact: true }),
};
const shortIdMatches = (value: {
  readonly id: string;
  readonly shortId: string;
}) => value.shortId === getShortId(value.id);
const shortIdAnnotations = {
  message: () => "shortId must be derived from id with getShortId",
  jsonSchema: {
    $comment:
      "shortId is SL- followed by the final 20 UUID bits encoded as four Crockford base32 characters; reporter and metadata each have a 16384-byte serialized UTF-8 JSON limit (x-maxSerializedBytes). These constraints are enforced by shotlog at runtime.",
  },
};

export const SupportLogSchema = Schema.Struct({
  ...supportLogFields,
  screenshot: Schema.optionalWith(ScreenshotSchema, { exact: true }),
})
  .pipe(Schema.filter(shortIdMatches, shortIdAnnotations))
  .annotations({ parseOptions: { onExcessProperty: "error" } });

export const SupportLogSubmissionSchema = Schema.Struct(supportLogFields)
  .pipe(Schema.filter(shortIdMatches, shortIdAnnotations))
  .annotations({ parseOptions: { onExcessProperty: "error" } });

// The public types are hand-written for readable declarations and per-field docs.
// This fails typecheck if they drift from the schemas.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
export type PublicTypesInSync = [
  Assert<Same<typeof SupportLogSchema.Type, Public.SupportLog>>,
  Assert<
    Same<typeof SupportLogSubmissionSchema.Type, Public.SupportLogSubmission>
  >,
  Assert<Same<typeof ScreenshotSchema.Type, Public.Screenshot>>,
  Assert<Same<typeof EnvironmentSchema.Type, Public.Environment>>,
  Assert<Same<typeof ReporterSchema.Type, Public.Reporter>>,
  Assert<Same<typeof DiagnosticsSchema.Type, Public.Diagnostics>>,
];
