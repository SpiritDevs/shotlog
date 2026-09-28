import { describe, expect, it } from "vitest";
import {
  handles,
  hitTest,
  pick,
  resize,
} from "../../../src/client/editor/hit-test.js";
import {
  type Annotation,
  arrowPoint,
  boundCrop,
  bounds,
  commit,
  duplicate,
  emptyScene,
  fontSize,
  historyFor,
  redo,
  remove,
  replace,
  smoothPoints,
  translate,
  undo,
} from "../../../src/client/editor/model.js";

const style = { color: "#ef4444", thickness: 3, rounded: false, solid: false };
const rectangle: Annotation = {
  id: "rect",
  kind: "rectangle",
  style,
  rect: { x: 20, y: 30, width: 100, height: 60 },
};
const arrow: Annotation = {
  id: "arrow",
  kind: "arrow",
  style,
  start: { x: 10, y: 10 },
  end: { x: 110, y: 10 },
  control: { x: 60, y: 110 },
};
const step = (id: string): Annotation => ({
  id,
  kind: "step",
  style,
  position: { x: 30, y: 30 },
  number: 99,
});

describe("editable scene", () => {
  it("resizes text glyphs when only the horizontal handle coordinate changes", () => {
    const text: Annotation = {
      id: "text",
      kind: "text",
      style,
      position: { x: 10, y: 10 },
      text: "Example",
      width: 100,
      height: 30,
    };
    const resized = resize(text, "se", { x: 210, y: 40 });
    expect(fontSize(resized.style)).toBe(fontSize(style) * 2);
    expect(bounds(resized)).toEqual({ x: 10, y: 10, width: 200, height: 60 });
  });
  it("moves annotations without mutating the original scene or shared style", () => {
    const scene = replace(emptyScene(), rectangle);
    const next = replace(scene, translate(rectangle, 10, -5));
    expect(bounds(scene.annotations[0] as Annotation)).toEqual(rectangle.rect);
    expect(bounds(next.annotations[0] as Annotation)).toEqual({
      x: 30,
      y: 25,
      width: 100,
      height: 60,
    });
    expect(rectangle.style).toEqual(style);
  });
  it("duplicates at +10px with a new identity and renumbers deleted steps", () => {
    let scene = replace(replace(emptyScene(), step("first")), step("second"));
    scene = duplicate(scene, scene.annotations[0] as Annotation, "third");
    expect(scene.annotations.map((a) => a.kind === "step" && a.number)).toEqual(
      [1, 2, 3],
    );
    expect(
      bounds(scene.annotations[2] as Annotation).x -
        bounds(scene.annotations[0] as Annotation).x,
    ).toBe(10);
    expect(
      remove(scene, "second").annotations.map(
        (a) => a.kind === "step" && a.number,
      ),
    ).toEqual([1, 2]);
  });
  it("undoes and redoes crops and clears the redo branch on a new edit", () => {
    const initial = replace(emptyScene(), rectangle);
    const cropped = {
      ...initial,
      crop: { x: 20, y: 20, width: 200, height: 100 },
    };
    const history = commit(historyFor(initial), cropped);
    expect(undo(history).present).toBe(initial);
    expect(redo(undo(history)).present).toBe(cropped);
    const branch = commit(undo(history), remove(initial, rectangle.id));
    expect(branch.future).toEqual([]);
    expect(redo(branch)).toBe(branch);
    expect(commit(history, { ...cropped })).toBe(history);
  });
  it("clamps fractional crop edges to integer image pixels", () => {
    expect(
      boundCrop({ x: -10, y: 4.7, width: 200, height: 200 }, 100, 80),
    ).toEqual({ x: 0, y: 4, width: 100, height: 76 });
    expect(
      boundCrop({ x: 99.9, y: 79.9, width: 0, height: 0 }, 100, 80),
    ).toEqual({ x: 99, y: 79, width: 1, height: 1 });
  });
  it("resizes from the fixed opposite corner, including crossed corners", () => {
    expect(bounds(resize(rectangle, "nw", { x: 140, y: 110 }))).toEqual({
      x: 120,
      y: 90,
      width: 20,
      height: 20,
    });
    const moved = translate(arrow, 10, 20);
    expect(moved.kind === "arrow" && moved.control).toEqual({ x: 70, y: 130 });
  });
  it("puts the curve through the dragged midpoint and preserves endpoint editing", () => {
    const curved = resize(arrow, "curve", { x: 60, y: 90 });
    expect(curved.kind === "arrow" && arrowPoint(curved, 0.5)).toEqual({
      x: 60,
      y: 90,
    });
    expect(handles(curved)[2]?.point).toEqual({ x: 60, y: 90 });
    const end = resize(curved, "end", { x: 130, y: 20 });
    expect(end.kind === "arrow" && end.end).toEqual({ x: 130, y: 20 });
  });
});

describe("hit testing", () => {
  it("picks the curved stroke instead of its empty bounding box", () => {
    expect(hitTest(arrow, { x: 60, y: 60 })).toBe(true);
    expect(hitTest(arrow, { x: 60, y: 100 })).toBe(false);
    expect(hitTest(arrow, { x: 60, y: 10 })).toBe(false);
  });
  it("picks outline edges, not empty rectangle and oval interiors", () => {
    expect(hitTest(rectangle, { x: 20, y: 60 })).toBe(true);
    expect(hitTest(rectangle, { x: 70, y: 60 })).toBe(false);
    const oval: Annotation = { ...rectangle, kind: "oval" };
    expect(hitTest(oval, { x: 70, y: 30 })).toBe(true);
    expect(hitTest(oval, { x: 70, y: 60 })).toBe(false);
    expect(hitTest(oval, { x: 20, y: 30 })).toBe(false);
  });
  it("picks the topmost filled annotation and includes highlighter width", () => {
    const redact: Annotation = { ...rectangle, id: "redact", kind: "redact" };
    expect(pick([rectangle, redact], { x: 20, y: 40 })?.id).toBe("redact");
    const highlight: Annotation = {
      id: "highlight",
      kind: "highlighter",
      style,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    };
    expect(hitTest(highlight, { x: 50, y: 10 }, 0)).toBe(true);
    expect(
      hitTest({ ...highlight, kind: "freehand" }, { x: 50, y: 10 }, 0),
    ).toBe(false);
  });
  it("smooths freehand points with stable endpoints for rendering and picking", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 20, y: 30 },
      { x: 40, y: 0 },
      { x: 60, y: 30 },
    ];
    const smoothed = smoothPoints(points);
    expect(smoothed[0]).toEqual(points[0]);
    expect(smoothed.at(-1)).toEqual(points.at(-1));
    expect(smoothed.length).toBeGreaterThan(points.length);
    expect(points).toHaveLength(4);
    expect(
      hitTest(
        { id: "path", kind: "freehand", style, points },
        smoothed[4] as { x: number; y: number },
        0,
      ),
    ).toBe(true);
  });
});
