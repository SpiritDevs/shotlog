import { captureSize, screenshotLimit } from "../capture-size.js";
import {
  type Annotation,
  fontSize,
  type Rect,
  type Scene,
  smoothPoints,
} from "./model.js";
import { redactPixels } from "./redaction.js";

export function contextFor(
  canvas: HTMLCanvasElement,
): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable");
  return ctx;
}
export function textAnnotation(
  a: Extract<Annotation, { kind: "text" }>,
): Annotation {
  const ctx = contextFor(document.createElement("canvas"));
  ctx.font = `600 ${fontSize(a.style)}px system-ui, sans-serif`;
  return {
    ...a,
    width: Math.max(
      10,
      ...a.text.split("\n").map((line) => ctx.measureText(line).width),
    ),
    height: a.text.split("\n").length * fontSize(a.style) * 1.25,
  };
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
      ctx.moveTo(a.start.x, a.start.y);
      ctx.quadraticCurveTo(a.control.x, a.control.y, a.end.x, a.end.y);
      ctx.stroke();
      const angle = Math.atan2(a.end.y - a.control.y, a.end.x - a.control.x),
        length = 9 + a.style.thickness * 3;
      ctx.beginPath();
      ctx.moveTo(a.end.x, a.end.y);
      ctx.lineTo(
        a.end.x - length * Math.cos(angle - 0.45),
        a.end.y - length * Math.sin(angle - 0.45),
      );
      ctx.lineTo(
        a.end.x - length * Math.cos(angle + 0.45),
        a.end.y - length * Math.sin(angle + 0.45),
      );
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
    case "text":
      ctx.font = `600 ${fontSize(a.style)}px system-ui, sans-serif`;
      ctx.textBaseline = "top";
      a.text.split("\n").forEach((line, i) => {
        ctx.fillText(
          line,
          a.position.x,
          a.position.y + i * fontSize(a.style) * 1.25,
        );
      });
      break;
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
      ctx.fillStyle =
        a.style.color === "#ffffff" || a.style.color === "#facc15"
          ? "#18181b"
          : "#ffffff";
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
  ctx.drawImage(
    source,
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
  const redactions = scene.annotations.filter((a) => a.kind === "redact");
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
    // Re-render instead of resizing redacted pixels: blocks stay >= 12 output pixels.
  }
}
