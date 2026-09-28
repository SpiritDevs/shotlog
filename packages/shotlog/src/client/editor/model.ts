export type Tool =
  | "select"
  | "arrow"
  | "rectangle"
  | "oval"
  | "text"
  | "freehand"
  | "highlighter"
  | "step"
  | "spotlight"
  | "redact"
  | "crop";
export interface Point {
  readonly x: number;
  readonly y: number;
}
export interface Rect extends Point {
  readonly width: number;
  readonly height: number;
}
export interface Style {
  readonly color: string;
  readonly thickness: number;
  readonly rounded: boolean;
  readonly solid: boolean;
}
interface Base {
  readonly id: string;
  readonly style: Style;
}
export type Annotation = Base &
  (
    | {
        readonly kind: "arrow";
        readonly start: Point;
        readonly end: Point;
        readonly control: Point;
      }
    | {
        readonly kind: "rectangle" | "oval" | "spotlight" | "redact";
        readonly rect: Rect;
      }
    | {
        readonly kind: "freehand" | "highlighter";
        readonly points: readonly Point[];
      }
    | {
        readonly kind: "text";
        readonly position: Point;
        readonly text: string;
        readonly width: number;
        readonly height: number;
      }
    | {
        readonly kind: "step";
        readonly position: Point;
        readonly number: number;
      }
  );
export interface Scene {
  readonly annotations: readonly Annotation[];
  readonly crop: Rect | null;
}
export interface History {
  readonly past: readonly Scene[];
  readonly present: Scene;
  readonly future: readonly Scene[];
  readonly nudge?: { readonly id: string; readonly time: number };
}
const historyLimit = 100;
export const emptyScene = (): Scene => ({ annotations: [], crop: null });
export const historyFor = (scene: Scene): History => ({
  past: [],
  present: scene,
  future: [],
});
export function commit(history: History, scene: Scene): History {
  if (JSON.stringify(scene) === JSON.stringify(history.present)) return history;
  return {
    past: [...history.past, history.present].slice(-historyLimit),
    present: scene,
    future: [],
  };
}
export function undo(history: History): History {
  const previous = history.past.at(-1);
  return previous
    ? {
        past: history.past.slice(0, -1),
        present: previous,
        future: [history.present, ...history.future],
      }
    : history;
}
export function redo(history: History): History {
  const next = history.future[0];
  return next
    ? {
        past: [...history.past, history.present].slice(-historyLimit),
        present: next,
        future: history.future.slice(1),
      }
    : history;
}
export function renumber(
  annotations: readonly Annotation[],
): readonly Annotation[] {
  let number = 0;
  return annotations.map((a) =>
    a.kind === "step" ? { ...a, number: ++number } : a,
  );
}
export function remove(scene: Scene, id: string): Scene {
  return {
    ...scene,
    annotations: renumber(scene.annotations.filter((a) => a.id !== id)),
  };
}
export function replace(scene: Scene, annotation: Annotation): Scene {
  return {
    ...scene,
    annotations: renumber(
      scene.annotations.some((a) => a.id === annotation.id)
        ? scene.annotations.map((a) =>
            a.id === annotation.id ? annotation : a,
          )
        : [...scene.annotations, annotation],
    ),
  };
}
export function rectBetween(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}
export function boundCrop(rect: Rect, width: number, height: number): Rect {
  const x = Math.max(0, Math.min(width - 1, Math.floor(rect.x)));
  const y = Math.max(0, Math.min(height - 1, Math.floor(rect.y)));
  return {
    x,
    y,
    width: Math.max(1, Math.min(width - x, Math.ceil(rect.x + rect.width) - x)),
    height: Math.max(
      1,
      Math.min(height - y, Math.ceil(rect.y + rect.height) - y),
    ),
  };
}
export const midpoint = (a: Point, b: Point): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});
export function arrowPoint(
  a: Extract<Annotation, { kind: "arrow" }>,
  t: number,
): Point {
  const s = 1 - t;
  return {
    x: s * s * a.start.x + 2 * s * t * a.control.x + t * t * a.end.x,
    y: s * s * a.start.y + 2 * s * t * a.control.y + t * t * a.end.y,
  };
}
export function bounds(a: Annotation): Rect {
  if ("rect" in a) return a.rect;
  if (a.kind === "text")
    return { ...a.position, width: a.width, height: a.height };
  if (a.kind === "step") {
    const r = 12 + a.style.thickness * 2;
    return {
      x: a.position.x - r,
      y: a.position.y - r,
      width: r * 2,
      height: r * 2,
    };
  }
  const points = a.kind === "arrow" ? [a.start, a.control, a.end] : a.points;
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}
export function transform(a: Annotation, from: Rect, to: Rect): Annotation {
  const sx = from.width ? to.width / from.width : 1,
    sy = from.height ? to.height / from.height : 1;
  const point = (p: Point): Point => ({
    x: to.x + (p.x - from.x) * sx,
    y: to.y + (p.y - from.y) * sy,
  });
  if ("rect" in a) return { ...a, rect: to };
  if (a.kind === "arrow")
    return {
      ...a,
      start: point(a.start),
      end: point(a.end),
      control: point(a.control),
    };
  if (a.kind === "text")
    // A pill is sized by its text and font, never by a handle.
    return { ...a, position: point(a.position) };
  if (a.kind === "step")
    return {
      ...a,
      position: point(a.position),
      style: {
        ...a.style,
        thickness: Math.max(
          0.5,
          ((12 + a.style.thickness * 2) * Math.min(sx, sy) - 12) / 2,
        ),
      },
    };
  return { ...a, points: a.points.map(point) };
}
export function translate(a: Annotation, dx: number, dy: number): Annotation {
  const b = bounds(a);
  return transform(a, b, { ...b, x: b.x + dx, y: b.y + dy });
}
export function nudge(
  history: History,
  id: string,
  dx: number,
  dy: number,
  time: number,
): History {
  const annotation = history.present.annotations.find((a) => a.id === id);
  if (!annotation) return history;
  const next = commit(
    history,
    replace(history.present, translate(annotation, dx, dy)),
  );
  const coalesce =
    history.nudge?.id === id &&
    time >= history.nudge.time &&
    time - history.nudge.time <= 500;
  return {
    ...next,
    past: coalesce ? history.past : next.past,
    nudge: { id, time },
  };
}
export function duplicate(
  scene: Scene,
  annotation: Annotation,
  id: string,
  offset = 10,
): Scene {
  return replace(scene, { ...translate(annotation, offset, offset), id });
}
export const fontSize = (style: Style) => 12 + style.thickness * 4;
export type ArrowMark = Extract<Annotation, { kind: "arrow" }>;
/** Widths of the tapered wedge, all scaled by the thickness setting. */
export function arrowWeights(style: Style) {
  const t = style.thickness;
  return { tail: t, shaft: t * 4, head: t * 12, headLength: t * 12 };
}
/**
 * The arrow as one closed polygon: a tail that widens along the (possibly curved)
 * shaft into a solid triangular head. The last point repeats the first.
 */
export function arrowWedge(a: ArrowMark): readonly Point[] {
  const samples = 48;
  const points = Array.from({ length: samples + 1 }, (_, i) =>
    arrowPoint(a, i / samples),
  );
  const lengths = [0];
  for (let i = 1; i <= samples; i++) {
    const p = points[i] as Point,
      q = points[i - 1] as Point;
    lengths.push((lengths[i - 1] as number) + Math.hypot(p.x - q.x, p.y - q.y));
  }
  const total = lengths[samples] as number;
  if (total < 1) return [];
  const w = arrowWeights(a.style);
  // Short arrows keep a proportional head instead of becoming all head.
  const headLength = Math.min(w.headLength, total / 2);
  const headWidth = (w.head * headLength) / w.headLength;
  const shaftEnd = total - headLength;
  const normal = (i: number): Point => {
    const prev = points[Math.max(0, i - 1)] as Point,
      next = points[Math.min(samples, i + 1)] as Point;
    const length = Math.hypot(next.x - prev.x, next.y - prev.y) || 1;
    return { x: -(next.y - prev.y) / length, y: (next.x - prev.x) / length };
  };
  const offset = (p: Point, n: Point, d: number): Point => ({
    x: p.x + n.x * d,
    y: p.y + n.y * d,
  });
  const left: Point[] = [],
    right: Point[] = [];
  let i = 0;
  for (; i <= samples && (lengths[i] as number) < shaftEnd; i++) {
    const s = lengths[i] as number;
    const half = (w.tail + ((w.shaft - w.tail) * s) / shaftEnd) / 2;
    const p = points[i] as Point,
      n = normal(i);
    left.push(offset(p, n, half));
    right.push(offset(p, n, -half));
  }
  // The head base sits exactly at the end of the shaft.
  const after = Math.min(samples, i),
    before = Math.max(0, after - 1);
  const span = (lengths[after] as number) - (lengths[before] as number) || 1;
  const t = (shaftEnd - (lengths[before] as number)) / span;
  const b = points[before] as Point,
    c = points[after] as Point;
  const base = { x: b.x + (c.x - b.x) * t, y: b.y + (c.y - b.y) * t },
    n = normal(after);
  left.push(offset(base, n, w.shaft / 2), offset(base, n, headWidth / 2));
  right.push(offset(base, n, -w.shaft / 2), offset(base, n, -headWidth / 2));
  const polygon = [...left, a.end, ...right.reverse()];
  return [...polygon, polygon[0] as Point];
}
export interface TextLayout {
  readonly width: number;
  readonly height: number;
  readonly paddingX: number;
  readonly paddingY: number;
  readonly radius: number;
  readonly lineHeight: number;
}
/** The pill fits its lines: padding around the measured text, growing as it is typed. */
export function textLayout(
  text: string,
  size: number,
  measure: (line: string) => number,
): TextLayout {
  const lines = text.split("\n");
  const paddingX = Math.round(size * 0.6),
    paddingY = Math.round(size * 0.3),
    lineHeight = size * 1.25;
  const content = Math.max(size * 0.5, ...lines.map(measure));
  return {
    width: content + paddingX * 2,
    height: lines.length * lineHeight + paddingY * 2,
    paddingX,
    paddingY,
    radius: Math.round(size * 0.45),
    lineHeight,
  };
}
/** White on saturated colours, near-black on light ones such as yellow or white. */
export function textColorFor(color: string): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)?.[1];
  if (!hex) return "#ffffff";
  const value = Number.parseInt(hex, 16);
  const luminance =
    0.299 * (value >> 16) +
    0.587 * ((value >> 8) & 255) +
    0.114 * (value & 255);
  return luminance > 160 ? "#18181b" : "#ffffff";
}
/** After a shape completes the editor returns to Select, unless ⌘ or Shift asks to keep drawing. */
export function toolAfterDrawing(
  tool: Tool,
  modifiers: { readonly metaKey: boolean; readonly shiftKey: boolean },
): Tool {
  if (tool === "select" || tool === "crop") return tool;
  return modifiers.metaKey || modifiers.shiftKey ? tool : "select";
}
/** A click without a drag leaves nothing worth keeping or selecting. */
export function isEmpty(a: Annotation): boolean {
  if (a.kind === "arrow")
    return Math.hypot(a.end.x - a.start.x, a.end.y - a.start.y) < 1;
  if ("rect" in a) return a.rect.width < 1 && a.rect.height < 1;
  return false;
}
export function smoothPoints(points: readonly Point[]): readonly Point[] {
  // Quadratic segments through successive midpoints, shared by drawing and picking.
  if (points.length < 3) return points;
  const result: Point[] = [points[0] as Point];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i] as Point,
      next = points[i + 1] as Point;
    const start = result.at(-1) as Point,
      end = midpoint(p, next);
    for (let n = 1; n <= 4; n++) {
      const t = n / 4,
        s = 1 - t;
      result.push({
        x: s * s * start.x + 2 * s * t * p.x + t * t * end.x,
        y: s * s * start.y + 2 * s * t * p.y + t * t * end.y,
      });
    }
  }
  result.push(points.at(-1) as Point);
  return result;
}
