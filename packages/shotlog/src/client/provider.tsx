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
import {
  DeliveryFailed,
  type ShotlogError,
  ValidationFailed,
} from "../errors.js";
import { getShortId } from "../short-id.js";
import type { SupportLogSubmission } from "../types.js";
import {
  acquireDiagnostics,
  getDiagnostics,
  trimDiagnostics,
} from "./diagnostics.js";
import { captureEnvironment } from "./environment.js";
import { type IncludedContext, IncludedDetails } from "./included-details.js";
import { defaultLabels, errorMessage, typeValue } from "./labels.js";
import { type Draft, ReportCard } from "./report-card.js";
import { ScreenshotControls } from "./screenshot-controls.js";
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
type Identity = Pick<SupportLogSubmission, "id" | "shortId" | "createdAt"> & {
  readonly attempted?: true;
};
type Status =
  | { readonly tag: "idle" | "sending" }
  | { readonly tag: "sent"; readonly result: ShotlogSubmitResult }
  | { readonly tag: "error"; readonly error: ShotlogError };

/**
 * Mounts one isolated support widget while leaving the Host App in control of visibility.
 * Safe to render on the server; the shadow host is created after mounting.
 * The widget contains its keyboard events, but capture-phase listeners the Host App
 * registered earlier still see them: ignore events whose `composedPath()` includes the
 * `[data-shotlog]` host.
 * @example
 * ```tsx
 * import { ShotlogProvider } from "shotlog";
 * function Support({ isAdmin }: { isAdmin: boolean }) {
 *   return <ShotlogProvider endpoint="/api/support" enabled={isAdmin} theme="auto" />;
 * }
 * ```
 * @public
 */
export function ShotlogProvider({
  children,
  endpoint,
  onSubmit,
  enabled = true,
  draftScope,
  persistDraft = true,
  launcher = true,
  position = "bottom-right",
  theme = "auto",
  accent,
  types = defaultTypes,
  labels: overrides,
  reporter,
  metadata,
  diagnostics,
  shortcut,
  onSubmitted,
  onError,
}: ShotlogProviderProps): ReactElement {
  const draftKey =
    draftScope === undefined ? "shotlog:draft" : `shotlog:draft:${draftScope}`;
  const firstType = typeValue(types[0] ?? "Bug");
  const [scope, setScope] = useState(draftKey);
  // Fence asynchronous work when a scope is replaced or explicitly cleared.
  const draftEpoch = useRef(0);
  const epoch = draftEpoch.current;
  const labels = { ...defaultLabels, ...overrides };
  const recordConsole =
    enabled && diagnostics !== false && diagnostics?.console !== false;
  const recordNetwork =
    enabled && diagnostics !== false && diagnostics?.network !== false;
  useEffect(
    () =>
      acquireDiagnostics(endpoint, {
        console: recordConsole,
        network: recordNetwork,
      }),
    [endpoint, recordConsole, recordNetwork],
  );
  const collectContext = useCallback(async (): Promise<IncludedContext> => {
    const [resolvedReporter, resolvedMetadata] = await Promise.all([
      typeof reporter === "function" ? reporter() : reporter,
      typeof metadata === "function" ? metadata() : metadata,
    ]);
    return {
      environment: captureEnvironment(),
      ...(resolvedReporter === undefined ? {} : { reporter: resolvedReporter }),
      ...(resolvedMetadata === undefined ? {} : { metadata: resolvedMetadata }),
    };
  }, [reporter, metadata]);
  const [root, setRoot] = useState<ShadowRoot | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>({
    type: firstType,
    description: "",
  });
  const latestDraft = useRef(draft);
  latestDraft.current = draft;
  // Screenshots never enter the persisted text draft.
  const [screenshot, setScreenshot] = useState<Blob>();
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState("");
  const captureOwner = useRef<object | null>(null);
  const acquireCapture = useCallback(() => {
    if (draftEpoch.current !== epoch || captureOwner.current) return undefined;
    const operation = {};
    captureOwner.current = operation;
    setCapturing(true);
    return () => {
      if (captureOwner.current !== operation) return;
      captureOwner.current = null;
      setCapturing(false);
    };
  }, [epoch]);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<Status>({ tag: "idle" });
  // Kept with the draft so a retry after a lost response, even after a reload, reuses the
  // same id and the relay dedupes it. Editing after an attempt starts a new identity.
  const identity = useRef<Identity | null>(null);
  const ensureIdentity = useCallback((): Identity => {
    if (!identity.current) {
      const id = randomId();
      identity.current = {
        id,
        shortId: getShortId(id),
        createdAt: new Date().toISOString(),
      };
    }
    return identity.current;
  }, []);
  const persist = useCallback(
    (next: Draft) => {
      if (!persistDraft || draftEpoch.current !== epoch) return;
      try {
        if (!next.description && !identity.current) {
          sessionStorage.removeItem(draftKey);
          return;
        }
        sessionStorage.setItem(
          draftKey,
          JSON.stringify({ ...next, identity: identity.current }),
        );
      } catch {
        /* In-memory drafts remain available. */
      }
    },
    [draftKey, persistDraft, epoch],
  );
  const opener = useRef<HTMLElement | null>(null);
  const sending = useRef(false);
  const resetDraft = useCallback(() => {
    draftEpoch.current++;
    identity.current = null;
    sending.current = false;
    captureOwner.current = null;
    setCapturing(false);
    setCaptureError("");
    setScreenshot(undefined);
    const empty = { type: firstType, description: "" };
    latestDraft.current = empty;
    setDraft(empty);
    setStatus({ tag: "idle" });
  }, [firstType]);
  const clearDraft = useCallback(() => {
    resetDraft();
    try {
      sessionStorage.removeItem(draftKey);
    } catch {
      /* Session storage can be unavailable. */
    }
  }, [draftKey, resetDraft]);
  const close = useCallback(() => setIsOpen(false), []);
  const open = useCallback(() => {
    if (!enabled || isOpen || typeof document === "undefined") return;
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement)
      active = active.shadowRoot.activeElement;
    opener.current = active instanceof HTMLElement ? active : null;
    if (!identity.current) setStatus({ tag: "idle" });
    ensureIdentity();
    setIsOpen(true);
  }, [enabled, isOpen, ensureIdentity]);
  const controls = useMemo(
    () => ({ open, close, clearDraft, isOpen: enabled && isOpen }),
    [open, close, clearDraft, enabled, isOpen],
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
    if (loaded) return;
    try {
      const saved: unknown = JSON.parse(
        (persistDraft ? sessionStorage.getItem(draftKey) : null) ?? "null",
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
        if ("identity" in saved && isIdentity(saved.identity))
          identity.current = saved.identity;
      }
    } catch {
      /* Session storage can be unavailable in private or embedded contexts. */
    }
    setLoaded(true);
  }, [draftKey, loaded, persistDraft]);

  useEffect(() => {
    if (!loaded) return;
    if (status.tag !== "sent") persist(draft);
  }, [draft, loaded, status.tag, persist]);

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

  // Reset before React commits children or runs persistence effects for the new scope.
  if (scope !== draftKey) {
    setScope(draftKey);
    resetDraft();
    setLoaded(false);
  }

  const selectedType = types.some((option) => typeValue(option) === draft.type)
    ? draft.type
    : firstType;
  const submit = async () => {
    if (
      sending.current ||
      draftEpoch.current !== epoch ||
      captureOwner.current ||
      !enabled ||
      status.tag === "sent"
    )
      return;
    const current = ensureIdentity();
    identity.current = { ...current, attempted: true };
    persist(draft);
    sending.current = true;
    setStatus({ tag: "sending" });
    let log: SupportLogSubmission;
    try {
      const context = await collectContext();
      if (draftEpoch.current !== epoch) return;
      const trail = getDiagnostics();
      log = {
        schemaVersion: 1,
        id: current.id,
        shortId: current.shortId,
        createdAt: current.createdAt,
        type: selectedType,
        description: draft.description,
        ...context,
        ...(recordConsole || recordNetwork
          ? {
              diagnostics: trimDiagnostics({
                console: recordConsole ? trail.console : [],
                network: recordNetwork ? trail.network : [],
              }),
            }
          : {}),
      };
    } catch (cause) {
      if (draftEpoch.current !== epoch) return;
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
      if (endpoint !== undefined)
        result = await submitReport(endpoint, log, screenshot);
      else {
        await onSubmit({ log, ...(screenshot ? { screenshot } : {}) });
        result = { id: log.id, shortId: log.shortId, duplicate: false };
      }
    } catch (cause) {
      if (draftEpoch.current !== epoch) return;
      const error = isShotlogError(cause)
        ? cause
        : new DeliveryFailed("custom", undefined, { cause });
      sending.current = false;
      setStatus({ tag: "error", error });
      onError?.(error);
      return;
    }
    if (draftEpoch.current !== epoch) return;
    sending.current = false;
    identity.current = null;
    setScreenshot(undefined);
    setDraft({ type: firstType, description: "" });
    setStatus({ tag: "sent", result });
    try {
      if (persistDraft) sessionStorage.removeItem(draftKey);
    } catch {
      /* Session storage can be unavailable. */
    }
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
                key={epoch}
                draft={{ ...draft, type: selectedType }}
                types={types}
                labels={labels}
                state={status.tag}
                message={message}
                opener={opener.current}
                capturing={capturing}
                screenshotControls={
                  <ScreenshotControls
                    host={root.host as HTMLElement}
                    screenshot={screenshot}
                    labels={labels}
                    locked={status.tag === "sending" || status.tag === "sent"}
                    busy={capturing}
                    error={captureError}
                    onError={(error) => {
                      if (draftEpoch.current === epoch) setCaptureError(error);
                    }}
                    acquireCapture={acquireCapture}
                    onChange={(next) => {
                      if (draftEpoch.current !== epoch) return;
                      if (identity.current?.attempted) identity.current = null;
                      setScreenshot(next);
                      // Persist the changed identity, never the image.
                      persist(latestDraft.current);
                    }}
                  />
                }
                includedDetails={
                  <IncludedDetails
                    labels={labels}
                    collectContext={collectContext}
                    consoleEnabled={recordConsole}
                    networkEnabled={recordNetwork}
                  />
                }
                onClose={close}
                onChange={(next) => {
                  if (draftEpoch.current !== epoch) return;
                  // The attempt may have been delivered, including before a reload.
                  if (identity.current?.attempted) identity.current = null;
                  latestDraft.current = next;
                  setDraft(next);
                }}
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

function isIdentity(value: unknown): value is Identity {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "shortId" in value &&
    typeof value.shortId === "string" &&
    "createdAt" in value &&
    typeof value.createdAt === "string" &&
    (!("attempted" in value) || value.attempted === true)
  );
}

function isShotlogError(value: unknown): value is ShotlogError {
  return (
    value instanceof Error &&
    "_tag" in value &&
    typeof value._tag === "string" &&
    value._tag in defaultErrorTags
  );
}

const defaultErrorTags: Record<ShotlogError["_tag"], true> = {
  Unauthorized: true,
  Forbidden: true,
  RateLimited: true,
  PayloadTooLarge: true,
  ValidationFailed: true,
  DeliveryFailed: true,
  UploadFailed: true,
  Offline: true,
  ProviderNotInstalled: true,
  UnsupportedRuntime: true,
};

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
 * import { useShotlog } from "shotlog";
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
