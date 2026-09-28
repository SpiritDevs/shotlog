import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  capturePage,
  captureScreen,
  imageToPng,
  supportsScreenCapture,
} from "./capture.js";
import type { EditableScreenshot } from "./editor/index.js";
import type { ShotlogLabels } from "./types.js";

// Weak keys follow the provider's in-memory attachment lifetime, including card reopen.
const editableScreenshots = new WeakMap<Blob, EditableScreenshot>();

interface ScreenshotControlsProps {
  readonly host: HTMLElement;
  readonly screenshot: Blob | undefined;
  readonly labels: ShotlogLabels;
  readonly locked: boolean;
  readonly onChange: (screenshot: Blob | undefined) => void;
  readonly busy: boolean;
  readonly error: string;
  readonly onError: (error: string) => void;
  readonly acquireCapture: () => (() => void) | undefined;
}

export function ScreenshotControls({
  host,
  screenshot,
  labels,
  locked,
  onChange,
  busy,
  error,
  onError: setError,
  acquireCapture,
}: ScreenshotControlsProps) {
  const id = useId();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [preview, setPreview] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const wasBusy = useRef(false);
  const mounted = useRef(false);
  const editorAbort = useRef<AbortController | null>(null);
  const screenSupported = supportsScreenCapture();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      editorAbort.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (wasBusy.current && !busy) trigger.current?.focus();
    wasBusy.current = busy;
  }, [busy]);

  useEffect(() => {
    if (!screenshot) {
      setPreview(undefined);
      return;
    }
    const url = URL.createObjectURL(screenshot);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [screenshot]);

  const attachScreenshot = useCallback(
    async (blob: Blob) => {
      const controller = new AbortController();
      editorAbort.current = controller;
      const { editScreenshot } = await import("./editor/index.js");
      if (!mounted.current || controller.signal.aborted) return;
      const previous = editableScreenshots.get(blob);
      const edited = await editScreenshot(
        previous?.original ?? blob,
        host,
        labels,
        controller.signal,
        previous?.scene,
      );
      editorAbort.current = null;
      if (mounted.current && edited) {
        editableScreenshots.delete(blob);
        editableScreenshots.set(edited.blob, edited);
        onChange(edited.blob);
      }
    },
    [host, labels, onChange],
  );

  const capture = useCallback(
    async (getImage: () => Promise<Blob | undefined>, failure: string) => {
      if (locked) return;
      const release = acquireCapture();
      if (!release) return;
      setOptionsOpen(false);
      setError("");
      try {
        const blob = await getImage();
        if (blob) await attachScreenshot(blob);
      } catch {
        setError(failure);
      } finally {
        release();
      }
    },
    [locked, acquireCapture, attachScreenshot, setError],
  );

  const upload = useCallback(
    (file: Blob) => void capture(() => imageToPng(file), labels.imageFailed),
    [capture, labels.imageFailed],
  );

  useEffect(() => {
    if (locked || busy) return;
    const paste = (event: ClipboardEvent) => {
      if (event.defaultPrevented) return;
      const items = Array.from(event.clipboardData?.items ?? []);
      const image = items.find((item) => item.type.startsWith("image/"));
      const file = image?.getAsFile();
      if (!file) return;
      event.preventDefault();
      upload(file);
    };
    document.addEventListener("paste", paste);
    return () => document.removeEventListener("paste", paste);
  }, [locked, busy, upload]);

  return (
    <div className="screenshot-controls">
      <div className="attachment" data-attached={screenshot ? "true" : "false"}>
        {screenshot ? (
          <>
            {preview && (
              <img
                className="screenshot-preview"
                src={preview}
                alt={labels.screenshotPreview}
              />
            )}
            <div className="attachment-actions">
              <button
                ref={trigger}
                className="quiet"
                type="button"
                disabled={locked || busy}
                onClick={() =>
                  void capture(
                    () => Promise.resolve(screenshot),
                    labels.editorFailed,
                  )
                }
              >
                {labels.editScreenshot}
              </button>
              <button
                className="quiet"
                type="button"
                disabled={locked || busy}
                onClick={() => {
                  setError("");
                  editableScreenshots.delete(screenshot);
                  onChange(undefined);
                }}
              >
                {labels.removeScreenshot}
              </button>
            </div>
          </>
        ) : (
          <>
            <button
              ref={trigger}
              className="attachment-main"
              type="button"
              disabled={locked || busy}
              onClick={() =>
                void capture(
                  () => capturePage(host),
                  screenSupported
                    ? labels.pageCaptureFailed
                    : labels.pageCaptureFailedWithoutScreen,
                )
              }
            >
              <CameraIcon />
              {busy ? labels.capturingScreenshot : labels.screenshot}
            </button>
            <button
              className="attachment-more"
              type="button"
              disabled={locked || busy}
              aria-label={labels.screenshotOptions}
              aria-expanded={optionsOpen}
              aria-controls={`${id}-options`}
              onClick={() => setOptionsOpen(!optionsOpen)}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                <path
                  d="m4.5 6.5 3.5 3.5 3.5-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </>
        )}
      </div>
      <div
        id={`${id}-options`}
        className="menu"
        hidden={!optionsOpen || locked || busy}
      >
        <button
          type="button"
          onClick={() =>
            void capture(
              () => capturePage(host),
              screenSupported
                ? labels.pageCaptureFailed
                : labels.pageCaptureFailedWithoutScreen,
            )
          }
        >
          {labels.capturePage}
        </button>
        {screenSupported && (
          <button
            type="button"
            onClick={() =>
              void capture(
                () => captureScreen(host),
                labels.screenCaptureFailed,
              )
            }
          >
            {labels.captureScreen}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setOptionsOpen(false);
            input.current?.click();
          }}
        >
          {labels.uploadImage}
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        aria-label={labels.uploadImage}
        hidden
        disabled={locked || busy}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) upload(file);
        }}
      />
      <div
        className="capture-status"
        data-error={error ? "true" : "false"}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {error || (busy ? labels.capturingScreenshot : "")}
      </div>
    </div>
  );
}

function CameraIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h2l1.2-1.6A1 1 0 0 1 8.5 4h3a1 1 0 0 1 .8.4L13.5 6h2A1.5 1.5 0 0 1 17 7.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5Z" />
      <circle cx="10" cy="11" r="2.75" />
    </svg>
  );
}
