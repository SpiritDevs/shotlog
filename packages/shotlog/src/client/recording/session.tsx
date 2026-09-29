import {
  type ReactElement,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { formatDuration } from "../../internal/duration.js";
import type { RecordingLimits } from "../../internal/wire.js";
import type { ShotlogLabels } from "../types.js";
import type { RecordedVideo, Recorder } from "./recorder.js";

/** Drawings stay this long after the Reporter's last stroke, then fade together. */
export const fadeAfterMs = 10_000;
const fadeMs = 700;

type Tool = "pointer" | "pen" | "arrow" | "rectangle" | "oval";
interface Point {
  readonly x: number;
  readonly y: number;
}
type Mark =
  | { readonly tool: "pen"; readonly points: readonly Point[] }
  | {
      readonly tool: "arrow" | "rectangle" | "oval";
      readonly from: Point;
      readonly to: Point;
    };

export interface RecordingSessionProps {
  readonly recorder: Recorder;
  readonly limits: RecordingLimits;
  readonly labels: ShotlogLabels;
  readonly onFinish: (video: RecordedVideo) => void;
  readonly onDiscard: () => void;
  readonly onError: (message: string) => void;
}

export function RecordingSession({
  recorder,
  limits,
  labels,
  onFinish,
  onDiscard,
  onError,
}: RecordingSessionProps): ReactElement {
  const [tool, setTool] = useState<Tool>("pointer");
  const [marks, setMarks] = useState<readonly Mark[]>([]);
  const [draft, setDraftState] = useState<Mark | null>(null);
  // Pointer events can outrun renders; the ref always holds the stroke in progress.
  const draftRef = useRef<Mark | null>(null);
  const setDraft = (next: Mark | null) => {
    draftRef.current = next;
    setDraftState(next);
  };
  const [fading, setFading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [microphone, setMicrophone] = useState<"pending" | "on" | "off">(
    "pending",
  );
  const [muted, setMuted] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const bar = useRef<HTMLDivElement>(null);
  const firstTool = useRef<HTMLButtonElement>(null);
  const drawing = useRef<number | null>(null);
  const timers = useRef<{
    fade?: ReturnType<typeof setTimeout>;
    clear?: ReturnType<typeof setTimeout>;
  }>({});
  const settled = useRef(false);

  const finish = useCallback(async () => {
    if (settled.current) return;
    settled.current = true;
    setFinishing(true);
    try {
      const video = await recorder.stop();
      if (video.blob.size > limits.maxBytes) onError(labels.recordingTooLarge);
      else onFinish(video);
    } catch {
      onError(labels.recordingFailed);
    }
  }, [recorder, limits.maxBytes, labels, onFinish, onError]);
  const finishRef = useRef(finish);
  finishRef.current = finish;

  useEffect(() => {
    recorder.start();
    let current = true;
    void recorder.addMicrophone().then((available) => {
      if (current) setMicrophone(available ? "on" : "off");
    });
    firstTool.current?.focus();
    const stopListening = recorder.onEnded(() => void finishRef.current());
    // Stop a little short of the byte limit: the last second is still to be written.
    const byteLimit = limits.maxBytes - 1_500_000;
    const tick = setInterval(() => {
      setElapsed(recorder.elapsedMs);
      if (
        recorder.elapsedMs >= limits.maxSeconds * 1000 ||
        recorder.size >= byteLimit
      )
        void finishRef.current();
    }, 250);
    const clock = timers.current;
    // The provider cancels a recorder whose session goes away unfinished.
    return () => {
      current = false;
      stopListening();
      clearInterval(tick);
      clearTimeout(clock.fade);
      clearTimeout(clock.clear);
    };
  }, [recorder, limits.maxSeconds, limits.maxBytes]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      setConfirmDiscard(false);
      setTool("pointer");
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!confirmDiscard) return;
    const timer = setTimeout(() => setConfirmDiscard(false), 3000);
    return () => clearTimeout(timer);
  }, [confirmDiscard]);

  // Drawing again, even while the marks fade, keeps them all and restarts the wait.
  const keep = () => {
    clearTimeout(timers.current.fade);
    clearTimeout(timers.current.clear);
    setFading(false);
  };
  const scheduleFade = () => {
    keep();
    timers.current.fade = setTimeout(() => {
      setFading(true);
      timers.current.clear = setTimeout(() => {
        setMarks([]);
        setFading(false);
      }, fadeMs);
    }, fadeAfterMs);
  };
  const clear = () => {
    keep();
    setMarks([]);
    setDraft(null);
  };

  const point = (event: ReactPointerEvent): Point => ({
    x: event.clientX,
    y: event.clientY,
  });
  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (tool === "pointer" || event.button !== 0 || drawing.current !== null)
      return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = event.pointerId;
    keep();
    const at = point(event);
    setDraft(
      tool === "pen" ? { tool, points: [at] } : { tool, from: at, to: at },
    );
  };
  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (drawing.current !== event.pointerId) return;
    const events =
      typeof event.nativeEvent.getCoalescedEvents === "function"
        ? event.nativeEvent.getCoalescedEvents()
        : [];
    const points = events.length
      ? events.map((each) => ({ x: each.clientX, y: each.clientY }))
      : [point(event)];
    const current = draftRef.current;
    if (!current) return;
    setDraft(
      current.tool === "pen"
        ? { tool: "pen", points: [...current.points, ...points] }
        : { ...current, to: points[points.length - 1] ?? current.to },
    );
  };
  const onPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (drawing.current !== event.pointerId) return;
    drawing.current = null;
    const mark = draftRef.current;
    if (mark && visible(mark)) setMarks((current) => [...current, mark]);
    setDraft(null);
    scheduleFade();
  };

  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const rect = bar.current?.getBoundingClientRect();
    if (!rect || event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const origin = { x: event.clientX, y: event.clientY };
    const start = offset;
    const margin = 8;
    const move = (moveEvent: PointerEvent) => {
      const dx = clamp(
        moveEvent.clientX - origin.x,
        margin - rect.left,
        window.innerWidth - margin - rect.right,
      );
      const dy = clamp(
        moveEvent.clientY - origin.y,
        margin - rect.top,
        window.innerHeight - margin - rect.bottom,
      );
      setOffset({ x: start.x + dx, y: start.y + dy });
    };
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  };

  const tools: readonly {
    readonly tool: Tool;
    readonly label: string;
    readonly icon: ReactElement;
  }[] = [
    { tool: "pointer", label: labels.recordingPointer, icon: <PointerIcon /> },
    { tool: "pen", label: labels.recordingPen, icon: <PenIcon /> },
    { tool: "arrow", label: labels.editorArrow, icon: <ArrowIcon /> },
    { tool: "rectangle", label: labels.editorRectangle, icon: <RectIcon /> },
    { tool: "oval", label: labels.editorOval, icon: <OvalIcon /> },
  ];
  const nearLimit = elapsed >= (limits.maxSeconds - 30) * 1000;
  const micLabel =
    microphone !== "on"
      ? labels.recordingNoMicrophone
      : muted
        ? labels.recordingUnmute
        : labels.recordingMute;

  return (
    <div className="recording">
      <svg
        className="recording-canvas"
        data-drawing={tool !== "pointer" || undefined}
        aria-hidden="true"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <g className="recording-marks" data-fading={fading || undefined}>
          {marks.map((mark, index) => (
            // Marks are only ever appended or cleared together.
            // biome-ignore lint/suspicious/noArrayIndexKey: stable positions
            <MarkShape key={index} mark={mark} />
          ))}
          {draft && <MarkShape mark={draft} />}
        </g>
      </svg>
      <div
        ref={bar}
        className="recording-bar"
        role="toolbar"
        aria-label={labels.recordingTools}
        style={{ translate: `${offset.x}px ${offset.y}px` }}
      >
        <button
          className="recording-grip"
          type="button"
          aria-label={labels.recordingMove}
          title={labels.recordingMove}
          tabIndex={-1}
          onPointerDown={startDrag}
        >
          <GripIcon />
        </button>
        <span
          className="recording-time"
          data-near-limit={nearLimit || undefined}
          role="timer"
          aria-label={labels.recordingElapsed(formatDuration(elapsed))}
        >
          <span className="recording-dot" aria-hidden="true" />
          {formatDuration(elapsed)}
        </span>
        <span className="recording-divider" aria-hidden="true" />
        {tools.map(({ tool: value, label, icon }, index) => (
          <button
            key={value}
            ref={index === 0 ? firstTool : undefined}
            type="button"
            aria-label={label}
            title={label}
            aria-pressed={tool === value}
            onClick={() => setTool(value)}
          >
            {icon}
          </button>
        ))}
        <button
          type="button"
          aria-label={labels.recordingClear}
          title={labels.recordingClear}
          disabled={marks.length === 0}
          onClick={clear}
        >
          <ClearIcon />
        </button>
        <span className="recording-divider" aria-hidden="true" />
        <button
          type="button"
          aria-label={micLabel}
          title={micLabel}
          aria-pressed={microphone === "on" ? muted : undefined}
          disabled={microphone !== "on"}
          data-muted={microphone !== "on" || muted || undefined}
          onClick={() => {
            recorder.setMuted(!muted);
            setMuted(!muted);
          }}
        >
          {microphone === "on" && !muted ? <MicIcon /> : <MicOffIcon />}
        </button>
        <button
          className="recording-discard"
          type="button"
          aria-label={confirmDiscard ? undefined : labels.recordingDiscard}
          title={labels.recordingDiscard}
          data-confirm={confirmDiscard || undefined}
          disabled={finishing}
          onClick={() => {
            if (!confirmDiscard) return setConfirmDiscard(true);
            settled.current = true;
            recorder.cancel();
            onDiscard();
          }}
        >
          {confirmDiscard ? labels.recordingConfirmDiscard : <TrashIcon />}
        </button>
        <button
          className="recording-finish"
          type="button"
          disabled={finishing}
          onClick={() => void finish()}
        >
          <span className="recording-stop" aria-hidden="true" />
          {labels.recordingFinish}
        </button>
      </div>
    </div>
  );
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

function visible(mark: Mark): boolean {
  if (mark.tool === "pen") return mark.points.length > 1;
  return Math.hypot(mark.to.x - mark.from.x, mark.to.y - mark.from.y) >= 6;
}

function MarkShape({ mark }: { readonly mark: Mark }): ReactElement | null {
  if (mark.tool === "pen")
    return (
      <path
        d={mark.points
          .map(({ x, y }, index) => `${index ? "L" : "M"}${x} ${y}`)
          .join("")}
      />
    );
  const { from, to } = mark;
  if (mark.tool === "rectangle")
    return (
      <rect
        x={Math.min(from.x, to.x)}
        y={Math.min(from.y, to.y)}
        width={Math.abs(to.x - from.x)}
        height={Math.abs(to.y - from.y)}
        rx="6"
      />
    );
  if (mark.tool === "oval")
    return (
      <ellipse
        cx={(from.x + to.x) / 2}
        cy={(from.y + to.y) / 2}
        rx={Math.abs(to.x - from.x) / 2}
        ry={Math.abs(to.y - from.y) / 2}
      />
    );
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const head = Math.min(22, Math.hypot(to.x - from.x, to.y - from.y) / 2);
  const wing = (turn: number) =>
    `${to.x - head * Math.cos(angle + turn)} ${to.y - head * Math.sin(angle + turn)}`;
  return (
    <path
      d={`M${from.x} ${from.y}L${to.x} ${to.y}M${wing(0.5)}L${to.x} ${to.y}L${wing(-0.5)}`}
    />
  );
}

function Icon({
  children,
}: {
  readonly children: ReactElement | ReactElement[];
}) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}
const PointerIcon = () => (
  <Icon>
    <path d="M5 3.5 15 9.2l-4.4 1.2-2.2 4.2Z" />
  </Icon>
);
const PenIcon = () => (
  <Icon>
    <path d="M3.5 14.5c2.2-4.6 4.6-6.9 6.2-6.3 1.8.7-1.2 4.8.6 5.4 1.3.4 3-1.5 4.9-4.1" />
  </Icon>
);
const ArrowIcon = () => (
  <Icon>
    <path d="M4.5 15.5 15 5M8.5 5H15v6.5" />
  </Icon>
);
const RectIcon = () => (
  <Icon>
    <rect x="3.5" y="5" width="13" height="10" rx="1.8" />
  </Icon>
);
const OvalIcon = () => (
  <Icon>
    <ellipse cx="10" cy="10" rx="6.5" ry="6.5" />
  </Icon>
);
const ClearIcon = () => (
  <Icon>
    <path d="m8.2 16.5-4.3-4.3a1.4 1.4 0 0 1 0-2L10.6 3.5a1.4 1.4 0 0 1 2 0l3.9 3.9a1.4 1.4 0 0 1 0 2L9.4 16.5ZM6.8 8.2l5 5M8.2 16.5H16" />
  </Icon>
);
const MicIcon = () => (
  <Icon>
    <rect x="7.5" y="2.8" width="5" height="9" rx="2.5" />
    <path d="M4.8 9.6a5.2 5.2 0 0 0 10.4 0M10 14.8v2.6" />
  </Icon>
);
const MicOffIcon = () => (
  <Icon>
    <path d="M12.5 8.3V5.3a2.5 2.5 0 0 0-4.8-1M7.5 7.7v1.8a2.5 2.5 0 0 0 4.1 1.9M4.8 9.6a5.2 5.2 0 0 0 8.6 3.9M15.2 9.6a5 5 0 0 1-.3 1.7M10 14.8v2.6M3.5 3.5l13 13" />
  </Icon>
);
const TrashIcon = () => (
  <Icon>
    <path d="M4 5.8h12M8 5.8V4.2h4v1.6M5.6 5.8l.7 10.2c0 .6.5 1 1.1 1h5.2c.6 0 1-.4 1.1-1l.7-10.2" />
  </Icon>
);
const GripIcon = () => (
  <svg
    viewBox="0 0 8 14"
    width="8"
    height="14"
    aria-hidden="true"
    focusable="false"
  >
    {[2, 7, 12].flatMap((y) =>
      [2, 6].map((x) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1.2" fill="currentColor" />
      )),
    )}
  </svg>
);
