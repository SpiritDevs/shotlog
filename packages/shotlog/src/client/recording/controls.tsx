import { type ReactElement, useEffect, useRef, useState } from "react";
import { formatDuration } from "../../internal/duration.js";
import type { RecordingLimits } from "../../internal/wire.js";
import type { ShotlogLabels } from "../types.js";
import type { RecordedVideo } from "./recorder.js";

interface RecordingControlsProps {
  readonly labels: ShotlogLabels;
  readonly limits: RecordingLimits;
  readonly recording: RecordedVideo | undefined;
  readonly locked: boolean;
  readonly busy: boolean;
  /** True while the Reporter is recording; the card is out of the way. */
  readonly active: boolean;
  readonly error: string;
  /** Must run synchronously in the click, for the browser's screen picker. */
  readonly onStart: () => void;
  readonly onRemove: () => void;
}

export function RecordingControls({
  labels,
  limits,
  recording,
  locked,
  busy,
  active,
  error,
  onStart,
  onRemove,
}: RecordingControlsProps): ReactElement {
  const trigger = useRef<HTMLButtonElement>(null);
  const wasActive = useRef(active);
  const [preview, setPreview] = useState<string>();

  // The card comes back after recording; focus returns to where the Reporter left it.
  useEffect(() => {
    if (wasActive.current && !active) trigger.current?.focus();
    wasActive.current = active;
  }, [active]);

  useEffect(() => {
    if (!recording) return setPreview(undefined);
    const url = URL.createObjectURL(recording.blob);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [recording]);

  return (
    <div className="recording-controls">
      <div className="attachment" data-attached={recording ? "true" : "false"}>
        {recording ? (
          <>
            {preview && (
              <video
                className="screenshot-preview"
                src={`${preview}#t=0.1`}
                muted
                playsInline
                preload="metadata"
              />
            )}
            <span className="attachment-title">
              {labels.recording}
              <span className="attachment-meta">
                {formatDuration(recording.durationMs)}
              </span>
            </span>
            <div className="attachment-actions">
              <button
                ref={trigger}
                className="quiet"
                type="button"
                disabled={locked || busy}
                onClick={onRemove}
              >
                {labels.removeRecording}
              </button>
            </div>
          </>
        ) : (
          <button
            ref={trigger}
            className="attachment-main"
            type="button"
            disabled={locked || busy}
            onClick={onStart}
          >
            <RecordIcon />
            {labels.recordScreen}
            <span className="attachment-meta">
              {labels.recordingLimit(limits.maxSeconds)}
            </span>
          </button>
        )}
      </div>
      <div
        className="capture-status"
        data-error={error ? "true" : "false"}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {error}
      </div>
    </div>
  );
}

function RecordIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 20 20"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="10" cy="10" r="7" />
      <circle cx="10" cy="10" r="3" fill="currentColor" stroke="none" />
    </svg>
  );
}
