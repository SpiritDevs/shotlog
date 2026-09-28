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
}
export const emptyScene = (): Scene => ({ annotations: [], crop: null });
export const historyFor = (scene: Scene): History => ({
  past: [],
  present: scene,
  future: [],
});
export function commit(history: History, scene: Scene): History {
  if (JSON.stringify(scene) === JSON.stringify(history.present)) return history;
  return {
    past: [...history.past, history.present],
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
        past: [...history.past, history.present],
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
  if (a.kind === "text") {
    // Text keeps its aspect ratio; horizontal-only drags must resize glyphs too.
    const factor = Math.abs(sx - 1) > Math.abs(sy - 1) ? sx : sy;
    const thickness = Math.max(0.5, (fontSize(a.style) * factor - 12) / 4);
    const ratio = fontSize({ ...a.style, thickness }) / fontSize(a.style);
    return {
      ...a,
      position: point(a.position),
      width: a.width * ratio,
      height: a.height * ratio,
      style: { ...a.style, thickness },
    };
  }
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
export function duplicate(
  scene: Scene,
  annotation: Annotation,
  id: string,
  offset = 10,
): Scene {
  return replace(scene, { ...translate(annotation, offset, offset), id });
}
export const fontSize = (style: Style) => 12 + style.thickness * 4;
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
