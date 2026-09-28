import type { Rect } from "./model.js";

export interface Pixels {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}
/** Overwrite RGB and alpha, never composite a translucent mask. Blocks are output pixels. */
export function redactPixels(
  image: Pixels,
  rect: Rect,
  solid: boolean,
  blockSize = 12,
): void {
  const size = Math.max(12, Math.ceil(blockSize));
  let x0 = Math.max(0, Math.floor(rect.x)),
    y0 = Math.max(0, Math.floor(rect.y));
  let x1 = Math.min(image.width, Math.ceil(rect.x + rect.width)),
    y1 = Math.min(image.height, Math.ceil(rect.y + rect.height));
  if (x1 <= x0 || y1 <= y0) return;
  if (!solid) {
    // A tiny selection must not leave a one-pixel "block" of original data.
    x0 = Math.min(x0, Math.max(0, image.width - size));
    y0 = Math.min(y0, Math.max(0, image.height - size));
    x1 = Math.min(image.width, Math.max(x1, x0 + size));
    y1 = Math.min(image.height, Math.max(y1, y0 + size));
  }
  for (let y = y0; y < y1; ) {
    const bottom = y1 - y < size * 2 ? y1 : y + size;
    for (let x = x0; x < x1; ) {
      // Merge short edge remainders into the preceding coarse block.
      const right = x1 - x < size * 2 ? x1 : x + size;
      let r = 0,
        g = 0,
        b = 0,
        count = 0;
      if (!solid) {
        for (let py = y; py < bottom; py++)
          for (let px = x; px < right; px++) {
            const i = (py * image.width + px) * 4;
            r += image.data[i] ?? 0;
            g += image.data[i + 1] ?? 0;
            b += image.data[i + 2] ?? 0;
            count++;
          }
      }
      for (let py = y; py < bottom; py++)
        for (let px = x; px < right; px++) {
          const i = (py * image.width + px) * 4;
          image.data[i] = count ? r / count : 0;
          image.data[i + 1] = count ? g / count : 0;
          image.data[i + 2] = count ? b / count : 0;
          image.data[i + 3] = 255;
        }
      x = right;
    }
    y = bottom;
  }
}
