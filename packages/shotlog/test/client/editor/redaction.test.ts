import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type Pixels,
  redactPixels,
} from "../../../src/client/editor/redaction.js";

function pixels(): Pixels {
  const data = new Uint8ClampedArray(48 * 36 * 4);
  for (let y = 0; y < 36; y++)
    for (let x = 0; x < 48; x++) {
      const i = (y * 48 + x) * 4;
      data.set([x * 5, y * 7, (x + y) * 3, (x + y) % 2 ? 100 : 255], i);
    }
  return { width: 48, height: 36, data };
}
const pixel = (image: Pixels, x: number, y: number) =>
  Array.from(
    image.data.slice((y * image.width + x) * 4, (y * image.width + x + 1) * 4),
  );

beforeEach(() => {
  vi.stubGlobal("crypto", {
    getRandomValues: (bytes: Uint8Array) => {
      bytes.set([0, 12, 24]);
      return bytes;
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("destructive flatten redaction pass", () => {
  it("expands tiny pixelations and merges short trailing blocks", () => {
    const tiny = pixels();
    redactPixels(tiny, { x: 47, y: 35, width: 1, height: 1 }, false);
    for (let y = 20; y < 36; y++)
      for (let x = 32; x < 48; x++)
        expect(pixel(tiny, x, y)).toEqual(pixel(tiny, 32, 20));
    const edge = pixels();
    redactPixels(edge, { x: 0, y: 0, width: 33, height: 33 }, false);
    // A 33px extent becomes 16 + 17, never 16 + 16 + 1.
    expect(pixel(edge, 32, 32)).toEqual(pixel(edge, 16, 16));
    expect(pixel(edge, 16, 16)).not.toEqual(pixel(edge, 0, 0));
  });
  it("uses bounded coarse blocks and fresh per-block noise, overwriting every source pixel", () => {
    for (const [extent, size] of [
      [48, 16],
      [99, 33],
      [300, 64],
    ] as const) {
      const image: Pixels = {
        width: extent,
        height: extent,
        data: new Uint8ClampedArray(extent * extent * 4),
      };
      for (let i = 0; i < image.data.length; i += 4)
        image.data.set([100, 110, 120, 100], i);
      const random = vi.fn((bytes: Uint8Array) => {
        bytes.set(random.mock.calls.length % 2 ? [0, 12, 24] : [24, 0, 12]);
        return bytes;
      });
      vi.stubGlobal("crypto", { getRandomValues: random });
      redactPixels(image, { x: 0, y: 0, width: extent, height: extent }, false);
      expect(pixel(image, 0, 0)).toEqual([88, 110, 132, 255]);
      expect(pixel(image, size - 1, size - 1)).toEqual(pixel(image, 0, 0));
      expect(pixel(image, size, 0)).toEqual([112, 98, 120, 255]);
      for (let y = 0; y < extent; y++)
        for (let x = 0; x < extent; x++) {
          const value = pixel(image, x, y);
          expect(value).not.toEqual([100, 110, 120, 100]);
          expect(value[3]).toBe(255);
        }
      expect(random).toHaveBeenCalledTimes(Math.floor(extent / size) ** 2);
    }
  });
  it("solid redaction erases original RGB and alpha including fractional edges", () => {
    const image = pixels();
    redactPixels(image, { x: 5.8, y: 4.4, width: 8, height: 7 }, true);
    for (let y = 4; y < 12; y++)
      for (let x = 5; x < 14; x++)
        expect(pixel(image, x, y)).toEqual([0, 0, 0, 255]);
    expect(pixel(image, 4, 4)).not.toEqual([0, 0, 0, 255]);
  });
  it("clips redactions to the exported crop without touching other pixels", () => {
    const image = pixels();
    redactPixels(image, { x: -20, y: -10, width: 32, height: 22 }, true);
    expect(pixel(image, 0, 0)).toEqual([0, 0, 0, 255]);
    expect(pixel(image, 11, 11)).toEqual([0, 0, 0, 255]);
    expect(pixel(image, 12, 11)).not.toEqual([0, 0, 0, 255]);
    const before = image.data.slice();
    redactPixels(image, { x: 100, y: 100, width: 12, height: 12 }, true);
    expect(image.data).toEqual(before);
  });
});
