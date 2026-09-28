import {
  type CSSProperties,
  createContext,
  type ReactElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { type ShotlogError, ValidationFailed } from "../errors.js";
import { getShortId } from "../short-id.js";
import type { SupportLogSubmission } from "../types.js";
import { captureEnvironment } from "./environment.js";
import { defaultLabels, errorMessage } from "./labels.js";
import { type Draft, ReportCard } from "./report-card.js";
import { matchesShortcut } from "./shortcut.js";
import { styles } from "./styles.js";
import { submitReport } from "./submit.js";
import type {
  ShotlogControls,
  ShotlogProviderProps,
  ShotlogSubmitResult,
} from "./types.js";

const Context = createContext<ShotlogControls | null>(null);
const defaultTypes = ["Bug", "Question", "Idea"];
const draftKey = "shotlog:draft";
type Status =
  | { readonly tag: "idle" | "sending" }
  | { readonly tag: "sent"; readonly result: ShotlogSubmitResult }
  | { readonly tag: "error"; readonly error: ShotlogError };

/**
 * Mounts one isolated support widget while leaving the Host App in control of visibility.
 * Safe to render on the server; the shadow host is created after mounting.
 * @example
 * ```tsx
 * <ShotlogProvider endpoint="/api/support" enabled={isAdmin} theme="auto">
 *   <App />
 * </ShotlogProvider>
 * ```
 * @public
 */
export function ShotlogProvider({
  children,
  endpoint,
  enabled = true,
  launcher = true,
  position = "bottom-right",
  theme = "auto",
  accent,
  types = defaultTypes,
  labels: overrides,
  reporter,
  metadata,
  shortcut,
  onSubmitted,
  onError,
}: ShotlogProviderProps): ReactElement {
  const labels = { ...defaultLabels, ...overrides };
  const [root, setRoot] = useState<ShadowRoot | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>({
    type: types[0] ?? "Bug",
    description: "",
  });
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<Status>({ tag: "idle" });
  const identity = useRef<Pick<
    SupportLogSubmission,
    "id" | "shortId" | "createdAt"
  > | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const sending = useRef(false);
  const close = useCallback(() => setIsOpen(false), []);
  const open = useCallback(() => {
    if (!enabled || isOpen || typeof document === "undefined") return;
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement)
      active = active.shadowRoot.activeElement;
    opener.current = active instanceof HTMLElement ? active : null;
    if (!identity.current) {
      const id = randomId();
      identity.current = {
        id,
        shortId: getShortId(id),
        createdAt: new Date().toISOString(),
      };
      setStatus({ tag: "idle" });
    }
    setIsOpen(true);
  }, [enabled, isOpen]);
  const controls = useMemo(
    () => ({ open, close, isOpen: enabled && isOpen }),
    [open, close, enabled, isOpen],
  );

  useEffect(() => {
    if (!enabled) {
      close();
      return;
    }
    const host = document.createElement("div");
    host.setAttribute("data-shotlog", "");
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = styles;
    shadow.append(style);
    document.body.append(host);
    setRoot(shadow);
    return () => {
      host.remove();
      setRoot(null);
    };
  }, [enabled, close]);

  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(
        sessionStorage.getItem(draftKey) ?? "null",
      );
      if (
        typeof saved === "object" &&
        saved !== null &&
        "type" in saved &&
        typeof saved.type === "string" &&
        "description" in saved &&
        typeof saved.description === "string"
      ) {
        setDraft({ type: saved.type, description: saved.description });
      }
    } catch {
      /* Session storage can be unavailable in private or embedded contexts. */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      if (status.tag === "sent") sessionStorage.removeItem(draftKey);
      else sessionStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      /* In-memory drafts remain available. */
    }
  }, [draft, loaded, status.tag]);

  useEffect(() => {
    if (status.tag !== "sent") return;
    const timer = setTimeout(close, 3000);
    return () => clearTimeout(timer);
  }, [status, close]);

  useEffect(() => {
    if (!enabled || !shortcut) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing) return;
      const path = event.composedPath();
      const inside = root !== null && path.includes(root);
      if (
        !inside &&
        path.some(
          (node) =>
            node instanceof HTMLElement &&
            (node.matches("input, textarea, select") || node.isContentEditable),
        )
      )
        return;
      if (matchesShortcut(event, shortcut)) {
        event.preventDefault();
        open();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enabled, shortcut, root, open]);

  const selectedType = types.includes(draft.type)
    ? draft.type
    : (types[0] ?? "Bug");
  const submit = async () => {
    if (
      sending.current ||
      !identity.current ||
      !enabled ||
      status.tag === "sent"
    )
      return;
    sending.current = true;
    setStatus({ tag: "sending" });
    let log: SupportLogSubmission;
    try {
      const [resolvedReporter, resolvedMetadata] = await Promise.all([
        typeof reporter === "function" ? reporter() : reporter,
        typeof metadata === "function" ? metadata() : metadata,
      ]);
      log = {
        schemaVersion: 1,
        ...identity.current,
        type: selectedType,
        description: draft.description,
        environment: captureEnvironment(),
        ...(resolvedReporter === undefined
          ? {}
          : { reporter: resolvedReporter }),
        ...(resolvedMetadata === undefined
          ? {}
          : { metadata: resolvedMetadata }),
      };
    } catch (cause) {
      const error = new ValidationFailed(
        ["Could not collect Environment or Host Context"],
        undefined,
        { cause },
      );
      sending.current = false;
      setStatus({ tag: "error", error });
      onError?.(error);
      return;
    }
    let result: ShotlogSubmitResult;
    try {
      result = await submitReport(endpoint, log);
    } catch (cause) {
      const error = cause as ShotlogError;
      sending.current = false;
      setStatus({ tag: "error", error });
      onError?.(error);
      return;
    }
    sending.current = false;
    identity.current = null;
    setDraft({ type: types[0] ?? "Bug", description: "" });
    setStatus({ tag: "sent", result });
    onSubmitted?.(result);
  };
  const message =
    status.tag === "sending"
      ? labels.sending
      : status.tag === "sent"
        ? labels.sent(status.result.shortId)
        : status.tag === "error"
          ? errorMessage(status.error, labels)
          : "";
  const themeStyle: CSSProperties & { "--shotlog-accent"?: string } = accent
    ? { "--shotlog-accent": accent }
    : {};

  return (
    <Context.Provider value={controls}>
      {children}
      {enabled &&
        root &&
        createPortal(
          <div
            className="shotlog"
            data-theme={theme}
            data-position={position}
            data-mode={launcher ? "standalone" : "programmatic"}
            style={themeStyle}
          >
            {launcher && (
              <button
                className="launcher"
                type="button"
                onClick={open}
                aria-label={labels.launcher}
                aria-haspopup="dialog"
                hidden={isOpen}
              >
                {labels.launcher}
              </button>
            )}
            {isOpen && (
              <ReportCard
                draft={{ ...draft, type: selectedType }}
                types={types}
                customTypes={types !== defaultTypes}
                labels={labels}
                state={status.tag}
                message={message}
                opener={opener.current}
                onClose={close}
                onChange={setDraft}
                onSubmit={() => {
                  void submit();
                }}
              />
            )}
          </div>,
          root,
        )}
    </Context.Provider>
  );
}

/** `crypto.randomUUID` only exists in secure contexts; plain-HTTP intranet apps need the fallback. */
function randomId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

/**
 * Controls the nearest provider's Report Card. Must be called inside ShotlogProvider.
 * @example
 * ```tsx
 * function HelpButton() {
 *   const { open } = useShotlog();
 *   return <button onClick={open}>Get help</button>;
 * }
 * ```
 * @public
 */
export function useShotlog(): ShotlogControls {
  const controls = useContext(Context);
  if (!controls)
    throw new Error("useShotlog must be used inside ShotlogProvider");
  return controls;
}
