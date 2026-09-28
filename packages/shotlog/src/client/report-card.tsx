import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useRef,
} from "react";
import {
  type CardSize,
  dragSize,
  keySize,
  resizeCorner,
  type SizeLimits,
} from "./card-size.js";
import { typeLabel, typeValue } from "./labels.js";
import type {
  ShotlogLabels,
  ShotlogPosition,
  ShotlogTypeOption,
} from "./types.js";

export interface Draft {
  readonly type: string;
  readonly description: string;
}

interface ReportCardProps {
  readonly draft: Draft;
  readonly types: readonly ShotlogTypeOption[];
  readonly labels: ShotlogLabels;
  readonly state: "idle" | "sending" | "sent" | "error";
  readonly message: string;
  readonly opener: HTMLElement | null;
  /** The Launcher the card grows out of and collapses back into. */
  readonly origin: RefObject<HTMLElement> | undefined;
  /** Where the card is anchored; the resize handle sits at the opposite corner. */
  readonly position: ShotlogPosition;
  /** A size the Reporter chose earlier; null keeps the default. */
  readonly size: CardSize | null;
  /** True while the card plays its exit animation before unmounting. */
  readonly closing: boolean;
  readonly includedDetails: ReactNode;
  readonly screenshotControls: ReactNode;
  readonly capturing: boolean;
  readonly onClose: () => void;
  readonly onClosed: () => void;
  readonly onChange: (draft: Draft) => void;
  readonly onSubmit: () => void;
  readonly onResize: (size: CardSize) => void;
}
interface Resizing {
  readonly pointerId: number;
  readonly origin: { readonly x: number; readonly y: number };
  readonly start: CardSize;
  readonly limits: SizeLimits;
  current: CardSize;
}

export function ReportCard({
  draft,
  types,
  labels,
  state,
  message,
  opener,
  origin,
  position,
  size,
  closing,
  includedDetails,
  screenshotControls,
  capturing,
  onClose,
  onClosed,
  onChange,
  onSubmit,
  onResize,
}: ReportCardProps) {
  const id = useId();
  const overlay = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement | null>(null);
  const description = useRef<HTMLTextAreaElement>(null);
  const resizing = useRef<Resizing | null>(null);
  const locked = state === "sending" || state === "sent";
  const corner = resizeCorner(position);

  // Runs during commit, before first paint, so the morph's first frame matches the Launcher.
  const attach = useCallback(
    (dialog: HTMLDivElement | null) => {
      card.current = dialog;
      const from = origin?.current;
      if (!dialog || !from) return;
      dialog.style.setProperty(
        "--_sx",
        String(from.offsetWidth / Math.max(1, dialog.offsetWidth)),
      );
      dialog.style.setProperty(
        "--_sy",
        String(from.offsetHeight / Math.max(1, dialog.offsetHeight)),
      );
    },
    [origin],
  );

  useEffect(() => {
    const dialog = card.current;
    if (!dialog || closing) return;
    const root = dialog.getRootNode() as ShadowRoot;
    const focusables = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          "button:not(:disabled), textarea:not(:disabled), input:not(:disabled):checked, summary, [tabindex='0']",
        ),
      ).filter((node) => node.getClientRects().length > 0);
    const focusFirst = () => (focusables()[0] ?? dialog).focus();
    if (description.current && !description.current.disabled)
      description.current.focus();
    else focusFirst();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      } else if (event.key === "Tab") {
        const nodes = focusables();
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (
          !dialog.contains(root.activeElement) ||
          (event.shiftKey
            ? root.activeElement === first
            : root.activeElement === last)
        ) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        }
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (!event.composedPath().includes(dialog)) focusFirst();
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocus, true);
    // Focus returns as soon as closing starts, so the collapsing card never traps it.
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocus, true);
      if (opener?.isConnected) opener.focus();
    };
  }, [onClose, opener, closing]);

  // Unmount once the exit animation ends; immediately when motion is reduced or unsupported.
  useEffect(() => {
    if (!closing) return;
    const node = overlay.current;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onClosed();
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
  }, [closing, onClosed]);

  useEffect(() => {
    const dialog = card.current;
    if (!dialog || !locked) return;
    const active = (dialog.getRootNode() as ShadowRoot).activeElement;
    if (!active || active.matches(":disabled"))
      dialog.querySelector<HTMLButtonElement>("button")?.focus();
  }, [locked]);

  /** The default size is the floor: measured with the chosen size removed, once per gesture. */
  const limitsFor = (dialog: HTMLDivElement): SizeLimits => {
    const width = dialog.style.getPropertyValue("--_card-w"),
      height = dialog.style.getPropertyValue("--_card-h");
    dialog.style.removeProperty("--_card-w");
    dialog.style.removeProperty("--_card-h");
    const min = { width: dialog.offsetWidth, height: dialog.offsetHeight };
    if (width) dialog.style.setProperty("--_card-w", width);
    if (height) dialog.style.setProperty("--_card-h", height);
    const offset =
      Number.parseFloat(
        getComputedStyle(dialog).getPropertyValue("--_offset"),
      ) || 24;
    return {
      min,
      max: {
        width: window.innerWidth - offset * 2,
        height: window.innerHeight - offset * 2,
      },
    };
  };
  const applySize = (dialog: HTMLDivElement, next: CardSize) => {
    dialog.style.setProperty("--_card-w", `${next.width}px`);
    dialog.style.setProperty("--_card-h", `${next.height}px`);
  };
  const sizeStyle = {
    "--_card-w": size ? `${size.width}px` : undefined,
    "--_card-h": size ? `${size.height}px` : undefined,
  } as CSSProperties;

  return (
    <div
      ref={overlay}
      className="overlay"
      data-state={closing ? "closing" : "open"}
      aria-hidden={closing || undefined}
    >
      <div
        ref={attach}
        className="card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        tabIndex={-1}
        data-corner={corner}
        style={sizeStyle}
      >
        <div className="heading">
          <h2 id={`${id}-title`}>{labels.title}</h2>
          <button
            className="close"
            type="button"
            onClick={onClose}
            aria-label={labels.close}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path
                d="m4 4 8 8M12 4l-8 8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        {/* Between Close and the form in tab order, so the trap's ends stay Close and Submit. */}
        <button
          className="resize"
          type="button"
          aria-label={labels.resizeCard}
          title={labels.resizeCard}
          onPointerDown={(event) => {
            const dialog = card.current;
            if (event.button !== 0 || resizing.current || !dialog) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            const limits = limitsFor(dialog);
            resizing.current = {
              pointerId: event.pointerId,
              origin: { x: event.clientX, y: event.clientY },
              start: { width: dialog.offsetWidth, height: dialog.offsetHeight },
              limits,
              current: {
                width: dialog.offsetWidth,
                height: dialog.offsetHeight,
              },
            };
          }}
          onPointerMove={(event) => {
            const gesture = resizing.current,
              dialog = card.current;
            if (!gesture || gesture.pointerId !== event.pointerId || !dialog)
              return;
            gesture.current = dragSize(
              position,
              gesture.start,
              {
                x: event.clientX - gesture.origin.x,
                y: event.clientY - gesture.origin.y,
              },
              gesture.limits,
            );
            applySize(dialog, gesture.current);
          }}
          onPointerUp={(event) => {
            const gesture = resizing.current;
            if (!gesture || gesture.pointerId !== event.pointerId) return;
            resizing.current = null;
            onResize(gesture.current);
          }}
          onPointerCancel={() => {
            const gesture = resizing.current,
              dialog = card.current;
            resizing.current = null;
            if (gesture && dialog) applySize(dialog, gesture.start);
          }}
          onKeyDown={(event) => {
            const dialog = card.current;
            if (!dialog || !event.key.startsWith("Arrow")) return;
            const next = keySize(
              position,
              { width: dialog.offsetWidth, height: dialog.offsetHeight },
              event.key,
              event.shiftKey ? 64 : 16,
              limitsFor(dialog),
            );
            if (!next) return;
            event.preventDefault();
            applySize(dialog, next);
            onResize(next);
          }}
        >
          <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
            <path
              d="M11 1 1 11M11 6 6 11"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <div className="card-body">
          <form
            hidden={state === "sent"}
            onSubmit={(event) => {
              event.preventDefault();
              if (!draft.description.trim()) {
                description.current?.setCustomValidity(
                  labels.descriptionRequired,
                );
                description.current?.reportValidity();
                return;
              }
              if (!capturing) onSubmit();
            }}
          >
            {types.length > 0 && (
              <fieldset disabled={locked}>
                <legend>{labels.type}</legend>
                <div className="chips">
                  {types.map((option) => (
                    <label className="chip" key={typeValue(option)}>
                      <input
                        type="radio"
                        name={`${id}-type`}
                        value={typeValue(option)}
                        checked={draft.type === typeValue(option)}
                        onChange={() =>
                          onChange({ ...draft, type: typeValue(option) })
                        }
                      />
                      {typeLabel(option, labels)}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <div className="field">
              <label htmlFor={`${id}-description`}>{labels.description}</label>
              <textarea
                ref={description}
                id={`${id}-description`}
                required
                maxLength={10000}
                disabled={locked}
                value={draft.description}
                onInvalid={(event) =>
                  event.currentTarget.setCustomValidity(
                    labels.descriptionRequired,
                  )
                }
                onChange={(event) => {
                  event.currentTarget.setCustomValidity("");
                  onChange({
                    ...draft,
                    description: event.currentTarget.value,
                  });
                }}
              />
            </div>
            <div data-shotlog-slot="screenshot">{screenshotControls}</div>
            <div data-shotlog-slot="included-details">{includedDetails}</div>
            <button
              className="submit"
              type="submit"
              disabled={locked || capturing}
              aria-describedby={message ? `${id}-status` : undefined}
            >
              {state === "sending" && (
                <span className="spinner" aria-hidden="true" />
              )}
              {state === "sending"
                ? labels.sending
                : state === "error"
                  ? labels.retry
                  : labels.submit}
            </button>
          </form>
          {state === "sent" && (
            <div className="success-mark" aria-hidden="true">
              <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
                <circle cx="24" cy="24" r="22" fill="none" />
                <path d="M15 24.5l6.5 6.5L33 18" fill="none" />
              </svg>
            </div>
          )}
          {/* The button already shows "Sending…"; the live region only announces it. */}
          <div
            id={`${id}-status`}
            className={state === "sending" ? "status sr-only" : "status"}
            data-state={state}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {message}
          </div>
        </div>
      </div>
    </div>
  );
}
