import type { ShotlogPosition } from "./types.js";

export type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export interface CardSize {
  readonly width: number;
  readonly height: number;
}
export interface SizeLimits {
  readonly min: CardSize;
  readonly max: CardSize;
}
export interface Anchor {
  readonly vertical: "top" | "center" | "bottom";
  readonly horizontal: "left" | "center" | "right";
}

export function anchorFor(position: ShotlogPosition): Anchor {
  if (position === "center")
    return { vertical: "center", horizontal: "center" };
  const [vertical, horizontal] = position.split("-") as [
    "top" | "bottom",
    "left" | "center" | "right",
  ];
  return { vertical, horizontal };
}
/** The resize handle sits diagonally opposite the anchor; centred axes use the bottom or right edge. */
export function resizeCorner(position: ShotlogPosition): Corner {
  const { vertical, horizontal } = anchorFor(position);
  return `${vertical === "top" || vertical === "center" ? "bottom" : "top"}-${horizontal === "right" ? "left" : "right"}`;
}
/** Pointer directions that grow the card: +1 is right or down, -1 is left or up. */
export function growthDirection(position: ShotlogPosition): {
  readonly x: 1 | -1;
  readonly y: 1 | -1;
} {
  const corner = resizeCorner(position);
  return {
    x: corner.endsWith("right") ? 1 : -1,
    y: corner.startsWith("bottom") ? 1 : -1,
  };
}
/** The card only grows from its default size, and never beyond the viewport minus its offsets. */
export function clampSize(size: CardSize, limits: SizeLimits): CardSize {
  const clamp = (value: number, min: number, max: number) =>
    Math.round(Math.max(min, Math.min(Math.max(min, max), value)));
  return {
    width: clamp(size.width, limits.min.width, limits.max.width),
    height: clamp(size.height, limits.min.height, limits.max.height),
  };
}
/** The size after the handle moves by a pointer delta. A centred axis grows on both sides. */
export function dragSize(
  position: ShotlogPosition,
  start: CardSize,
  delta: { readonly x: number; readonly y: number },
  limits: SizeLimits,
): CardSize {
  const direction = growthDirection(position),
    anchor = anchorFor(position);
  return clampSize(
    {
      width:
        start.width +
        delta.x * direction.x * (anchor.horizontal === "center" ? 2 : 1),
      height:
        start.height +
        delta.y * direction.y * (anchor.vertical === "center" ? 2 : 1),
    },
    limits,
  );
}
/** Arrow keys move the handle in its growth directions; null for keys that are not arrows. */
export function keySize(
  position: ShotlogPosition,
  current: CardSize,
  key: string,
  step: number,
  limits: SizeLimits,
): CardSize | null {
  const direction = growthDirection(position);
  const dx =
    key === "ArrowRight" ? direction.x : key === "ArrowLeft" ? -direction.x : 0;
  const dy =
    key === "ArrowDown" ? direction.y : key === "ArrowUp" ? -direction.y : 0;
  if (!dx && !dy) return null;
  return clampSize(
    { width: current.width + dx * step, height: current.height + dy * step },
    limits,
  );
}
