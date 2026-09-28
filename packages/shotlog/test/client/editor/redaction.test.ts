import { describe, expect, it } from "vitest";
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

describe("destructive flatten redaction pass", () => {
  it("expands tiny pixelations and merges short trailing blocks", () => {
    const tiny = pixels();
    redactPixels(tiny, { x: 47, y: 35, width: 1, height: 1 }, false);
    for (let y = 24; y < 36; y++)
      for (let x = 36; x < 48; x++)
        expect(pixel(tiny, x, y)).toEqual(pixel(tiny, 36, 24));
    const edge = pixels();
    redactPixels(edge, { x: 0, y: 0, width: 25, height: 25 }, false);
    // A 25px extent becomes 12 + 13, never 12 + 12 + 1.
    expect(pixel(edge, 24, 24)).toEqual(pixel(edge, 12, 12));
    expect(pixel(edge, 12, 12)).not.toEqual(pixel(edge, 0, 0));
  });
  it("overwrites a minimum 12px block with one opaque sampled colour", () => {
    const image = pixels(),
      before = image.data.slice();
    redactPixels(image, { x: 12, y: 12, width: 24, height: 24 }, false, 2);
    const first = pixel(image, 12, 12);
    expect(first[3]).toBe(255);
    for (let y = 12; y < 24; y++)
      for (let x = 12; x < 24; x++) expect(pixel(image, x, y)).toEqual(first);
    expect(pixel(image, 24, 12)).not.toEqual(first);
    expect(image.data).not.toEqual(before);
    expect(pixel(image, 11, 12)).toEqual(
      pixel({ ...image, data: before }, 11, 12),
    );
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
