import { afterEach, expect, test, vi } from "vitest";
import {
  capturePage,
  captureScreen,
  imageToPng,
} from "../../src/client/capture.js";

const renderer = vi.hoisted(() => {
  let load = () => {};
  const imported = new Promise<void>((resolve) => {
    load = resolve;
  });
  return { load, imported, render: vi.fn() };
});
vi.mock("../../src/client/page-render.js", async () => {
  await renderer.imported;
  return { renderPage: renderer.render };
});

function host() {
  const values = new Map([["visibility", ["visible", "important"]]]);
  return {
    style: {
      getPropertyValue: (key: string) => values.get(key)?.[0] ?? "",
      getPropertyPriority: (key: string) => values.get(key)?.[1] ?? "",
      setProperty: (key: string, value: string, priority: string) =>
        values.set(key, [value, priority]),
      removeProperty: (key: string) => values.delete(key),
    },
  } as unknown as HTMLElement;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("the 15 second deadline covers a stalled import and ignores its late result", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    callback(0),
  );
  const widget = host();
  const result = capturePage(widget);
  const rejected = expect(result).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(14_999);
  expect(widget.style.getPropertyValue("visibility")).toBe("hidden");
  await vi.advanceTimersByTimeAsync(1);
  await rejected;
  expect(widget.style.getPropertyValue("visibility")).toBe("visible");
  expect(widget.style.getPropertyPriority("visibility")).toBe("important");
  renderer.load();
  await vi.dynamicImportSettled();
  expect(renderer.render).not.toHaveBeenCalled();
});

test("screen capture waits for the picker, then times out a stalled frame and releases the stream", async () => {
  vi.useFakeTimers();
  let grant: (stream: MediaStream) => void = () => {};
  const stop = vi.fn();
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getDisplayMedia: () =>
        new Promise<MediaStream>((resolve) => {
          grant = resolve;
        }),
    },
  });
  // A video element whose first frame never arrives.
  vi.stubGlobal("document", {
    createElement: () => ({
      pause: () => {},
      play: () => Promise.resolve(),
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
  const widget = host();
  const result = expect(captureScreen(widget)).rejects.toThrow("timed out");
  // Time in the browser's picker doesn't count against the deadline.
  await vi.advanceTimersByTimeAsync(60_000);
  expect(widget.style.getPropertyValue("visibility")).toBe("hidden");
  grant({ getTracks: () => [{ stop }] } as unknown as MediaStream);
  await vi.advanceTimersByTimeAsync(15_000);
  await result;
  expect(stop).toHaveBeenCalledOnce();
  expect(widget.style.getPropertyValue("visibility")).toBe("visible");
});

test("oversized known image headers resize at decode; unknown oversized bitmaps are closed and rejected", async () => {
  const headers: Uint8Array[] = [];
  const png = new Uint8Array(30),
    pngView = new DataView(png.buffer);
  png.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  png.set(new TextEncoder().encode("IHDR"), 12);
  pngView.setUint32(16, 10_000);
  pngView.setUint32(20, 5000);
  headers.push(png);
  // APP metadata must be skipped before the progressive SOF header.
  const jpeg = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe1, 0, 4, 0, 0, 0xff, 0xc2, 0, 8, 8, 0x13, 0x88, 0x27,
    0x10, 1,
  ]);
  headers.push(jpeg);
  const gif = new Uint8Array(10),
    gifView = new DataView(gif.buffer);
  gif.set(new TextEncoder().encode("GIF89a"));
  gifView.setUint16(6, 10_000, true);
  gifView.setUint16(8, 5000, true);
  headers.push(gif);
  for (const kind of ["VP8X", "VP8 ", "VP8L"]) {
    const webp = new Uint8Array(30),
      view = new DataView(webp.buffer);
    webp.set(new TextEncoder().encode("RIFF"));
    webp.set(new TextEncoder().encode(`WEBP${kind}`), 8);
    if (kind === "VP8X") {
      view.setUint32(24, 9999, true);
      webp[27] = 4999 & 255;
      webp[28] = 4999 >> 8;
    } else if (kind === "VP8 ") {
      webp.set([0x9d, 1, 0x2a], 23);
      view.setUint16(26, 10_000, true);
      view.setUint16(28, 5000, true);
    } else {
      webp[20] = 0x2f;
      view.setUint32(21, (4999 << 14) | 9999, true);
    }
    headers.push(webp);
  }
  const close = vi.fn(),
    drawImage = vi.fn();
  const output = new Blob(["png"]);
  const decode = vi.fn(async (_blob: Blob, options?: ImageBitmapOptions) => ({
    width: options?.resizeWidth ?? 10_000,
    height: options?.resizeHeight ?? 5000,
    close,
  }));
  vi.stubGlobal("createImageBitmap", decode);
  vi.stubGlobal("document", {
    createElement: () => ({
      getContext: () => ({ drawImage }),
      toBlob: (callback: BlobCallback) => callback(output),
    }),
  });
  for (const header of headers) {
    const input = new Blob([new Uint8Array(header)]);
    expect(await imageToPng(input)).toBe(output);
    expect(decode).toHaveBeenLastCalledWith(input, {
      resizeWidth: 2896,
      resizeHeight: 1448,
      resizeQuality: "high",
    });
  }
  await expect(imageToPng(new Blob(["unknown format"]))).rejects.toThrow(
    "pixel budget",
  );
  expect(drawImage).toHaveBeenCalledTimes(headers.length);
  expect(close).toHaveBeenCalledTimes(headers.length + 1);
});
