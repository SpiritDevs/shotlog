import { afterEach, expect, it, vi } from "vitest";
import type { Scene } from "../../../src/client/editor/model.js";
import { renderScene } from "../../../src/client/editor/render.js";

interface Raster {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

// A small software canvas with a tent resampling filter. Its neighbouring-pixel
// reads exercise renderScene's ordering without a native canvas dependency.
function canvas() {
  const raster: Raster = { width: 0, height: 0, data: new Uint8ClampedArray() };
  const context = {
    save() {},
    restore() {},
    beginPath() {},
    scale() {},
    translate() {},
    getImageData: () => ({ ...raster, data: raster.data.slice() }),
    putImageData: (image: Raster) => {
      raster.data = image.data.slice();
    },
    drawImage(source: Raster, ...args: number[]) {
      if (args.length === 2) {
        raster.data = source.data.slice();
        return;
      }
      const [left = 0, top = 0, width = source.width, height = source.height] =
        args;
      const scaleX = width / raster.width,
        scaleY = height / raster.height;
      const radiusX = Math.max(1, scaleX),
        radiusY = Math.max(1, scaleY);
      raster.data = new Uint8ClampedArray(raster.width * raster.height * 4);
      for (let y = 0; y < raster.height; y++)
        for (let x = 0; x < raster.width; x++) {
          const cx = left + (x + 0.5) * scaleX,
            cy = top + (y + 0.5) * scaleY;
          const channels = [0, 0, 0, 0];
          let total = 0;
          for (
            let py = Math.max(0, Math.floor(cy - radiusY));
            py < Math.min(source.height, Math.ceil(cy + radiusY));
            py++
          )
            for (
              let px = Math.max(0, Math.floor(cx - radiusX));
              px < Math.min(source.width, Math.ceil(cx + radiusX));
              px++
            ) {
              const weight =
                Math.max(0, 1 - Math.abs(px + 0.5 - cx) / radiusX) *
                Math.max(0, 1 - Math.abs(py + 0.5 - cy) / radiusY);
              total += weight;
              for (let c = 0; c < 4; c++)
                channels[c] =
                  (channels[c] ?? 0) +
                  (source.data[(py * source.width + px) * 4 + c] ?? 0) * weight;
            }
          raster.data.set(
            channels.map((value) => value / total),
            (y * raster.width + x) * 4,
          );
        }
    },
  };
  return Object.assign(raster, { getContext: () => context });
}

afterEach(() => vi.unstubAllGlobals());

it("redacts source pixels before resampling so masked colours cannot affect any output pixel", () => {
  vi.stubGlobal("document", { createElement: canvas });
  const source = (secret: readonly number[]) => {
    const data = new Uint8ClampedArray(100 * 100 * 4).fill(255);
    for (let y = 20; y < 50; y++)
      for (let x = 30; x < 50; x++) data.set(secret, (y * 100 + x) * 4);
    return {
      width: 100,
      height: 100,
      naturalWidth: 100,
      naturalHeight: 100,
      data,
    } as unknown as HTMLImageElement;
  };
  const scene: Scene = {
    crop: null,
    annotations: [
      {
        id: "mask",
        kind: "redact",
        rect: { x: 30, y: 20, width: 20, height: 30 },
        style: { color: "#000000", thickness: 3, solid: true, rounded: false },
      },
    ],
  };
  const red = source([255, 0, 0, 255]),
    blue = source([0, 0, 255, 255]);
  const pixels = (image: HTMLImageElement, value: Scene) =>
    renderScene(image, value, 24, 24)
      .getContext("2d")
      ?.getImageData(0, 0, 24, 24).data;
  // Ensure this filter reproduces colour bleeding outside the output mask (x >= 7).
  const outside = (4 * 24 + 6) * 4;
  expect(
    pixels(red, { ...scene, annotations: [] })?.slice(outside, outside + 4),
  ).not.toEqual(
    pixels(blue, { ...scene, annotations: [] })?.slice(outside, outside + 4),
  );
  expect(pixels(red, scene)).toEqual(pixels(blue, scene));
  expect(
    pixels(red, { ...scene, crop: { x: 2, y: 4, width: 83, height: 90 } }),
  ).toEqual(
    pixels(blue, { ...scene, crop: { x: 2, y: 4, width: 83, height: 90 } }),
  );
});
