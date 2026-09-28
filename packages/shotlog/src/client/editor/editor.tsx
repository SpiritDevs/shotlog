import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ShotlogLabels } from "../types.js";
import { type Handle, handles, pick, resize } from "./hit-test.js";
import {
  type Annotation,
  boundCrop,
  bounds,
  commit,
  duplicate,
  fontSize,
  historyFor,
  isEmpty,
  midpoint,
  nudge,
  type Point,
  type Rect,
  rectBetween,
  redo,
  remove,
  replace,
  type Scene,
  type Style,
  type Tool,
  textColorFor,
  toolAfterDrawing,
  translate,
  undo,
} from "./model.js";
import {
  contextFor,
  flatten,
  measureText,
  renderScene,
  textAnnotation,
} from "./render.js";
import { editorStyles } from "./styles.js";

const tools: readonly {
  tool: Tool;
  key: string;
  label: keyof ShotlogLabels;
  path: string;
}[] = [
  {
    tool: "select",
    key: "V",
    label: "editorSelect",
    path: "m5 3 14 9-7 1-3 7Z",
  },
  {
    tool: "arrow",
    key: "A",
    label: "editorArrow",
    path: "M4 20 20 4M8 4h12v12",
  },
  {
    tool: "rectangle",
    key: "R",
    label: "editorRectangle",
    path: "M4 5h16v14H4Z",
  },
  {
    tool: "oval",
    key: "O",
    label: "editorOval",
    path: "M21 12a9 7 0 1 1-18 0 9 7 0 1 1 18 0",
  },
  {
    tool: "text",
    key: "T",
    label: "editorText",
    path: "M4 5h16M12 5v15M8 20h8",
  },
  {
    tool: "freehand",
    key: "P",
    label: "editorFreehand",
    path: "M3 18c0-14 5-14 5-7s4 7 5 0 7-8 7 1-4 7-4 7",
  },
  {
    tool: "highlighter",
    key: "H",
    label: "editorHighlighter",
    path: "m6 15 9-12 6 5-9 12Zm0 0-3 6h8",
  },
  {
    tool: "step",
    key: "N",
    label: "editorStep",
    path: "M21 12a9 9 0 1 1-18 0 9 9 0 1 1 18 0M9 9l3-2v10M9 17h6",
  },
  {
    tool: "spotlight",
    key: "S",
    label: "editorSpotlight",
    path: "M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5M8 8h8v8H8Z",
  },
  {
    tool: "redact",
    key: "X",
    label: "editorRedact",
    path: "M4 4h16v16H4ZM4 10h16M4 16h16M10 4v16M16 4v16",
  },
  { tool: "crop", key: "C", label: "editorCrop", path: "M6 2v16h16M2 6h16v16" },
];
const defaultStyle: Style = {
  color: "#ef4444",
  thickness: 3,
  rounded: false,
  solid: false,
};
const noModifiers = { metaKey: false, shiftKey: false };
type TextMark = Extract<Annotation, { kind: "text" }>;
type Modifiers = { readonly metaKey: boolean; readonly shiftKey: boolean };
type Result = { blob: Blob; scene: Scene } | undefined;
interface Gesture {
  readonly start: Point;
  readonly scene: Scene;
  readonly annotation: Annotation | null;
  readonly handle: Handle["name"] | undefined;
  readonly draw: boolean;
  readonly pointerId: number;
}
interface Props {
  readonly image: HTMLImageElement;
  readonly initial: Scene;
  readonly labels: ShotlogLabels;
  /** The Report Card's rectangle, which the editor grows out of and shrinks back into. */
  readonly origin?: DOMRect | undefined;
  readonly onFinish: (result: Result) => void;
}

export function Editor({ image, initial, labels, origin, onFinish }: Props) {
  const id = useId();
  const [history, setHistory] = useState(() => historyFor(initial));
  const [preview, setPreview] = useState<Scene | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [confirming, setConfirming] = useState(false);
  const confirmRef = useRef<HTMLDivElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  // Keeping work is the safe default for Enter.
  useEffect(() => {
    if (confirming) confirmRef.current?.querySelector("button")?.focus();
  }, [confirming]);
  const keepEditing = () => {
    setConfirming(false);
    cancelButton.current?.focus();
  };
  const [selected, setSelected] = useState<string>();
  const [styles, setStyles] = useState<Partial<Record<Tool, Style>>>({});
  const [cropDraft, setCropDraft] = useState<Rect | null>(null);
  const [text, setText] = useState<TextMark | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [closing, setClosing] = useState(false);
  const [viewport, setViewport] = useState({ width: 800, height: 500, dpr: 1 });
  const backdrop = useRef<HTMLDivElement>(null),
    dialog = useRef<HTMLDivElement | null>(null),
    stage = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    toolbar = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null),
    draft = useRef<Scene | null>(null),
    clipboard = useRef<Annotation | null>(null),
    serial = useRef(0),
    savingRef = useRef(false),
    closingRef = useRef(false),
    result = useRef<Result>(undefined);
  const newId = () => `annotation-${Date.now()}-${++serial.current}`;
  const scene = preview ?? history.present;
  const active = scene.annotations.find((a) => a.id === selected);
  const style = active?.style ?? styles[tool] ?? defaultStyle;
  const crop = scene.crop ?? {
    x: 0,
    y: 0,
    width: image.naturalWidth,
    height: image.naturalHeight,
  };
  const scale = Math.min(
    (viewport.width - 24) / crop.width,
    (viewport.height - 24) / crop.height,
    1,
  );
  const displayWidth = Math.max(1, crop.width * scale),
    displayHeight = Math.max(1, crop.height * scale);
  const selectedTool = tools.find((item) => item.tool === tool);
  const toolName = selectedTool ? String(labels[selectedTool.label]) : "";
  const updatePreview = (next: Scene | null) => {
    draft.current = next;
    setPreview(next);
  };
  const save = (next: Scene) => {
    setHistory((h) => commit(h, next));
    updatePreview(null);
  };
  const withText = (base = draft.current ?? scene): Scene =>
    text
      ? text.text.trim()
        ? replace(base, textAnnotation(text))
        : remove(base, text.id)
      : base;
  const stopNudging = () =>
    setHistory(({ past, present, future }) => ({ past, present, future }));
  const releaseGesture = () => {
    const current = gesture.current;
    gesture.current = null;
    if (current && canvas.current?.hasPointerCapture(current.pointerId))
      canvas.current.releasePointerCapture(current.pointerId);
  };
  /** Commits the text being edited; returns whether a pill was kept. */
  const finishText = (modifiers: Modifiers = noModifiers): boolean => {
    if (!text) return false;
    const kept = text.text.trim().length > 0;
    save(withText());
    setText(null);
    if (kept && toolAfterDrawing("text", modifiers) === "select") {
      setTool("select");
      setSelected(text.id);
    }
    return kept;
  };
  const choose = (next: Tool) => {
    stopNudging();
    finishText();
    setTool(next);
    setSelected(undefined);
    setCropDraft(null);
  };
  // Plays the exit animation, then hands the result back once it has finished.
  const close = (value: Result) => {
    if (closingRef.current) return;
    closingRef.current = true;
    result.current = value;
    setClosing(true);
  };
  const cancel = () => {
    if (savingRef.current || closingRef.current) return;
    const dirty =
      JSON.stringify(withText()) !== JSON.stringify(initial) ||
      cropDraft !== null ||
      preview !== null;
    if (dirty) setConfirming(true);
    else close(undefined);
  };
  const done = async () => {
    if (savingRef.current || closingRef.current) return;
    const finalScene = withText();
    releaseGesture();
    if (cropDraft) {
      save({
        ...finalScene,
        crop: boundCrop(cropDraft, image.naturalWidth, image.naturalHeight),
      });
      setCropDraft(null);
      setTool("select");
      setText(null);
      return;
    }
    save(finalScene);
    setText(null);
    savingRef.current = true;
    setSaving(true);
    setError(false);
    try {
      close({ blob: await flatten(image, finalScene), scene: finalScene });
    } catch {
      savingRef.current = false;
      setSaving(false);
      setError(true);
    }
  };
  const changeStyle = (patch: Partial<Style>) => {
    const next = { ...style, ...patch };
    setStyles((s) => ({ ...s, [active?.kind ?? tool]: next }));
    if (active)
      save(
        replace(
          history.present,
          active.kind === "text"
            ? textAnnotation({ ...active, style: next })
            : { ...active, style: next },
        ),
      );
  };
  const point = (clientX: number, clientY: number): Point => {
    const rect = canvas.current?.getBoundingClientRect();
    return {
      x: Math.max(
        crop.x,
        Math.min(
          crop.x + crop.width,
          crop.x + (clientX - (rect?.left ?? 0)) / scale,
        ),
      ),
      y: Math.max(
        crop.y,
        Math.min(
          crop.y + crop.height,
          crop.y + (clientY - (rect?.top ?? 0)) / scale,
        ),
      ),
    };
  };
  const makeAnnotation = (p: Point): Annotation | null => {
    const base = { id: newId(), style: styles[tool] ?? defaultStyle };
    switch (tool) {
      case "arrow":
        return { ...base, kind: tool, start: p, end: p, control: p };
      case "rectangle":
      case "oval":
      case "spotlight":
      case "redact":
        return { ...base, kind: tool, rect: { ...p, width: 0, height: 0 } };
      case "freehand":
      case "highlighter":
        return { ...base, kind: tool, points: [p] };
      case "step":
        return { ...base, kind: tool, position: p, number: 1 };
      case "text":
        return textAnnotation({
          ...base,
          kind: tool,
          position: p,
          text: "",
          width: 0,
          height: 0,
        });
      default:
        return null;
    }
  };
  const keyDown = (event: KeyboardEvent) => {
    if (savingRef.current || closingRef.current) {
      event.preventDefault();
      return;
    }
    if (event.isComposing) return;
    const target = event.composedPath()[0];
    if (confirming) {
      // Only the discard dialog is live: Esc backs out, Tab stays in it, buttons act natively.
      if (event.key === "Escape") {
        event.preventDefault();
        keepEditing();
      } else if (event.key === "Tab") {
        const buttons = Array.from(
          confirmRef.current?.querySelectorAll<HTMLButtonElement>("button") ??
            [],
        );
        const index = buttons.indexOf(target as HTMLButtonElement);
        event.preventDefault();
        buttons[
          (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length
        ]?.focus();
      }
      return;
    }
    const typing =
      target instanceof HTMLElement &&
      (target.matches("input, textarea, select") || target.isContentEditable);
    const command = event.metaKey || event.ctrlKey,
      key = event.key.toLowerCase();
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
      return;
    }
    if (command && event.key === "Enter") {
      event.preventDefault();
      void done();
      return;
    }
    if (typing && event.key !== "Tab") {
      // Enter commits the pill; Shift+Enter starts a new line.
      if (
        event.key === "Enter" &&
        !event.shiftKey &&
        target instanceof HTMLTextAreaElement &&
        target.classList.contains("sl-editor-text")
      ) {
        event.preventDefault();
        finishText();
        canvas.current?.focus();
      }
      return;
    }
    if (event.key === "Tab") {
      const nodes = Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled):not([tabindex='-1']), textarea, canvas",
        ) ?? [],
      );
      const index = nodes.indexOf(target as HTMLElement);
      event.preventDefault();
      nodes[
        (index + (event.shiftKey ? -1 : 1) + nodes.length) % nodes.length
      ]?.focus();
      return;
    }
    if (
      toolbar.current?.contains(target as Node) &&
      ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
    ) {
      const buttons = Array.from(
        toolbar.current.querySelectorAll<HTMLButtonElement>("button"),
      );
      const index = buttons.indexOf(target as HTMLButtonElement);
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? buttons.length - 1
            : (index + (event.key === "ArrowLeft" ? -1 : 1) + buttons.length) %
              buttons.length;
      event.preventDefault();
      const item = tools[next];
      if (item) choose(item.tool);
      buttons[next]?.focus();
      return;
    }
    if (command && key === "z") {
      event.preventDefault();
      setHistory((h) => (event.shiftKey ? redo(h) : undo(h)));
      updatePreview(null);
      setCropDraft(null);
      return;
    }
    if (command && key === "c" && active) {
      event.preventDefault();
      clipboard.current = active;
      return;
    }
    if (command && key === "v" && clipboard.current) {
      event.preventDefault();
      const nextId = newId();
      save(duplicate(history.present, clipboard.current, nextId));
      setSelected(nextId);
      setTool("select");
      return;
    }
    if (command) return;
    if (event.key === "Enter") {
      if (target === canvas.current || target === stage.current) {
        event.preventDefault();
        void done();
      }
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && active) {
      event.preventDefault();
      save(remove(history.present, active.id));
      setSelected(undefined);
      return;
    }
    if (event.key.startsWith("Arrow") && active) {
      event.preventDefault();
      const amount = event.shiftKey ? 10 : 1;
      const time = performance.now();
      setHistory((h) =>
        nudge(
          h,
          active.id,
          event.key === "ArrowLeft"
            ? -amount
            : event.key === "ArrowRight"
              ? amount
              : 0,
          event.key === "ArrowUp"
            ? -amount
            : event.key === "ArrowDown"
              ? amount
              : 0,
          time,
        ),
      );
      return;
    }
    if (!event.altKey) {
      const item = tools.find((item) => item.key.toLowerCase() === key);
      if (item) {
        event.preventDefault();
        choose(item.tool);
      }
    }
  };
  const keyHandler = useRef(keyDown);
  keyHandler.current = keyDown;
  // Runs during commit, before first paint, so the first frame matches the Report Card.
  const attach = useCallback(
    (node: HTMLDivElement | null) => {
      dialog.current = node;
      if (!node || !origin?.width || !origin.height) return;
      const rect = node.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      node.style.setProperty(
        "--_fx",
        `${origin.left + origin.width / 2 - (rect.left + rect.width / 2)}px`,
      );
      node.style.setProperty(
        "--_fy",
        `${origin.top + origin.height / 2 - (rect.top + rect.height / 2)}px`,
      );
      node.style.setProperty("--_fsx", String(origin.width / rect.width));
      node.style.setProperty("--_fsy", String(origin.height / rect.height));
    },
    [origin],
  );
  useEffect(() => {
    // Window capture precedes the Report Card's document trap, but cannot
    // pre-empt Host App capture listeners registered earlier on window.
    const held = new Set<string>();
    let mounted = true;
    const detach = () => {
      for (const type of ["keydown", "keypress", "keyup"] as const)
        window.removeEventListener(type, keyboard, true);
      window.removeEventListener("blur", blur);
    };
    const keyboard = (event: KeyboardEvent) => {
      const key = event.code || event.key;
      if (!mounted && !held.has(key)) return;
      if (event.type === "keydown") held.add(key);
      if (event.type === "keyup") held.delete(key);
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (mounted) {
        if (event.type === "keydown") keyHandler.current(event);
      } else {
        event.preventDefault();
        if (!held.size) detach();
      }
    };
    const blur = () => {
      held.clear();
      if (!mounted) detach();
    };
    const focus = (event: FocusEvent) => {
      event.stopImmediatePropagation();
      if (!event.composedPath().includes(dialog.current as EventTarget))
        toolbar.current
          ?.querySelector<HTMLButtonElement>("[tabindex='0']")
          ?.focus();
    };
    for (const type of ["keydown", "keypress", "keyup"] as const)
      window.addEventListener(type, keyboard, true);
    window.addEventListener("focusin", focus, true);
    window.addEventListener("blur", blur);
    toolbar.current
      ?.querySelector<HTMLButtonElement>("[tabindex='0']")
      ?.focus();
    return () => {
      mounted = false;
      if (!held.size) detach();
      window.removeEventListener("focusin", focus, true);
    };
  }, []);
  // Unmount once the exit animation ends; immediately when motion is reduced or unsupported.
  useEffect(() => {
    if (!closing) return;
    const node = backdrop.current;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onFinish(result.current);
    };
    const animations =
      typeof node?.getAnimations === "function"
        ? node.getAnimations({ subtree: true })
        : [];
    if (animations.length === 0) {
      finish();
      return;
    }
    void Promise.allSettled(
      animations.map((animation) => animation.finished),
    ).then(finish);
    const fallback = setTimeout(finish, 600);
    return () => {
      done = true;
      clearTimeout(fallback);
    };
  }, [closing, onFinish]);
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const measure = () =>
      setViewport({
        width: element.clientWidth,
        height: element.clientHeight,
        dpr: window.devicePixelRatio || 1,
      });
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    element.width = Math.max(1, Math.round(displayWidth * viewport.dpr));
    element.height = Math.max(1, Math.round(displayHeight * viewport.dpr));
    const ctx = contextFor(element);
    ctx.drawImage(
      renderScene(image, scene),
      0,
      0,
      element.width,
      element.height,
    );
    ctx.scale(scale * viewport.dpr, scale * viewport.dpr);
    ctx.translate(-crop.x, -crop.y);
    ctx.strokeStyle = "#6366f1";
    ctx.lineWidth = 1.5 / scale;
    // An arrow is a line, not a box: it shows only its three handles.
    const selection =
      cropDraft ?? (active && active.kind !== "arrow" ? bounds(active) : null);
    if (selection) {
      ctx.setLineDash([5 / scale, 4 / scale]);
      if (!cropDraft && active?.kind === "text") {
        const gap = 3 / scale;
        ctx.beginPath();
        ctx.roundRect(
          selection.x - gap,
          selection.y - gap,
          selection.width + gap * 2,
          selection.height + gap * 2,
          measureText(active).radius + gap,
        );
        ctx.stroke();
      } else
        ctx.strokeRect(
          selection.x,
          selection.y,
          selection.width,
          selection.height,
        );
      ctx.setLineDash([]);
    }
    if (active)
      for (const handle of handles(active)) {
        const r = (active.kind === "arrow" ? 5 : 4) / scale;
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        if (active.kind === "arrow")
          ctx.arc(handle.point.x, handle.point.y, r, 0, Math.PI * 2);
        else ctx.rect(handle.point.x - r, handle.point.y - r, 2 * r, 2 * r);
        ctx.fill();
        ctx.stroke();
      }
  }, [
    image,
    scene,
    active,
    cropDraft,
    scale,
    crop.x,
    crop.y,
    displayWidth,
    displayHeight,
    viewport.dpr,
  ]);
  const textLayout = text ? measureText(text) : null;

  return (
    <div
      ref={backdrop}
      className="sl-editor"
      data-state={closing ? "closing" : "open"}
    >
      <style>{editorStyles}</style>
      <div
        ref={attach}
        className="sl-editor-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-busy={saving}
        aria-hidden={closing || undefined}
      >
        <header className="sl-editor-header">
          <h2 id={`${id}-title`}>{labels.editorTitle}</h2>
          <button
            ref={cancelButton}
            type="button"
            disabled={saving}
            onClick={cancel}
          >
            {labels.editorCancel}
          </button>
          <button
            type="button"
            className="sl-done"
            disabled={saving}
            onClick={() => void done()}
          >
            {saving
              ? labels.editorSaving
              : cropDraft
                ? labels.editorApplyCrop
                : labels.editorDone}
          </button>
        </header>
        <div className="sl-editor-stage" ref={stage} tabIndex={-1}>
          <div
            className="sl-editor-image"
            style={{ width: displayWidth, height: displayHeight }}
          >
            <canvas
              ref={canvas}
              style={{ width: displayWidth, height: displayHeight }}
              tabIndex={0}
              aria-label={labels.editorCanvas}
              data-select={tool === "select"}
              onPointerDown={(event) => {
                if (saving || closing || event.button !== 0 || gesture.current)
                  return;
                stopNudging();
                event.preventDefault();
                const baseScene = withText();
                const modifiers = {
                  metaKey: event.metaKey,
                  shiftKey: event.shiftKey,
                };
                const committed = finishText(modifiers);
                event.currentTarget.focus();
                // Without a modifier, that click only commits the pill and selects it.
                if (
                  committed &&
                  tool === "text" &&
                  toolAfterDrawing(tool, modifiers) === "select"
                )
                  return;
                event.currentTarget.setPointerCapture(event.pointerId);
                const p = point(event.clientX, event.clientY);
                if (tool === "crop") {
                  setCropDraft({ ...p, width: 0, height: 0 });
                  gesture.current = {
                    start: p,
                    scene: baseScene,
                    annotation: null,
                    handle: undefined,
                    draw: true,
                    pointerId: event.pointerId,
                  };
                  return;
                }
                if (tool === "select") {
                  const handle = active
                    ? handles(active).find(
                        (h) =>
                          Math.hypot(p.x - h.point.x, p.y - h.point.y) <=
                          8 / scale,
                      )
                    : undefined;
                  let annotation = handle
                    ? active
                    : pick(baseScene.annotations, p, 6 / scale);
                  let base = baseScene;
                  if (annotation && event.altKey) {
                    annotation = { ...annotation, id: newId() };
                    base = replace(base, annotation);
                    updatePreview(base);
                  }
                  setSelected(annotation?.id);
                  gesture.current = {
                    start: p,
                    scene: base,
                    annotation: annotation ?? null,
                    handle: handle?.name,
                    draw: false,
                    pointerId: event.pointerId,
                  };
                  return;
                }
                const annotation = makeAnnotation(p);
                if (!annotation) return;
                if (annotation.kind === "text") {
                  setText(annotation);
                  setSelected(undefined);
                  return;
                }
                setSelected(annotation.id);
                updatePreview(replace(baseScene, annotation));
                gesture.current = {
                  start: p,
                  scene: baseScene,
                  annotation,
                  handle: undefined,
                  draw: true,
                  pointerId: event.pointerId,
                };
              }}
              onPointerMove={(event) => {
                const g = gesture.current;
                if (!g || g.pointerId !== event.pointerId) return;
                const p = point(event.clientX, event.clientY);
                if (!g.annotation) {
                  if (tool === "crop") setCropDraft(rectBetween(g.start, p));
                  return;
                }
                let a = g.annotation;
                if (!g.draw)
                  a = g.handle
                    ? resize(a, g.handle, p)
                    : translate(a, p.x - g.start.x, p.y - g.start.y);
                else if (a.kind === "arrow")
                  a = { ...a, end: p, control: midpoint(a.start, p) };
                else if (a.kind === "step") a = { ...a, position: p };
                else if ("rect" in a)
                  a = { ...a, rect: rectBetween(g.start, p) };
                else if ("points" in a) {
                  const previous = draft.current?.annotations.find(
                    (item) => item.id === a.id,
                  );
                  a = {
                    ...a,
                    points: [
                      ...(previous && "points" in previous
                        ? previous.points
                        : a.points),
                      p,
                    ],
                  };
                }
                updatePreview(replace(g.scene, a));
              }}
              onPointerUp={(event) => {
                const g = gesture.current;
                if (!g || g.pointerId !== event.pointerId) return;
                const drawn =
                  g.draw && g.annotation
                    ? draft.current?.annotations.find(
                        (a) => a.id === g.annotation?.id,
                      )
                    : undefined;
                if (drawn && isEmpty(drawn)) {
                  // A stray click leaves no shape behind.
                  updatePreview(null);
                  setSelected(undefined);
                } else {
                  if (draft.current) save(draft.current);
                  // Pointer-up completes the shape; return to Select unless ⌘ or Shift is held.
                  if (drawn) setTool(toolAfterDrawing(tool, event));
                }
                releaseGesture();
              }}
              onPointerCancel={() => {
                gesture.current = null;
                updatePreview(null);
                setCropDraft(null);
              }}
              onDoubleClick={(event) => {
                const a = pick(
                  scene.annotations,
                  point(event.clientX, event.clientY),
                );
                if (a?.kind === "text") {
                  stopNudging();
                  setText(a);
                  setSelected(undefined);
                }
              }}
            />
            {text && textLayout && (
              <textarea
                className="sl-editor-text"
                aria-label={labels.editorTextInput}
                ref={(node) => node?.focus()}
                value={text.text}
                rows={1}
                spellCheck={false}
                style={{
                  left: (text.position.x - crop.x) * scale,
                  top: (text.position.y - crop.y) * scale,
                  width: textLayout.width * scale,
                  height: textLayout.height * scale,
                  padding: `${textLayout.paddingY * scale}px ${textLayout.paddingX * scale}px`,
                  borderRadius: textLayout.radius * scale,
                  fontSize: fontSize(text.style) * scale,
                  background: text.style.color,
                  color: textColorFor(text.style.color),
                  caretColor: textColorFor(text.style.color),
                }}
                onChange={(event) =>
                  setText(
                    textAnnotation({
                      ...text,
                      text: event.currentTarget.value,
                    }) as TextMark,
                  )
                }
                onBlur={() => finishText()}
              />
            )}
          </div>
        </div>
        <footer className="sl-editor-footer">
          <div
            className="sl-editor-tools"
            ref={toolbar}
            role="toolbar"
            aria-label={labels.editorTools}
          >
            {tools.map((item) => (
              <button
                key={item.tool}
                type="button"
                disabled={saving}
                data-tool={item.tool}
                aria-label={String(labels[item.label])}
                title={`${String(labels[item.label])} (${item.key})`}
                aria-pressed={tool === item.tool}
                tabIndex={tool === item.tool ? 0 : -1}
                onClick={() => choose(item.tool)}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d={item.path} />
                </svg>
                <kbd>{item.key}</kbd>
              </button>
            ))}
          </div>
          <fieldset className="sl-editor-style" aria-label={labels.editorStyle}>
            {[
              ["#ef4444", labels.editorRed],
              ["#facc15", labels.editorYellow],
              ["#22c55e", labels.editorGreen],
              ["#3b82f6", labels.editorBlue],
              [
                style.color === "#ffffff" ? "#ffffff" : "#18181b",
                labels.editorBlackWhite,
              ],
            ].map(([color, label]) => (
              <button
                type="button"
                className="sl-swatch"
                key={label}
                disabled={saving}
                aria-label={label}
                title={label}
                aria-pressed={style.color === color}
                onClick={() =>
                  changeStyle({
                    color:
                      label === labels.editorBlackWhite
                        ? style.color === "#18181b"
                          ? "#ffffff"
                          : "#18181b"
                        : (color ?? "#ef4444"),
                  })
                }
              >
                <span style={{ background: color }} />
              </button>
            ))}
            <span className="sl-divider" aria-hidden="true" />
            {[1.5, 3, 6].map((thickness, i) => {
              const label = [
                labels.editorThin,
                labels.editorMedium,
                labels.editorThick,
              ][i];
              return (
                <button
                  type="button"
                  key={thickness}
                  disabled={saving}
                  aria-label={label}
                  title={label}
                  aria-pressed={style.thickness === thickness}
                  onClick={() => changeStyle({ thickness })}
                >
                  <svg width="18" height="18" aria-hidden="true">
                    <path
                      d="M2 9h14"
                      stroke="currentColor"
                      strokeWidth={thickness}
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              );
            })}
            {(active?.kind ?? tool) === "rectangle" && (
              <button
                type="button"
                disabled={saving}
                aria-pressed={style.rounded}
                onClick={() => changeStyle({ rounded: !style.rounded })}
              >
                {labels.editorRounded}
              </button>
            )}
            {(active?.kind ?? tool) === "redact" && (
              <button
                type="button"
                disabled={saving}
                aria-pressed={style.solid}
                onClick={() => changeStyle({ solid: !style.solid })}
              >
                {labels.editorSolid}
              </button>
            )}
            <span className="sl-divider" aria-hidden="true" />
            <button
              type="button"
              disabled={saving || !history.past.length}
              title={labels.editorUndo}
              aria-label={labels.editorUndo}
              onClick={() => {
                setHistory(undo);
                setCropDraft(null);
              }}
            >
              ↶
            </button>
            <button
              type="button"
              disabled={saving || !history.future.length}
              title={labels.editorRedo}
              aria-label={labels.editorRedo}
              onClick={() => {
                setHistory(redo);
                setCropDraft(null);
              }}
            >
              ↷
            </button>
          </fieldset>
        </footer>
        {confirming && (
          <div className="sl-confirm-backdrop">
            <div
              ref={confirmRef}
              className="sl-confirm"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby={`${id}-discard`}
            >
              <p id={`${id}-discard`}>{labels.editorDiscardChanges}</p>
              <div className="sl-confirm-actions">
                <button type="button" onClick={keepEditing}>
                  {labels.editorKeepEditing}
                </button>
                <button
                  type="button"
                  className="sl-danger"
                  onClick={() => close(undefined)}
                >
                  {labels.editorDiscard}
                </button>
              </div>
            </div>
          </div>
        )}
        <div
          className={`sl-editor-status${error ? " sl-editor-error" : ""}`}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {error
            ? labels.editorFailed
            : cropDraft
              ? labels.editorCropHint
              : labels.editorToolSelected(toolName)}
        </div>
      </div>
    </div>
  );
}
