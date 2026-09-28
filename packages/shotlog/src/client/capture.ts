import {
  captureSize,
  imageDimensions,
  screenshotLimit,
} from "./capture-size.js";

export const supportsScreenCapture = () =>
  typeof navigator !== "undefined" &&
  typeof navigator.mediaDevices?.getDisplayMedia === "function";

const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

const hiddenHosts = new WeakMap<
  HTMLElement,
  {
    count: number;
    visibility: string;
    priority: string;
  }
>();

/** Each operation releases only its own visibility lease, including on timeout. */
async function withHiddenWidget<T>(
  host: HTMLElement,
  capture: (signal: AbortSignal, startDeadline: () => void) => Promise<T>,
  deadlineStartsImmediately = true,
): Promise<T> {
  let hidden = hiddenHosts.get(host);
  if (!hidden) {
    hidden = {
      count: 0,
      visibility: host.style.getPropertyValue("visibility"),
      priority: host.style.getPropertyPriority("visibility"),
    };
    hiddenHosts.set(host, hidden);
  }
  hidden.count++;
  host.style.setProperty("visibility", "hidden", "important");
  // This signal is also the stale-operation token: late imports/frames cannot proceed.
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    let rejectDeadline: (error: Error) => void = () => {};
    const deadline = new Promise<never>((_, reject) => {
      rejectDeadline = reject;
    });
    const startDeadline = () => {
      timer ??= setTimeout(() => {
        const error = new Error("Screenshot capture timed out");
        controller.abort(error);
        rejectDeadline(error);
      }, 15_000);
    };
    if (deadlineStartsImmediately) startDeadline();
    return await Promise.race([
      capture(controller.signal, startDeadline),
      deadline,
    ]);
  } finally {
    clearTimeout(timer);
    controller.abort();
    if (--hidden.count === 0) {
      hiddenHosts.delete(host);
      if (hidden.visibility)
        host.style.setProperty(
          "visibility",
          hidden.visibility,
          hidden.priority,
        );
      else host.style.removeProperty("visibility");
    }
  }
}

export function capturePage(host: HTMLElement): Promise<Blob> {
  return withHiddenWidget(host, async (signal) => {
    await nextFrame();
    signal.throwIfAborted();
    const { renderPage } = await import("./page-render.js");
    signal.throwIfAborted();
    const canvas = await renderPage(host, signal);
    signal.throwIfAborted();
    return canvasToPng(canvas);
  });
}

export function captureScreen(host: HTMLElement): Promise<Blob | undefined> {
  // The deadline starts once sharing is granted: time spent in the browser's picker is the user's.
  return withHiddenWidget(
    host,
    async (signal, startDeadline) => {
      // Invoke before any await to retain the click's transient user activation.
      const options: DisplayMediaStreamOptions & {
        preferCurrentTab: boolean;
        selfBrowserSurface: "include";
      } = {
        video: { displaySurface: "browser" },
        preferCurrentTab: true,
        selfBrowserSurface: "include",
        audio: false,
      };
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getDisplayMedia(options);
      } catch (error) {
        if (
          error instanceof DOMException &&
          (error.name === "NotAllowedError" || error.name === "AbortError")
        )
          return undefined;
        throw error;
      }
      startDeadline();
      const video = document.createElement("video");
      let canvas: HTMLCanvasElement;
      try {
        signal.throwIfAborted();
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        await videoFrame(video, signal);
        signal.throwIfAborted();
        canvas = drawImage(video, video.videoWidth, video.videoHeight);
      } finally {
        // Release the sharing indicator before PNG encoding or the M4 editor.
        for (const track of stream.getTracks()) track.stop();
        video.pause();
        video.srcObject = null;
      }
      return canvasToPng(canvas);
    },
    false,
  );
}

function videoFrame(
  video: HTMLVideoElement,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let frame: number | undefined;
    const finish = (error?: unknown) => {
      signal.removeEventListener("abort", aborted);
      if (frame !== undefined) video.cancelVideoFrameCallback(frame);
      video.removeEventListener("loadeddata", ready);
      video.removeEventListener("error", failed);
      if (error) reject(error);
      else resolve();
    };
    const ready = () => finish();
    const failed = () => finish(new Error("Screen frame is unavailable"));
    const aborted = () => finish(signal.reason);
    signal.addEventListener("abort", aborted, { once: true });
    // Register before playback so a static stream's first frame is sufficient.
    if (typeof video.requestVideoFrameCallback === "function")
      frame = video.requestVideoFrameCallback(ready);
    else video.addEventListener("loadeddata", ready, { once: true });
    video.addEventListener("error", failed, { once: true });
    void video.play().catch(finish);
  });
}

export async function imageToPng(blob: Blob): Promise<Blob> {
  const dimensions = await imageDimensions(blob);
  const size = dimensions && captureSize(dimensions.width, dimensions.height);
  // Known headers let the decoder resize before allocating a full-size bitmap.
  const bitmap = await createImageBitmap(
    blob,
    size
      ? {
          resizeWidth: size.width,
          resizeHeight: size.height,
          resizeQuality: "high",
        }
      : undefined,
  );
  try {
    if (bitmap.width * bitmap.height > 40_000_000)
      throw new Error("Image exceeds the pixel budget");
    return await canvasToPng(drawImage(bitmap, bitmap.width, bitmap.height));
  } finally {
    bitmap.close();
  }
}

function drawImage(
  source: CanvasImageSource,
  width: number,
  height: number,
  encodedBytes = 0,
): HTMLCanvasElement {
  if (!width || !height) throw new Error("Image has no pixels");
  const canvas = document.createElement("canvas");
  const size = captureSize(width, height, 1, encodedBytes);
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function canvasToPng(source: HTMLCanvasElement): Promise<Blob> {
  let canvas = source;
  for (;;) {
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(new Error("PNG encoding failed")),
        "image/png",
      ),
    );
    if (blob.size <= screenshotLimit) return blob;
    canvas = drawImage(canvas, canvas.width, canvas.height, blob.size);
  }
}
