import { describe, expect, it } from "vitest";
import { captureSize, screenshotLimit } from "../../src/client/capture-size.js";

describe("capture size", () => {
  it("uses device pixels without upscaling uploaded images", () => {
    expect(captureSize(800, 600, 2)).toEqual({ width: 1600, height: 1200 });
    expect(captureSize(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("bounds high-DPI allocation while preserving the aspect ratio", () => {
    const size = captureSize(3840, 2160, 3);
    expect(size.width * size.height).toBeLessThanOrEqual(screenshotLimit);
    expect(size.width / size.height).toBeCloseTo(3840 / 2160, 2);
  });

  it("shrinks an oversized PNG according to measured bytes, with headroom", () => {
    expect(captureSize(1600, 1200, 1, screenshotLimit * 4)).toEqual({
      width: 720,
      height: 540,
    });
    expect(captureSize(1600, 1200, 1, screenshotLimit)).toEqual({
      width: 1600,
      height: 1200,
    });
  });

  it("bounds very narrow images without zero-sized canvases", () => {
    expect(captureSize(100_000, 1)).toEqual({ width: 8192, height: 1 });
    expect(captureSize(1, 100_000)).toEqual({ width: 1, height: 8192 });
  });
});
