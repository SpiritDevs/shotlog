import {
  type Annotation,
  arrowPoint,
  bounds,
  type Point,
  type Rect,
  smoothPoints,
} from "./model.js";

export function contains(r: Rect, p: Point, padding = 0): boolean {
  return (
    p.x >= r.x - padding &&
    p.y >= r.y - padding &&
    p.x <= r.x + r.width + padding &&
    p.y <= r.y + r.height + padding
  );
}
function distance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
    ),
  );
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
export function hitTest(a: Annotation, p: Point, tolerance = 6): boolean {
  const margin = tolerance + a.style.thickness / 2;
  if (a.kind === "arrow" || "points" in a) {
    const points =
      a.kind === "arrow"
        ? Array.from({ length: 33 }, (_, i) => arrowPoint(a, i / 32))
        : smoothPoints(a.points);
    const width = a.kind === "highlighter" ? a.style.thickness * 4 : 0;
    return points.some(
      (q, i) =>
        distance(p, points[Math.max(0, i - 1)] as Point, q) <= margin + width,
    );
  }
  const b = bounds(a);
  if (a.kind === "oval") {
    const rx = Math.max(1, b.width / 2),
      ry = Math.max(1, b.height / 2);
    return (
      Math.abs(Math.hypot((p.x - b.x - rx) / rx, (p.y - b.y - ry) / ry) - 1) <=
      margin / Math.min(rx, ry)
    );
  }
  if (a.kind === "rectangle")
    return (
      contains(b, p, margin) &&
      !contains(
        {
          x: b.x + margin,
          y: b.y + margin,
          width: b.width - 2 * margin,
          height: b.height - 2 * margin,
        },
        p,
      )
    );
  return contains(b, p, tolerance);
}
export function pick(
  annotations: readonly Annotation[],
  p: Point,
  tolerance = 6,
): Annotation | undefined {
  return [...annotations].reverse().find((a) => hitTest(a, p, tolerance));
}
export interface Handle {
  readonly name: "start" | "end" | "curve" | "nw" | "ne" | "sw" | "se";
  readonly point: Point;
}
export function handles(a: Annotation): readonly Handle[] {
  if (a.kind === "arrow")
    return [
      { name: "start", point: a.start },
      { name: "end", point: a.end },
      { name: "curve", point: arrowPoint(a, 0.5) },
    ];
  const b = bounds(a);
  return [
    { name: "nw", point: b },
    { name: "ne", point: { x: b.x + b.width, y: b.y } },
    { name: "sw", point: { x: b.x, y: b.y + b.height } },
    { name: "se", point: { x: b.x + b.width, y: b.y + b.height } },
  ];
}
export function resize(
  a: Annotation,
  handle: Handle["name"],
  p: Point,
): Annotation {
  if (a.kind === "arrow") {
    if (handle === "curve")
      return {
        ...a,
        control: {
          x: 2 * p.x - (a.start.x + a.end.x) / 2,
          y: 2 * p.y - (a.start.y + a.end.y) / 2,
        },
      };
    if (handle === "start" || handle === "end") return { ...a, [handle]: p };
    return a;
  }
  const b = bounds(a);
  const opposite = {
    x: handle.includes("w") ? b.x + b.width : b.x,
    y: handle.includes("n") ? b.y + b.height : b.y,
  };
  return transform(a, b, {
    x: Math.min(p.x, opposite.x),
    y: Math.min(p.y, opposite.y),
    width: Math.max(1, Math.abs(p.x - opposite.x)),
    height: Math.max(1, Math.abs(p.y - opposite.y)),
  });
}

import { transform } from "./model.js";
