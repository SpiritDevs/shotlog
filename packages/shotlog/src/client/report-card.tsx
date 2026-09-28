import { useEffect, useId, useRef } from "react";
import type { ShotlogLabels } from "./types.js";

export interface Draft {
  readonly type: string;
  readonly description: string;
}

interface ReportCardProps {
  readonly draft: Draft;
  readonly types: readonly string[];
  readonly customTypes: boolean;
  readonly labels: ShotlogLabels;
  readonly state: "idle" | "sending" | "sent" | "error";
  readonly message: string;
  readonly opener: HTMLElement | null;
  readonly onClose: () => void;
  readonly onChange: (draft: Draft) => void;
  readonly onSubmit: () => void;
}

export function ReportCard({
  draft,
  types,
  customTypes,
  labels,
  state,
  message,
  opener,
  onClose,
  onChange,
  onSubmit,
}: ReportCardProps) {
  const id = useId();
  const card = useRef<HTMLDivElement>(null);
  const description = useRef<HTMLTextAreaElement>(null);
  const locked = state === "sending" || state === "sent";
  const defaultTypeLabels: Record<string, string> = {
    Bug: labels.bug,
    Question: labels.question,
    Idea: labels.idea,
  };

  useEffect(() => {
    const dialog = card.current;
    if (!dialog) return;
    const root = dialog.getRootNode() as ShadowRoot;
    const focusables = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          "button:not(:disabled), textarea:not(:disabled), input:not(:disabled):checked",
        ),
      );
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
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocus, true);
      if (opener?.isConnected) opener.focus();
    };
  }, [onClose, opener]);

  useEffect(() => {
    const dialog = card.current;
    if (!dialog || !locked) return;
    const active = (dialog.getRootNode() as ShadowRoot).activeElement;
    if (!active || active.matches(":disabled"))
      dialog.querySelector<HTMLButtonElement>("button")?.focus();
  }, [locked]);

  return (
    <div className="backdrop">
      <div
        ref={card}
        className="card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        tabIndex={-1}
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
                d="m3 3 10 10M13 3 3 13"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
          </button>
        </div>
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
            onSubmit();
          }}
        >
          {types.length > 0 && (
            <fieldset disabled={locked}>
              <legend>{labels.type}</legend>
              <div className="chips">
                {types.map((type) => (
                  <label className="chip" key={type}>
                    <input
                      type="radio"
                      name={`${id}-type`}
                      value={type}
                      checked={draft.type === type}
                      onChange={() => onChange({ ...draft, type })}
                    />
                    {customTypes ? type : defaultTypeLabels[type]}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <label className="description-label" htmlFor={`${id}-description`}>
            {labels.description}
          </label>
          <textarea
            ref={description}
            id={`${id}-description`}
            required
            maxLength={10000}
            disabled={locked}
            value={draft.description}
            onInvalid={(event) =>
              event.currentTarget.setCustomValidity(labels.descriptionRequired)
            }
            onChange={(event) => {
              event.currentTarget.setCustomValidity("");
              onChange({ ...draft, description: event.currentTarget.value });
            }}
          />
          <div data-shotlog-slot="screenshot" />
          <div data-shotlog-slot="included-details" />
          <button
            className="submit"
            type="submit"
            disabled={locked}
            aria-describedby={message ? `${id}-status` : undefined}
          >
            {state === "sending"
              ? labels.sending
              : state === "error"
                ? labels.retry
                : labels.submit}
          </button>
        </form>
        <div
          id={`${id}-status`}
          className="status"
          data-state={state}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {message}
        </div>
      </div>
    </div>
  );
}
