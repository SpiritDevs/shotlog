import type { RecordingUploadTarget } from "../../server/storage-types.js";

interface UploadOptions {
  readonly signal: AbortSignal;
  /** Bytes sent so far, including parts a resumed session already holds. */
  readonly onProgress: (loaded: number) => void;
}

/** Sends a Screen Recording straight to storage; the Relay Endpoint never sees the bytes. */
export async function uploadRecording(
  target: RecordingUploadTarget,
  video: Blob,
  options: UploadOptions,
): Promise<void> {
  if (target._tag === "Put") {
    await put(target.url, video, target.headers ?? {}, options);
    return;
  }
  await uploadSession(target, video, options);
}

/** XHR rather than fetch: only XHR reports upload progress. Resolves with the ETag. */
function put(
  url: string,
  body: Blob,
  headers: { readonly [name: string]: string },
  { signal, onProgress }: UploadOptions,
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const done = (settle: () => void) => {
      signal.removeEventListener("abort", abort);
      settle();
    };
    xhr.open("PUT", url);
    for (const [name, value] of Object.entries(headers))
      xhr.setRequestHeader(name, value);
    xhr.upload.addEventListener("progress", (event) =>
      onProgress(Math.min(body.size, event.loaded)),
    );
    xhr.addEventListener("load", () =>
      done(() =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve(xhr.getResponseHeader("etag"))
          : reject(new Error(`Storage rejected the upload (${xhr.status})`)),
      ),
    );
    xhr.addEventListener("error", () =>
      done(() => reject(new Error("Storage connection failed"))),
    );
    xhr.addEventListener("abort", () => done(() => reject(signal.reason)));
    signal.addEventListener("abort", abort, { once: true });
    xhr.send(body);
  });
}

interface SessionState {
  readonly status: string;
  readonly parts?: readonly { partNumber: number; etag: string }[];
}

const failed = ["failed", "canceled", "cancelled", "expired", "deleted"];

/** UploadFile's resumable session: each part is signed on request, then completed and verified. */
async function uploadSession(
  target: Extract<RecordingUploadTarget, { _tag: "UploadFile" }>,
  video: Blob,
  options: UploadOptions,
): Promise<void> {
  const base = target.url.replace(/\/$/, "");
  const call = async <T>(path: string, body?: unknown): Promise<T> => {
    const response = await fetch(`${base}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        authorization: `Bearer ${target.uploadToken}`,
        "content-type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: options.signal,
    });
    if (!response.ok)
      throw new Error(`Upload service refused (${response.status})`);
    return (await response.json()) as T;
  };
  let state = await call<SessionState>("");
  if (failed.includes(state.status))
    throw new Error(`Upload session is ${state.status}`);
  const etags = new Map(
    (state.parts ?? []).map((part) => [part.partNumber, part.etag]),
  );
  const partBytes = (number: number) =>
    video.slice((number - 1) * target.partSize, number * target.partSize);
  const sent = () =>
    [...etags.keys()].reduce((total, n) => total + partBytes(n).size, 0);
  if (state.status !== "complete" && state.status !== "processing") {
    for (let number = 1; number <= target.partCount; number++) {
      if (etags.has(number)) continue;
      const bytes = partBytes(number);
      for (let attempt = 0; ; attempt++) {
        try {
          const { parts } = await call<{
            parts: readonly {
              partNumber: number;
              url: string;
              headers?: Record<string, string>;
            }[];
          }>("/parts", { partNumbers: [number] });
          const signed = parts.find((part) => part.partNumber === number);
          if (!signed) throw new Error("Part was not authorized");
          const before = sent();
          const etag = await put(signed.url, bytes, signed.headers ?? {}, {
            signal: options.signal,
            onProgress: (loaded) => options.onProgress(before + loaded),
          });
          if (!etag) throw new Error("Storage did not return an ETag");
          etags.set(number, etag);
          break;
        } catch (error) {
          if (options.signal.aborted || attempt === 2) throw error;
          await delay(250 * 2 ** attempt, options.signal);
        }
      }
    }
    state = await call<SessionState>("/complete", {
      parts: [...etags].map(([partNumber, etag]) => ({ partNumber, etag })),
    });
  }
  // The service verifies the parts before the file is ready to link.
  const deadline = Date.now() + 120_000;
  while (state.status !== "complete") {
    if (failed.includes(state.status) || Date.now() > deadline)
      throw new Error(`Upload session is ${state.status}`);
    await delay(500, options.signal);
    state = await call<SessionState>("");
  }
  options.onProgress(video.size);
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}
