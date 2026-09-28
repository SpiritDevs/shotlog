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
  arrowWedge,
  boundCrop,
  bounds,
  commit,
  duplicate,
  emptyScene,
  fontSize,
  historyFor,
  nudge,
  redo,
  remove,
  replace,
  smoothPoints,
  textColorFor,
  textLayout,
  textScaleFor,
  toolAfterDrawing,
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
  it("retains only the newest 100 undo entries, including after redo", () => {
    let history = historyFor(replace(emptyScene(), rectangle));
    for (let x = 1; x <= 125; x++)
      history = commit(
        history,
        replace(history.present, translate(rectangle, x, 0)),
      );
    expect(history.past).toHaveLength(100);
    for (let i = 0; i < 100; i++) history = undo(history);
    expect(bounds(history.present.annotations[0] as Annotation).x).toBe(45);
    expect(undo(history)).toBe(history);
    for (let i = 0; i < 100; i++) history = redo(history);
    expect(history.past).toHaveLength(100);
    expect(bounds(history.present.annotations[0] as Annotation).x).toBe(145);
  });
  it("coalesces rapid nudges of the same selection but separates pauses, selections and edits", () => {
    const initial = replace(replace(emptyScene(), rectangle), arrow);
    let history = nudge(historyFor(initial), rectangle.id, 1, 0, 0);
    history = nudge(history, rectangle.id, 10, 0, 100);
    history = nudge(history, rectangle.id, 0, -1, 600);
    expect(history.past).toHaveLength(1);
    expect(bounds(history.present.annotations[0] as Annotation).x).toBe(31);
    expect(undo(history).present).toBe(initial);
    expect(redo(undo(history)).present).toBe(history.present);
    history = nudge(history, rectangle.id, 1, 0, 1101);
    expect(history.past).toHaveLength(2);
    history = nudge(history, arrow.id, 1, 0, 1102);
    expect(history.past).toHaveLength(3);
    history = commit(history, { ...history.present, crop: rectangle.rect });
    history = nudge(history, arrow.id, 1, 0, 1103);
    expect(history.past).toHaveLength(5);
    history = nudge(undo(history), arrow.id, 1, 0, 1104);
    expect(history.past).toHaveLength(5);
    expect(history.future).toEqual([]);
  });
  it("moves a text pill without resizing it, and offers it no handles", () => {
    const text: Annotation = {
      id: "text",
      kind: "text",
      style,
      position: { x: 10, y: 10 },
      text: "Example",
      width: 100,
      height: 30,
    };
    expect(bounds(translate(text, 5, 5))).toEqual({
      x: 15,
      y: 15,
      width: 100,
      height: 30,
    });
    expect(handles(text)).toEqual([]);
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

describe("finishing a shape", () => {
  it("returns to Select unless ⌘ or Shift keeps the tool, and never touches Crop", () => {
    const none = { metaKey: false, shiftKey: false };
    expect(toolAfterDrawing("arrow", none)).toBe("select");
    expect(toolAfterDrawing("text", none)).toBe("select");
    expect(toolAfterDrawing("arrow", { ...none, metaKey: true })).toBe("arrow");
    expect(toolAfterDrawing("redact", { ...none, shiftKey: true })).toBe(
      "redact",
    );
    expect(toolAfterDrawing("crop", none)).toBe("crop");
    expect(toolAfterDrawing("select", none)).toBe("select");
  });
});

describe("arrow wedge", () => {
  const width = (polygon: readonly { x: number; y: number }[], x: number) => {
    const ys = polygon.filter((p) => Math.abs(p.x - x) < 3).map((p) => p.y);
    return Math.max(...ys) - Math.min(...ys);
  };
  it("is one closed polygon whose head is wider than its shaft and tail", () => {
    const straight: Annotation = {
      ...arrow,
      control: { x: 60, y: 10 },
    };
    const wedge = arrowWedge(straight);
    expect(wedge.length).toBeGreaterThan(6);
    expect(wedge[0]).toEqual(wedge.at(-1));
    expect(wedge).toContainEqual(straight.end);
    const tail = width(wedge, 10),
      shaft = width(wedge, 60),
      head = width(wedge, 110 - 36);
    expect(tail).toBeLessThan(shaft);
    expect(shaft).toBeLessThan(head);
    expect(head).toBeCloseTo(36);
    expect(
      Math.max(
        ...arrowWedge({ ...straight, style: { ...style, thickness: 6 } }).map(
          (p) => p.y,
        ),
      ),
    ).toBeGreaterThan(Math.max(...wedge.map((p) => p.y)));
  });
  it("follows the curve and vanishes for a zero-length arrow", () => {
    const wedge = arrowWedge(arrow);
    const middle = arrowPoint(arrow, 0.5);
    expect(
      wedge.some((p) => Math.hypot(p.x - middle.x, p.y - middle.y) < 6),
    ).toBe(true);
    expect(
      arrowWedge({ ...arrow, end: arrow.start, control: arrow.start }),
    ).toEqual([]);
  });
});

describe("text pill", () => {
  const measure = (line: string) => line.length * 7;
  it("fits its content, growing with the text and with each line", () => {
    const short = textLayout("Hi", 24, measure),
      long = textLayout("Hi there", 24, measure);
    expect(long.width).toBeGreaterThan(short.width);
    expect(long.width - short.width).toBe(6 * 7);
    expect(short.width).toBe(2 * 7 + short.paddingX * 2);
    expect(textLayout("a\nb", 24, measure).height).toBe(
      short.height + short.lineHeight,
    );
    expect(textLayout("", 24, measure).width).toBeGreaterThan(0);
  });
  it("uses dark text on light colours", () => {
    expect(textColorFor("#facc15")).toBe("#18181b");
    expect(textColorFor("#ffffff")).toBe("#18181b");
    expect(textColorFor("#ef4444")).toBe("#ffffff");
    expect(textColorFor("#18181b")).toBe("#ffffff");
  });
});

describe("hit testing", () => {
  it("uses outline distance and padded bounds for eccentric ovals", () => {
    const oval: Annotation = {
      ...rectangle,
      kind: "oval",
      rect: { x: 0, y: 0, width: 1000, height: 20 },
    };
    expect(hitTest(oval, { x: 1300, y: 10 })).toBe(false);
    expect(hitTest(oval, { x: 1007, y: 10 })).toBe(true);
    expect(hitTest(oval, { x: 1008, y: 10 })).toBe(false);
    expect(hitTest(oval, { x: 500, y: 10 })).toBe(false);
    expect(hitTest(oval, { x: 500, y: -7 })).toBe(true);
    expect(hitTest(oval, { x: 998, y: 0 })).toBe(false);
    expect(hitTest(oval, { x: 998, y: 5 })).toBe(true);
    expect(
      hitTest(
        { ...oval, rect: { x: 0, y: 0, width: 20, height: 1000 } },
        { x: 10, y: 1300 },
      ),
    ).toBe(false);
  });
  it("picks the curved wedge instead of its empty bounding box", () => {
    expect(hitTest(arrow, { x: 60, y: 60 })).toBe(true);
    expect(hitTest(arrow, { x: 60, y: 100 })).toBe(false);
    expect(hitTest(arrow, { x: 60, y: 10 })).toBe(false);
    // The head is wider than the tail, so a point beside the shaft near the end still hits.
    const straight: Annotation = { ...arrow, control: { x: 60, y: 10 } };
    expect(hitTest(straight, { x: 80, y: 20 }, 0)).toBe(true);
    expect(hitTest(straight, { x: 30, y: 20 }, 0)).toBe(false);
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

it("text sizes grow Small < Medium < Large and scale with the screenshot's resolution", () => {
  const style = { color: "#ef4444", rounded: false, solid: false };
  const [small, medium, large] = [1.5, 3, 6].map((thickness) =>
    fontSize({ ...style, thickness, textScale: textScaleFor(2560) }),
  );
  expect(small).toBeLessThan(medium as number);
  expect(medium).toBeLessThan(large as number);
  expect(
    fontSize({ ...style, thickness: 3, textScale: textScaleFor(1280) }),
  ).toBe((medium as number) / 2);
  expect(textScaleFor(400)).toBe(1);
});
