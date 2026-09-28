import { describe, expect, it } from "vitest";
import {
  clampSize,
  dragSize,
  growthDirection,
  keySize,
  resizeCorner,
} from "../../src/client/card-size.js";

const limits = {
  min: { width: 384, height: 420 },
  max: { width: 1232, height: 852 },
};
const start = { width: 400, height: 500 };

describe("card resizing", () => {
  it("puts the handle opposite the anchor, on the bottom or right for centred axes", () => {
    expect(resizeCorner("bottom-right")).toBe("top-left");
    expect(resizeCorner("bottom-left")).toBe("top-right");
    expect(resizeCorner("top-right")).toBe("bottom-left");
    expect(resizeCorner("top-left")).toBe("bottom-right");
    expect(resizeCorner("top-center")).toBe("bottom-right");
    expect(resizeCorner("bottom-center")).toBe("top-right");
    expect(resizeCorner("center")).toBe("bottom-right");
  });
  it("grows away from the anchor, freely on either axis", () => {
    expect(growthDirection("bottom-right")).toEqual({ x: -1, y: -1 });
    expect(growthDirection("top-left")).toEqual({ x: 1, y: 1 });
    expect(dragSize("bottom-right", start, { x: -50, y: 0 }, limits)).toEqual({
      width: 450,
      height: 500,
    });
    expect(dragSize("bottom-right", start, { x: 0, y: -30 }, limits)).toEqual({
      width: 400,
      height: 530,
    });
    expect(dragSize("top-left", start, { x: 50, y: 30 }, limits)).toEqual({
      width: 450,
      height: 530,
    });
    expect(dragSize("bottom-left", start, { x: 20, y: 20 }, limits)).toEqual({
      width: 420,
      height: 480,
    });
  });
  it("grows a centred axis on both sides and keeps the anchored edge still", () => {
    expect(dragSize("top-center", start, { x: 25, y: 40 }, limits)).toEqual({
      width: 450,
      height: 540,
    });
    expect(dragSize("bottom-center", start, { x: 25, y: -40 }, limits)).toEqual(
      { width: 450, height: 540 },
    );
    expect(dragSize("center", start, { x: 25, y: 40 }, limits)).toEqual({
      width: 450,
      height: 580,
    });
  });
  it("never shrinks below the default size or grows past the viewport", () => {
    expect(clampSize({ width: 100, height: 9000 }, limits)).toEqual({
      width: 384,
      height: 852,
    });
    expect(dragSize("top-left", start, { x: -999, y: 999 }, limits)).toEqual({
      width: 384,
      height: 852,
    });
    // A viewport smaller than the default keeps the default; CSS caps the visible box.
    expect(
      clampSize(start, { ...limits, max: { width: 300, height: 300 } }),
    ).toEqual({ width: 384, height: 420 });
  });
  it("maps arrow keys to the handle's growth directions", () => {
    expect(keySize("bottom-right", start, "ArrowLeft", 16, limits)).toEqual({
      width: 416,
      height: 500,
    });
    expect(keySize("bottom-right", start, "ArrowRight", 64, limits)).toEqual({
      width: 384,
      height: 500,
    });
    expect(keySize("bottom-right", start, "ArrowUp", 16, limits)).toEqual({
      width: 400,
      height: 516,
    });
    expect(keySize("top-center", start, "ArrowRight", 16, limits)).toEqual({
      width: 416,
      height: 500,
    });
    expect(keySize("bottom-center", start, "ArrowUp", 16, limits)).toEqual({
      width: 400,
      height: 516,
    });
    expect(keySize("center", start, "Enter", 16, limits)).toBeNull();
  });
});
