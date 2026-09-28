import { captureSize, screenshotLimit } from "../capture-size.js";
import {
  type Annotation,
  arrowWedge,
  fontSize,
  type Rect,
  type Scene,
  smoothPoints,
  textColorFor,
  textLayout,
} from "./model.js";
import { redactPixels } from "./redaction.js";

export function contextFor(
  canvas: HTMLCanvasElement,
): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable");
  return ctx;
}
export const textFont = (size: number) => `600 ${size}px system-ui, sans-serif`;
/** Pill geometry from measured text, shared by the canvas, the export and the inline field. */
export function measureText(a: Extract<Annotation, { kind: "text" }>) {
  const size = fontSize(a.style);
  const ctx = contextFor(document.createElement("canvas"));
  ctx.font = textFont(size);
  return textLayout(a.text, size, (line) => ctx.measureText(line).width);
}
export function textAnnotation(
  a: Extract<Annotation, { kind: "text" }>,
): Annotation {
  const layout = measureText(a);
  return { ...a, width: layout.width, height: layout.height };
}
function drawAnnotation(ctx: CanvasRenderingContext2D, a: Annotation): void {
  ctx.save();
  ctx.strokeStyle = a.style.color;
  ctx.fillStyle = a.style.color;
  ctx.lineWidth = a.style.thickness;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  switch (a.kind) {
    case "arrow": {
      // One filled wedge for preview and export alike.
      const wedge = arrowWedge(a);
      const first = wedge[0];
      if (!first) break;
      ctx.moveTo(first.x, first.y);
      for (const p of wedge) ctx.lineTo(p.x, p.y);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "rectangle": {
      const r = a.rect;
      ctx.roundRect(
        r.x,
        r.y,
        r.width,
        r.height,
        a.style.rounded ? Math.min(16, r.width / 4, r.height / 4) : 0,
      );
      ctx.stroke();
      break;
    }
    case "oval": {
      const r = a.rect;
      ctx.ellipse(
        r.x + r.width / 2,
        r.y + r.height / 2,
        r.width / 2,
        r.height / 2,
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      break;
    }
    case "text": {
      const size = fontSize(a.style),
        layout = measureText(a);
      ctx.roundRect(
        a.position.x,
        a.position.y,
        layout.width,
        layout.height,
        layout.radius,
      );
      ctx.fill();
      ctx.fillStyle = textColorFor(a.style.color);
      ctx.font = textFont(size);
      ctx.textBaseline = "top";
      a.text.split("\n").forEach((line, i) => {
        ctx.fillText(
          line,
          a.position.x + layout.paddingX,
          a.position.y +
            layout.paddingY +
            i * layout.lineHeight +
            (layout.lineHeight - size) / 2,
        );
      });
      break;
    }
    case "freehand":
    case "highlighter": {
      if (a.kind === "highlighter") {
        ctx.globalAlpha = 0.38;
        ctx.globalCompositeOperation = "multiply";
        ctx.lineWidth = a.style.thickness * 8;
      }
      const points = smoothPoints(a.points),
        first = points[0];
      if (first) {
        ctx.moveTo(first.x, first.y);
        for (const p of points) ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      break;
    }
    case "step": {
      ctx.arc(
        a.position.x,
        a.position.y,
        12 + a.style.thickness * 2,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.fillStyle = textColorFor(a.style.color);
      ctx.font = `700 ${fontSize(a.style)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(a.number), a.position.x, a.position.y);
      break;
    }
    case "spotlight":
    case "redact":
      break;
  }
  ctx.restore();
}

/** The same renderer drives preview and export. Redaction is always the final pixel pass. */
export function renderScene(
  source: HTMLImageElement,
  scene: Scene,
  outputWidth?: number,
  outputHeight?: number,
): HTMLCanvasElement {
  const crop = scene.crop ?? {
    x: 0,
    y: 0,
    width: source.naturalWidth,
    height: source.naturalHeight,
  };
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth ?? crop.width;
  canvas.height = outputHeight ?? crop.height;
  const ctx = contextFor(canvas),
    sx = canvas.width / crop.width,
    sy = canvas.height / crop.height;
  const redactions = scene.annotations.filter((a) => a.kind === "redact");
  let raster: HTMLImageElement | HTMLCanvasElement = source;
  if ((sx !== 1 || sy !== 1) && redactions.length) {
    // Resampling filters read neighbouring source pixels, including those just
    // outside the output mask. Sanitize the source before any resizing.
    const sanitized = document.createElement("canvas");
    sanitized.width = source.naturalWidth;
    sanitized.height = source.naturalHeight;
    const sourceContext = contextFor(sanitized);
    sourceContext.drawImage(source, 0, 0);
    const pixels = sourceContext.getImageData(
      0,
      0,
      sanitized.width,
      sanitized.height,
    );
    for (const a of redactions)
      if (a.kind === "redact") redactPixels(pixels, a.rect, a.style.solid);
    sourceContext.putImageData(pixels, 0, 0);
    raster = sanitized;
  }
  ctx.drawImage(
    raster,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  ctx.save();
  ctx.scale(sx, sy);
  ctx.translate(-crop.x, -crop.y);
  for (const a of scene.annotations) drawAnnotation(ctx, a);
  ctx.restore();
  const outputRect = (r: Rect): Rect => ({
    x: (r.x - crop.x) * sx,
    y: (r.y - crop.y) * sy,
    width: r.width * sx,
    height: r.height * sy,
  });
  const spotlights = scene.annotations.filter((a) => a.kind === "spotlight");
  if (spotlights.length) {
    const mask = document.createElement("canvas");
    mask.width = canvas.width;
    mask.height = canvas.height;
    const overlay = contextFor(mask);
    overlay.fillStyle = "#00000099";
    overlay.fillRect(0, 0, mask.width, mask.height);
    // clearRect forms a union, including intersecting spotlights.
    for (const a of spotlights) {
      if (a.kind !== "spotlight") continue;
      const r = outputRect(a.rect);
      overlay.clearRect(r.x, r.y, r.width, r.height);
    }
    ctx.drawImage(mask, 0, 0);
  }
  if (redactions.length) {
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (const a of redactions)
      if (a.kind === "redact")
        redactPixels(pixels, outputRect(a.rect), a.style.solid);
    ctx.putImageData(pixels, 0, 0);
  }
  return canvas;
}
export async function flatten(
  source: HTMLImageElement,
  scene: Scene,
): Promise<Blob> {
  let width = scene.crop?.width ?? source.naturalWidth,
    height = scene.crop?.height ?? source.naturalHeight;
  for (;;) {
    const canvas = renderScene(source, scene, width, height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(new Error("PNG encoding failed")),
        "image/png",
      ),
    );
    if (blob.size <= screenshotLimit) return blob;
    const size = captureSize(width, height, 1, blob.size);
    width = size.width;
    height = size.height;
    // Each retry sanitizes the source and reapplies coarse blocks at output size.
  }
}
