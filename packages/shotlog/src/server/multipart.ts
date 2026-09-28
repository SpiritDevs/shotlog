import { Effect, ParseResult, Schema } from "effect";
import { PayloadTooLarge, ValidationFailed } from "../internal/errors.js";
import { SupportLogSubmissionSchema } from "../internal/schema/support-log.js";
import { Field } from "../internal/wire.js";
import type { Screenshot } from "../types.js";

const jsonLimit = 256 * 1024;
export const totalBodyLimit = (screenshotBytes: number) =>
  screenshotBytes + jsonLimit + 16 * 1024;
const invalid = (issue: string) => new ValidationFailed({ issues: [issue] });

export const checkRequest = Effect.fn("checkSupportRequest")(function* (
  request: Request,
  screenshotBytes: number,
) {
  if (
    request.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase() !== "multipart/form-data"
  ) {
    return yield* invalid("Content-Type must be multipart/form-data");
  }
  const length = request.headers.get("content-length");
  if (length !== null) {
    if (!/^\d+$/.test(length)) return yield* invalid("Invalid Content-Length");
    const limitBytes = totalBodyLimit(screenshotBytes);
    if (Number(length) > limitBytes)
      return yield* new PayloadTooLarge({ limitBytes });
  }
});

const parseForm = Effect.fn("parseSupportForm")(function* (
  request: Request,
  limitBytes: number,
) {
  let size = 0;
  let exceeded = false;
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]);
  const limiter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      size += chunk.byteLength;
      if (size > limitBytes) {
        exceeded = true;
        controller.error(new PayloadTooLarge({ limitBytes }));
      } else {
        controller.enqueue(chunk);
      }
    },
  });
  return yield* Effect.tryPromise({
    try: () =>
      new Response(request.body?.pipeThrough(limiter, { signal }) ?? null, {
        headers: { "content-type": request.headers.get("content-type") ?? "" },
      }).formData(),
    catch: () =>
      exceeded
        ? new PayloadTooLarge({ limitBytes })
        : invalid(
            signal.aborted
              ? "Request body was not received in time"
              : "Malformed multipart body",
          ),
  });
});

const parseScreenshot = Effect.fn("parseScreenshot")(function* (
  file: File,
  limitBytes: number,
) {
  if (file.size > limitBytes) return yield* new PayloadTooLarge({ limitBytes });
  const data = yield* Effect.tryPromise({
    try: () => file.arrayBuffer(),
    catch: () => invalid("Could not read screenshot"),
  });
  const bytes = new Uint8Array(data);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (
    bytes.length < 33 ||
    !signature.every((byte, index) => bytes[index] === byte)
  ) {
    return yield* invalid("screenshot must be a PNG image");
  }
  const view = new DataView(data);
  if (view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452) {
    return yield* invalid("screenshot must have a PNG IHDR chunk");
  }
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (
    width === 0 ||
    height === 0 ||
    width > 0x7fffffff ||
    height > 0x7fffffff
  ) {
    return yield* invalid("screenshot has invalid PNG dimensions");
  }
  return { bytes, width, height };
});

export interface ParsedScreenshot {
  readonly bytes: Uint8Array;
  readonly width: number;
  readonly height: number;
}

export function inlineScreenshot({
  bytes,
  width,
  height,
}: ParsedScreenshot): Screenshot {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  }
  return {
    _tag: "Inline",
    data: btoa(chunks.join("")),
    width,
    height,
    size: bytes.length,
    mimeType: "image/png",
  };
}

export const parseSubmission = Effect.fn("parseSupportSubmission")(function* (
  request: Request,
  screenshotBytes: number,
) {
  const form = yield* parseForm(request, totalBodyLimit(screenshotBytes));
  let unexpected = false;
  form.forEach((_, key) => {
    if (key !== Field.supportLog && key !== Field.screenshot) unexpected = true;
  });
  if (
    unexpected ||
    form.getAll(Field.supportLog).length !== 1 ||
    form.getAll(Field.screenshot).length > 1
  ) {
    return yield* invalid(
      "Expected one supportLog part and at most one screenshot part",
    );
  }
  const part = form.get(Field.supportLog);
  if (part === null) return yield* invalid("supportLog is required");
  const size =
    typeof part === "string"
      ? new TextEncoder().encode(part).byteLength
      : part.size;
  if (size > jsonLimit)
    return yield* new PayloadTooLarge({ limitBytes: jsonLimit });
  const json =
    typeof part === "string"
      ? part
      : yield* Effect.tryPromise({
          try: () => part.text(),
          catch: () => invalid("Could not read supportLog"),
        });
  const submission = yield* Schema.decodeUnknown(
    Schema.parseJson(SupportLogSubmissionSchema),
    { errors: "all" },
  )(json).pipe(
    Effect.mapError(
      (error) =>
        new ValidationFailed({
          issues: ParseResult.ArrayFormatter.formatErrorSync(error).map(
            (issue) =>
              `${issue.path.map(String).join(".") || Field.supportLog}: ${issue.message}`,
          ),
        }),
    ),
  );
  const file = form.get(Field.screenshot);
  if (typeof file === "string")
    return yield* invalid("screenshot must be a PNG file");
  const screenshot =
    file === null ? undefined : yield* parseScreenshot(file, screenshotBytes);
  return { submission, screenshot };
});
