import {
  type ComponentType,
  type CSSProperties,
  createContext,
  forwardRef,
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
  UploadFailed,
  ValidationFailed,
} from "../errors.js";
import type { RecordingLimits, RecordingPart } from "../internal/wire.js";
import { getShortId } from "../short-id.js";
import type { SupportLogSubmission } from "../types.js";
import type { CardSize } from "./card-size.js";
import {
  acquireDiagnostics,
  getDiagnostics,
  trimDiagnostics,
} from "./diagnostics.js";
import { captureEnvironment } from "./environment.js";
import { type IncludedContext, IncludedDetails } from "./included-details.js";
import { defaultLabels, errorMessage, typeValue } from "./labels.js";
import { RecordingControls } from "./recording/controls.js";
import {
  type RecordedVideo,
  type Recorder,
  requestRecording,
  supportsRecording,
} from "./recording/recorder.js";
import type { RecordingSessionProps } from "./recording/session.js";
import { uploadRecording } from "./recording/upload.js";
import { type Draft, ReportCard } from "./report-card.js";
import { ScreenshotControls } from "./screenshot-controls.js";
import { matchesShortcut } from "./shortcut.js";
import { styles } from "./styles.js";
import {
  loadRelayOptions,
  type RelayOptions,
  requestRecordingUpload,
  submitReport,
} from "./submit.js";
import type {
  ShotlogControls,
  ShotlogLauncherOptions,
  ShotlogProviderProps,
  ShotlogSubmitResult,
} from "./types.js";

const Context = createContext<ShotlogControls | null>(null);
const defaultTypes = ["Bug", "Question", "Idea"];
type Identity = Pick<SupportLogSubmission, "id" | "shortId" | "createdAt"> & {
  readonly attempted?: true;
};
type Phase = "closed" | "open" | "closing";
type Status =
  | { readonly tag: "idle" | "sending" }
  | { readonly tag: "sent"; readonly result: ShotlogSubmitResult }
  | {
      readonly tag: "error";
      readonly error: ShotlogError;
      /** Replaces the error's usual label. */
      readonly message?: string;
    };
interface Session {
  readonly recorder: Recorder;
  readonly limits: RecordingLimits;
  readonly Session: ComponentType<RecordingSessionProps>;
  readonly release: () => void;
}

// Finished uploads by video, so a retry, even under a new identity, never uploads it again.
const uploadedRecordings = new WeakMap<Blob, RecordingPart>();

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
  // The card stays mounted while "closing" so it can collapse back into the Launcher.
  const [phase, setPhase] = useState<Phase>("closed");
  const isOpen = phase === "open";
  const launcherRef = useRef<HTMLButtonElement>(null);
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
  // Seconds left before a delayed capture; the card steps aside while it runs.
  const [countdown, setCountdown] = useState<number | null>(null);
  const cancelCountdown = useRef<(() => void) | null>(null);
  const startCountdown = useCallback(
    (seconds: number) =>
      new Promise<void>((resolve, reject) => {
        cancelCountdown.current?.();
        let left = seconds;
        const timer = setInterval(() => {
          if (--left > 0) return setCountdown(left);
          finish();
          resolve();
        }, 1000);
        const finish = () => {
          clearInterval(timer);
          cancelCountdown.current = null;
          setCountdown(null);
        };
        cancelCountdown.current = () => {
          finish();
          reject(new DOMException("Countdown cancelled", "AbortError"));
        };
        setCountdown(left);
      }),
    [],
  );
  // What the Relay Endpoint offers: Slack channels to choose, and Screen Recording.
  const [relayOptions, setRelayOptions] = useState<{
    readonly endpoint: string;
    readonly options: RelayOptions;
  }>();
  // A Screen Recording is never persisted either. While recording, the card steps aside.
  const [recording, setRecording] = useState<RecordedVideo>();
  const [recordingError, setRecordingError] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const uploadAbort = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      uploadAbort.current?.abort();
    };
  }, []);
  const [slackChannel, setSlackChannel] = useState<string>();
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<Status>({ tag: "idle" });
  // A chosen card size lives for the page, never in storage.
  const [cardSize, setCardSize] = useState<CardSize | null>(null);
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
    cancelCountdown.current?.();
    identity.current = null;
    sending.current = false;
    captureOwner.current = null;
    setCapturing(false);
    setCaptureError("");
    setScreenshot(undefined);
    // Unmounting the session cancels its recorder.
    setSession(null);
    uploadAbort.current?.abort();
    setUploadProgress(null);
    setRecording(undefined);
    setRecordingError("");
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
  const close = useCallback(
    () => setPhase((current) => (current === "open" ? "closing" : current)),
    [],
  );
  const closed = useCallback(
    () => setPhase((current) => (current === "closing" ? "closed" : current)),
    [],
  );
  const open = useCallback(() => {
    if (!enabled || isOpen || typeof document === "undefined") return;
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement)
      active = active.shadowRoot.activeElement;
    opener.current = active instanceof HTMLElement ? active : null;
    if (!identity.current) setStatus({ tag: "idle" });
    ensureIdentity();
    setPhase("open");
  }, [enabled, isOpen, ensureIdentity]);
  const controls = useMemo(
    () => ({ open, close, clearDraft, isOpen: enabled && isOpen }),
    [open, close, clearDraft, enabled, isOpen],
  );

  useEffect(() => {
    if (!enabled) {
      setPhase("closed");
      // Its toolbar goes with the widget, so the recording can't carry on unseen.
      setSession(null);
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
  }, [enabled]);

  useEffect(() => {
    if (phase !== "open") cancelCountdown.current?.();
  }, [phase]);
  // Asked on every open so server changes show up; the last answer stays until replaced.
  useEffect(() => {
    if (phase !== "open" || endpoint === undefined) return;
    let current = true;
    loadRelayOptions(endpoint).then(
      (options) => {
        if (current) setRelayOptions({ endpoint, options });
      },
      // Offline or refused: the next open asks again, and Submit reports the real error.
      () => {},
    );
    return () => {
      current = false;
    };
  }, [phase, endpoint]);
  useEffect(() => () => cancelCountdown.current?.(), []);
  // A session that ends any way but Finish (draft cleared, unmount) keeps nothing. Keyed on
  // the session rather than in it, so StrictMode's second effect run can't stop a recording.
  useEffect(() => {
    if (!session) return;
    return () => session.recorder.cancel();
  }, [session]);
  // Loaded ahead so the recording toolbar appears as soon as sharing starts.
  const canRecord = canRecordWith(relayOptions?.options);
  useEffect(() => {
    if (canRecord) import("./recording/session.js").catch(() => {});
  }, [canRecord]);

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
  // Types with their own channel skip the dropdown; the server routes them.
  const offered =
    relayOptions && relayOptions.endpoint === endpoint
      ? relayOptions.options
      : undefined;
  const slackChoice = offered?.slack;
  const recordingLimits =
    offered?.recording && supportsRecording() ? offered.recording : null;
  const slackChannels =
    slackChoice && !slackChoice.fixedTypes.includes(selectedType)
      ? slackChoice.channels
      : null;
  const chosenSlackChannel = slackChannels?.some(
    ({ id }) => id === slackChannel,
  )
    ? slackChannel
    : slackChannels?.[0]?.id;
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
    const fail = (error: ShotlogError, message?: string) => {
      sending.current = false;
      setStatus({ tag: "error", error, ...(message ? { message } : {}) });
      onError?.(error);
    };
    // The video goes straight to storage first; the report then carries its ticket.
    const video = endpoint !== undefined ? recording : undefined;
    let recordingPart = video && uploadedRecordings.get(video.blob);
    if (video && endpoint !== undefined && !recordingPart) {
      const controller = new AbortController();
      uploadAbort.current = controller;
      setUploadProgress(0);
      try {
        const { target, ticket } = await requestRecordingUpload(endpoint, {
          id: current.id,
          size: video.blob.size,
          mimeType: video.mimeType,
        });
        await uploadRecording(target, video.blob, {
          signal: controller.signal,
          onProgress: (loaded) =>
            setUploadProgress(
              Math.min(99, Math.floor((loaded / video.blob.size) * 100)),
            ),
        });
        recordingPart = {
          ticket,
          width: video.width,
          height: video.height,
          durationMs: video.durationMs,
          size: video.blob.size,
          mimeType: video.mimeType,
        };
        uploadedRecordings.set(video.blob, recordingPart);
      } catch (cause) {
        if (draftEpoch.current !== epoch || !mounted.current) return;
        const error = isShotlogError(cause)
          ? cause
          : new UploadFailed("Screen recording upload failed", { cause });
        return fail(
          error,
          error._tag === "UploadFailed" ? labels.recordingUploadFailed : "",
        );
      } finally {
        if (uploadAbort.current === controller) {
          uploadAbort.current = null;
          setUploadProgress(null);
        }
      }
      if (draftEpoch.current !== epoch) return;
    }
    let log: SupportLogSubmission;
    try {
      const context = await collectContext();
      if (draftEpoch.current !== epoch) return;
      const trail = getDiagnostics();
      log = {
        schemaVersion: 2,
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
      return fail(
        new ValidationFailed(
          ["Could not collect Environment or Host Context"],
          undefined,
          { cause },
        ),
      );
    }
    let result: ShotlogSubmitResult;
    try {
      if (endpoint !== undefined)
        result = await submitReport(
          endpoint,
          log,
          screenshot,
          chosenSlackChannel,
          recordingPart,
        );
      else {
        await onSubmit({ log, ...(screenshot ? { screenshot } : {}) });
        result = { id: log.id, shortId: log.shortId, duplicate: false };
      }
    } catch (cause) {
      if (draftEpoch.current !== epoch) return;
      const error = isShotlogError(cause)
        ? cause
        : new DeliveryFailed("custom", undefined, { cause });
      // Only a Screen Recording fails this way at a Relay Endpoint: its upload is suspect.
      if (video && error._tag === "UploadFailed") {
        uploadedRecordings.delete(video.blob);
        return fail(error, labels.recordingUploadFailed);
      }
      return fail(error);
    }
    if (draftEpoch.current !== epoch) return;
    sending.current = false;
    identity.current = null;
    setScreenshot(undefined);
    setRecording(undefined);
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
      ? uploadProgress !== null
        ? // Tens, so the live region isn't flooded; the bar moves smoothly.
          labels.uploadingRecording(Math.floor(uploadProgress / 10) * 10)
        : labels.sending
      : status.tag === "sent"
        ? labels.sent(status.result.shortId)
        : status.tag === "error"
          ? status.message || errorMessage(status.error, labels)
          : "";
  const startRecording = () => {
    const limits = recordingLimits;
    if (!limits || status.tag === "sending" || status.tag === "sent") return;
    const release = acquireCapture();
    if (!release) return;
    setRecordingError("");
    const failed = () => {
      release();
      if (draftEpoch.current === epoch)
        setRecordingError(labels.recordingFailed);
    };
    let pending: Promise<Recorder | undefined>;
    try {
      // Synchronously, inside the click: the screen picker needs its user activation.
      pending = requestRecording();
    } catch {
      return failed();
    }
    pending.then(async (recorder) => {
      if (!recorder) return release();
      try {
        const { RecordingSession } = await import("./recording/session.js");
        if (!mounted.current || draftEpoch.current !== epoch) {
          recorder.cancel();
          return release();
        }
        setSession({ recorder, limits, Session: RecordingSession, release });
      } catch {
        recorder.cancel();
        failed();
      }
    }, failed);
  };
  const endSession = (active: Session) => {
    active.release();
    setSession((current) => (current === active ? null : current));
  };
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
            lang={labels.lang}
            data-theme={theme}
            data-position={position}
            data-mode={launcher ? "standalone" : "programmatic"}
            style={themeStyle}
          >
            {launcher && (
              <Launcher
                ref={launcherRef}
                options={launcher === true ? {} : launcher}
                label={labels.launcher}
                open={isOpen}
                onOpen={open}
              />
            )}
            {phase !== "closed" && (
              <ReportCard
                key={epoch}
                draft={{ ...draft, type: selectedType }}
                types={types}
                labels={labels}
                state={status.tag}
                message={message}
                opener={opener.current}
                origin={launcher ? launcherRef : undefined}
                position={position}
                size={cardSize}
                onResize={setCardSize}
                closing={phase === "closing"}
                onClosed={closed}
                capturing={capturing}
                slackChannels={slackChannels}
                slackChannel={chosenSlackChannel}
                onSlackChannelChange={setSlackChannel}
                countdown={countdown}
                onCancelCountdown={() => cancelCountdown.current?.()}
                away={session !== null}
                progress={uploadProgress}
                recordingControls={
                  recordingLimits && (
                    <RecordingControls
                      labels={labels}
                      limits={recordingLimits}
                      recording={recording}
                      locked={status.tag === "sending" || status.tag === "sent"}
                      busy={capturing}
                      active={session !== null}
                      error={recordingError}
                      onStart={startRecording}
                      onRemove={() => {
                        if (draftEpoch.current !== epoch) return;
                        if (identity.current?.attempted)
                          identity.current = null;
                        setRecordingError("");
                        setRecording(undefined);
                        persist(latestDraft.current);
                      }}
                    />
                  )
                }
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
                    countdown={startCountdown}
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
            {session && (
              <session.Session
                recorder={session.recorder}
                limits={session.limits}
                labels={labels}
                onFinish={(video) => {
                  endSession(session);
                  if (draftEpoch.current !== epoch) return;
                  if (identity.current?.attempted) identity.current = null;
                  setRecording(video);
                  persist(latestDraft.current);
                }}
                onDiscard={() => endSession(session)}
                onError={(error) => {
                  endSession(session);
                  if (draftEpoch.current === epoch) setRecordingError(error);
                }}
              />
            )}
          </div>,
          root,
        )}
    </Context.Provider>
  );
}

const Launcher = forwardRef<
  HTMLButtonElement,
  {
    readonly options: ShotlogLauncherOptions;
    readonly label: string;
    readonly open: boolean;
    readonly onOpen: () => void;
  }
>(function Launcher(
  {
    options: { content = "icon", icon = <SupportIcon /> },
    label,
    open,
    onOpen,
  },
  ref,
): ReactElement {
  // Stays mounted while the card is open so the card can hand focus and its shape back.
  return (
    <button
      ref={ref}
      className="launcher"
      data-content={content}
      data-open={open}
      type="button"
      onClick={onOpen}
      aria-label={label}
      title={content === "icon" ? label : undefined}
      aria-haspopup="dialog"
      tabIndex={open ? -1 : undefined}
    >
      {content !== "text" && (
        <span className="launcher-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      {content !== "icon" && label}
    </button>
  );
});

/** A speech bubble with a question mark. */
function SupportIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      aria-hidden="true"
    >
      <path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.6L3 21l1.9-5.6A8.5 8.5 0 1 1 21 11.5Z" />
      <path d="M9.6 9.2a2.5 2.5 0 0 1 4.8 1c0 1.7-2.4 2.1-2.4 3.3" />
      <path d="M12 16.6h.01" />
    </svg>
  );
}

const canRecordWith = (options: RelayOptions | undefined) =>
  options?.recording != null && supportsRecording();

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
