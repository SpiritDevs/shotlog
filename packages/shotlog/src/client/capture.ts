import { captureSize, screenshotLimit } from "./capture-size.js";

export const supportsScreenCapture = () =>
  typeof navigator !== "undefined" &&
  typeof navigator.mediaDevices?.getDisplayMedia === "function";

const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** Inline !important also wins over a Host App's aggressive global reset. */
async function withHiddenWidget<T>(
  host: HTMLElement,
  capture: () => Promise<T>,
): Promise<T> {
  const visibility = host.style.getPropertyValue("visibility");
  const priority = host.style.getPropertyPriority("visibility");
  host.style.setProperty("visibility", "hidden", "important");
  try {
    return await capture();
  } finally {
    if (visibility) host.style.setProperty("visibility", visibility, priority);
    else host.style.removeProperty("visibility");
  }
}

export function capturePage(host: HTMLElement): Promise<Blob> {
  return withHiddenWidget(host, async () => {
    await nextFrame();
    const { renderPage } = await import("./page-render.js");
    return canvasToPng(await renderPage(host));
  });
}

export function captureScreen(host: HTMLElement): Promise<Blob | undefined> {
  return withHiddenWidget(host, async () => {
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
    const video = document.createElement("video");
    let canvas: HTMLCanvasElement;
    try {
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await videoFrame(video);
      canvas = drawImage(video, video.videoWidth, video.videoHeight);
    } finally {
      // Release the sharing indicator before PNG encoding or the M4 editor.
      for (const track of stream.getTracks()) track.stop();
      video.pause();
      video.srcObject = null;
    }
    return canvasToPng(canvas);
  });
}

function videoFrame(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    let frame: number | undefined;
    const finish = (error?: unknown) => {
      clearTimeout(timer);
      if (frame !== undefined) video.cancelVideoFrameCallback(frame);
      video.removeEventListener("loadeddata", ready);
      video.removeEventListener("error", failed);
      if (error) reject(error);
      else resolve();
    };
    const ready = () => finish();
    const failed = () => finish(new Error("Screen frame is unavailable"));
    const timer = setTimeout(failed, 10_000);
    // Register before playback so a static stream's first frame is sufficient.
    if (typeof video.requestVideoFrameCallback === "function")
      frame = video.requestVideoFrameCallback(ready);
    else video.addEventListener("loadeddata", ready, { once: true });
    video.addEventListener("error", failed, { once: true });
    void video.play().catch(finish);
  });
}

export async function imageToPng(blob: Blob): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  const image = new Image();
  try {
    image.src = url;
    await image.decode();
    return await canvasToPng(
      drawImage(image, image.naturalWidth, image.naturalHeight),
    );
  } finally {
    URL.revokeObjectURL(url);
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
