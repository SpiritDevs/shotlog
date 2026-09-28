import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  capturePage,
  captureScreen,
  imageToPng,
  supportsScreenCapture,
} from "./capture.js";
import type { ShotlogLabels } from "./types.js";

interface ScreenshotControlsProps {
  readonly host: HTMLElement;
  readonly screenshot: Blob | undefined;
  readonly labels: ShotlogLabels;
  readonly locked: boolean;
  readonly onChange: (screenshot: Blob | undefined) => void;
  readonly onBusyChange: (busy: boolean) => void;
}

export function ScreenshotControls({
  host,
  screenshot,
  labels,
  locked,
  onChange,
  onBusyChange,
}: ScreenshotControlsProps) {
  const id = useId();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pending = useRef(false);
  const wasBusy = useRef(false);
  const mounted = useRef(false);
  const screenSupported = supportsScreenCapture();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      onBusyChange(false);
    };
  }, [onBusyChange]);

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

  // M4 hand-off: insert `const edited = await edit(blob)` here before attaching.
  const attachScreenshot = useCallback(
    async (blob: Blob) => {
      if (mounted.current) onChange(blob);
    },
    [onChange],
  );

  const capture = useCallback(
    async (getImage: () => Promise<Blob | undefined>, failure: string) => {
      if (locked || pending.current) return;
      pending.current = true;
      setBusy(true);
      onBusyChange(true);
      setOptionsOpen(false);
      setError("");
      try {
        const blob = await getImage();
        if (blob) await attachScreenshot(blob);
      } catch {
        if (mounted.current) setError(failure);
      } finally {
        pending.current = false;
        if (mounted.current) {
          setBusy(false);
          onBusyChange(false);
        }
      }
    },
    [locked, onBusyChange, attachScreenshot],
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
      <div className="screenshot-row">
        {screenshot ? (
          <>
            {preview && (
              <img
                className="screenshot-preview"
                src={preview}
                alt={labels.screenshotPreview}
              />
            )}
            <button
              ref={trigger}
              type="button"
              disabled={locked || busy}
              onClick={() => {
                setError("");
                onChange(undefined);
              }}
            >
              {labels.removeScreenshot}
            </button>
          </>
        ) : (
          <>
            <button
              ref={trigger}
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
              {busy ? labels.capturingScreenshot : labels.screenshot}
            </button>
            <button
              type="button"
              disabled={locked || busy}
              aria-label={labels.screenshotOptions}
              aria-expanded={optionsOpen}
              aria-controls={`${id}-options`}
              onClick={() => setOptionsOpen(!optionsOpen)}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                <path
                  d="m4 6 4 4 4-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              </svg>
            </button>
          </>
        )}
      </div>
      <div
        id={`${id}-options`}
        className="screenshot-options"
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
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {error || (busy ? labels.capturingScreenshot : "")}
      </div>
    </div>
  );
}
