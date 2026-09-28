import type { ReactNode } from "react";
import type { ShotlogError } from "../errors.js";
import type { JsonValue, Reporter, SupportLogSubmission } from "../types.js";

/**
 * Replaceable Launcher, Report Card, and Annotation Editor text.
 * Type options can override individual chip labels without changing delivered values.
 * @example
 * ```ts
 * import type { ShotlogLabels } from "shotlog";
 * const labels: Partial<ShotlogLabels> = {
 *   submit: "Envoyer",
 *   sent: (shortId) => `Envoyé ✓ · ${shortId}`,
 * };
 * ```
 * @public
 */
export interface ShotlogLabels {
  /** Launcher's visible text and accessible name. */
  readonly launcher: string;
  /** Dialog heading. */
  readonly title: string;
  /** Close button's accessible name. */
  readonly close: string;
  /** Type group's legend. */
  readonly type: string;
  /** Default Bug chip. */
  readonly bug: string;
  /** Default Question chip. */
  readonly question: string;
  /** Default Idea chip. */
  readonly idea: string;
  /** Required description's visible prompt. */
  readonly description: string;
  /** Missing or whitespace-only description. */
  readonly descriptionRequired: string;
  /** Default one-tap Page Render button. */
  readonly screenshot: string;
  /** Accessible name for the Capture Method options toggle. */
  readonly screenshotOptions: string;
  /** Page Render option. */
  readonly capturePage: string;
  /** Screen Capture option, only shown when supported. */
  readonly captureScreen: string;
  /** Image file picker. */
  readonly uploadImage: string;
  /** Screenshot thumbnail alternative text. */
  readonly screenshotPreview: string;
  /** Remove the attached Screenshot. */
  readonly removeScreenshot: string;
  /** Capture progress announcement. */
  readonly capturingScreenshot: string;
  /** Page Render failed; suggests Screen Capture or Upload. */
  readonly pageCaptureFailed: string;
  /** Page Render failed where Screen Capture is unavailable. */
  readonly pageCaptureFailedWithoutScreen: string;
  /** Screen Capture failed (permission denial is silent). */
  readonly screenCaptureFailed: string;
  /** A pasted or uploaded image could not be decoded. */
  readonly imageFailed: string;
  /** Reopen the Screenshot with editable annotations. */
  readonly editScreenshot: string;
  /** Annotation Editor dialog heading. */
  readonly editorTitle: string;
  /** Cancel the editor. */
  readonly editorCancel: string;
  /** Flatten and attach the Screenshot. */
  readonly editorDone: string;
  /** PNG encoding progress. */
  readonly editorSaving: string;
  /** PNG encoding failure. */
  readonly editorFailed: string;
  /** Confirmation before discarding edits. */
  readonly editorDiscardChanges: string;
  /** Tool toolbar accessible name. */
  readonly editorTools: string;
  /** Style controls accessible name. */
  readonly editorStyle: string;
  /** Drawing surface accessible name. */
  readonly editorCanvas: string;
  /** Select tool. */
  readonly editorSelect: string;
  /** Arrow tool. */
  readonly editorArrow: string;
  /** Rectangle tool. */
  readonly editorRectangle: string;
  /** Oval tool. */
  readonly editorOval: string;
  /** Text tool. */
  readonly editorText: string;
  /** Inline text input accessible name. */
  readonly editorTextInput: string;
  /** Freehand tool. */
  readonly editorFreehand: string;
  /** Highlighter tool. */
  readonly editorHighlighter: string;
  /** Step Counter tool. */
  readonly editorStep: string;
  /** Spotlight tool. */
  readonly editorSpotlight: string;
  /** Pixelate/Redact tool. */
  readonly editorRedact: string;
  /** Crop tool. */
  readonly editorCrop: string;
  /** Apply the pending crop. */
  readonly editorApplyCrop: string;
  /** Pending crop instruction. */
  readonly editorCropHint: string;
  /** Red palette swatch. */
  readonly editorRed: string;
  /** Yellow palette swatch. */
  readonly editorYellow: string;
  /** Green palette swatch. */
  readonly editorGreen: string;
  /** Blue palette swatch. */
  readonly editorBlue: string;
  /** Neutral palette swatch; click again to switch black/white. */
  readonly editorBlackWhite: string;
  /** Thin stroke. */
  readonly editorThin: string;
  /** Medium stroke. */
  readonly editorMedium: string;
  /** Thick stroke. */
  readonly editorThick: string;
  /** Rounded rectangle option. */
  readonly editorRounded: string;
  /** Destructive solid redaction option. */
  readonly editorSolid: string;
  /** Undo accessible name and tooltip. */
  readonly editorUndo: string;
  /** Redo accessible name and tooltip. */
  readonly editorRedo: string;
  /** Selected tool announcement. */
  readonly editorToolSelected: (tool: string) => string;
  /** Accessible name of the expanded Included Details region, including Diagnostic Trail counts. */
  readonly includedDetails: (
    consoleCount: number,
    networkCount: number,
  ) => string;
  /** Included Details disclosure title, shown beside the count badges. */
  readonly detailsSummary: string;
  /** Console badge on the Included Details disclosure. */
  readonly consoleCount: (count: number) => string;
  /** Network badge on the Included Details disclosure. */
  readonly networkCount: (count: number) => string;
  /** Environment section heading. */
  readonly environment: string;
  /** Reporter section heading. */
  readonly reporter: string;
  /** Metadata section heading. */
  readonly metadata: string;
  /** Diagnostic Trail section heading. */
  readonly diagnosticTrail: string;
  /** Console entries heading. */
  readonly consoleEntries: string;
  /** Failed network requests heading. */
  readonly networkEntries: string;
  /** Display name for a payload key; unknown Host Context keys can be returned unchanged. */
  readonly detailKey: (key: string) => string;
  /** Empty section. */
  readonly detailsEmpty: string;
  /** Host Context is resolving. */
  readonly detailsLoading: string;
  /** Environment or Host Context could not be collected. */
  readonly detailsUnavailable: string;
  /** Diagnostic recording is disabled. */
  readonly diagnosticsDisabled: string;
  /** Explains that the preview is refreshed on submission. */
  readonly detailsRefresh: string;
  /** Submit button. */
  readonly submit: string;
  /** Retry button. */
  readonly retry: string;
  /** Sending button and live announcement. */
  readonly sending: string;
  /** Success announcement, including the readable Support Log ID. */
  readonly sent: (shortId: string) => string;
  /** Accessible name of the card's resize handle. */
  readonly resizeCard: string;
  /** Authentication required. */
  readonly unauthorized: string;
  /** Reporter cannot submit. */
  readonly forbidden: string;
  /** Rate limit announcement; minutes are rounded up, with a minimum of one. */
  readonly rateLimited: (minutes: number) => string;
  /** Payload exceeds the Relay Endpoint's limit. */
  readonly payloadTooLarge: string;
  /** Invalid report, Host Context, or Relay Endpoint response. */
  readonly validationFailed: string;
  /** Delivery Channel failed. */
  readonly deliveryFailed: string;
  /** Screenshot upload failed. */
  readonly uploadFailed: string;
  /** Offline or network failure. */
  readonly offline: string;
  /** Delivery provider is unavailable. */
  readonly providerNotInstalled: string;
  /** Runtime cannot support the operation. */
  readonly unsupportedRuntime: string;
}

/**
 * Submission acknowledgement, including Relay Endpoint deduplication status.
 * @example
 * ```ts
 * import type { ShotlogSubmitResult } from "shotlog";
 * const onSubmitted = (result: ShotlogSubmitResult) => console.log(result.shortId);
 * ```
 * @public
 */
export interface ShotlogSubmitResult {
  /** Full Support Log UUID. */
  readonly id: string;
  /** Readable Support Log ID, e.g. `SL-7F3K`. */
  readonly shortId: string;
  /** This ID had already been delivered. */
  readonly duplicate: boolean;
}

/**
 * A Support Log ready for delivery, handed to a custom `onSubmit`.
 * @example
 * ```ts
 * import type { ShotlogProviderProps } from "shotlog";
 * const send: NonNullable<ShotlogProviderProps["onSubmit"]> = async ({ log, screenshot }) => {
 *   const body = new FormData();
 *   body.set("supportLog", JSON.stringify(log));
 *   if (screenshot) body.set("screenshot", screenshot, "screenshot.png");
 *   const response = await fetch("/api/custom-support", { method: "POST", body });
 *   if (!response.ok) throw new Error("Delivery failed");
 * };
 * ```
 * @public
 */
export interface ShotlogSubmission {
  readonly log: SupportLogSubmission;
  /** The flattened, annotated PNG, when the Reporter attached one. */
  readonly screenshot?: Blob;
}

/**
 * Where Support Logs go: the Relay Endpoint (default), or the Host App's own `onSubmit`.
 * @example
 * ```ts
 * import type { ShotlogProviderProps } from "shotlog";
 * const delivery: ShotlogProviderProps = { endpoint: "/api/support" };
 * ```
 * @public
 */
export type ShotlogDelivery =
  | {
      /**
       * Relay Endpoint URL, served by `createSupportHandler` from `shotlog/server`.
       * Sending and reading its response share a 60-second deadline, allowing the
       * default 10-second storage upload plus three 10-second webhook attempts
       * and backoff, with Email in parallel. Expiry reports Offline and permits Retry.
       */
      readonly endpoint: string;
      readonly onSubmit?: never;
    }
  | {
      readonly endpoint?: never;
      /**
       * Deliver the Support Log yourself (your database, Slack, ...). Throw a shotlog
       * error class to select its translated label; any other throw shows as a delivery failure.
       */
      readonly onSubmit: (submission: ShotlogSubmission) => Promise<void>;
    };

/**
 * Host App configuration for Standalone or Programmatic Mode.
 * Functions supplying Host Context run on every submission attempt.
 * @example
 * ```ts
 * import type { ShotlogProviderProps } from "shotlog";
 * const options: ShotlogProviderProps = {
 *   endpoint: "/api/support",
 *   reporter: () => ({ id: "user-42" }),
 *   labels: { submit: "Send" },
 * };
 * ```
 * @public
 */
export type ShotlogProviderProps = ShotlogDelivery & ShotlogProviderOptions;

/**
 * A delivered Type value, optionally with a separate display label.
 * Without an explicit label, Bug, Question, and Idea use their translated labels;
 * all other values are displayed unchanged.
 * @example
 * ```ts
 * import type { ShotlogTypeOption } from "shotlog";
 * const billing: ShotlogTypeOption = { value: "Billing", label: "Facturation" };
 * ```
 * @public
 */
export type ShotlogTypeOption =
  | string
  | { readonly value: string; readonly label?: string };

/**
 * Where the Launcher sits and the Report Card is anchored.
 * @public
 */
export type ShotlogPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

/**
 * Everything on ShotlogProvider except the delivery choice.
 * @example
 * ```ts
 * import type { ShotlogProviderProps } from "shotlog";
 * const options: ShotlogProviderProps = { endpoint: "/api/support", launcher: false, theme: "dark" };
 * ```
 * @public
 */
export interface ShotlogProviderOptions {
  /** Host App content; always rendered, including when disabled. */
  readonly children?: ReactNode;
  /** Defaults to true. False removes the widget and makes `open()` a no-op. */
  readonly enabled?: boolean;
  /**
   * Pass the signed-in user's id so drafts and pending report IDs never cross accounts.
   * Uses `shotlog:draft:<scope>` in sessionStorage, or `shotlog:draft` when omitted.
   * Changing scope resets the in-memory draft, identity, and Screenshot, then loads that scope.
   */
  readonly draftScope?: string;
  /** Defaults to true. False keeps drafts and pending report IDs in memory only. */
  readonly persistDraft?: boolean;
  /**
   * The floating Launcher (Standalone Mode). Defaults to a round button with a support icon.
   * Pass options to show text or your own icon, or `false` for Programmatic Mode with a centred card.
   * Its accessible name is always `labels.launcher`.
   * @example
   * ```tsx
   * <ShotlogProvider endpoint="/api/support" launcher={{ content: "icon-text" }} />
   * <ShotlogProvider endpoint="/api/support" launcher={{ icon: <MyHelpIcon /> }} />
   * ```
   */
  readonly launcher?: boolean | ShotlogLauncherOptions;
  /**
   * Where the Launcher sits and the Report Card is anchored; defaults to `bottom-right`.
   * Corners anchor the card at that corner. `top-center` and `bottom-center` centre the
   * Launcher on that edge and grow the card away from it. `center` centres the card in the
   * viewport and is intended mainly for Programmatic Mode, where there is no Launcher.
   */
  readonly position?: ShotlogPosition;
  /** Defaults to `auto`, following the system colour scheme. */
  readonly theme?: "light" | "dark" | "auto";
  /** Accent CSS colour; also configurable with `--shotlog-accent`. */
  readonly accent?: string;
  /**
   * Defaults to Bug, Question, Idea. An empty array hides chips and sends Bug.
   * Only the option value is delivered; an explicit label overrides translated default labels.
   */
  readonly types?: readonly ShotlogTypeOption[];
  /** Overrides for the English labels. */
  readonly labels?: Partial<ShotlogLabels>;
  /**
   * Diagnostic Trail recording starts on mount while enabled. Defaults to both channels on.
   * False disables recording; omitted channel flags default to true. Only failed requests
   * are recorded, without query strings, fragments, bodies, headers, or Relay requests.
   * @example
   * ```tsx
   * import { ShotlogProvider } from "shotlog";
   * <ShotlogProvider endpoint="/api/support" diagnostics={{ network: false }} />
   * ```
   */
  readonly diagnostics?:
    | false
    | { readonly console?: boolean; readonly network?: boolean };
  /** Current Reporter, resolved when Included Details expands and on every submission. */
  readonly reporter?: Reporter | (() => Reporter | Promise<Reporter>);
  /** Current JSON Host Context, resolved when Included Details expands and on every submission. */
  readonly metadata?:
    | { readonly [key: string]: JsonValue }
    | (() =>
        | { readonly [key: string]: JsonValue }
        | Promise<{ readonly [key: string]: JsonValue }>);
  /** Opt-in opening shortcut, e.g. `Mod+Shift+.`; Mod is Cmd on macOS, Ctrl elsewhere. */
  readonly shortcut?: string;
  /** Called after Relay Endpoint acknowledgement or custom onSubmit resolution, even if the card was closed, unless its draft was cleared or scope changed. */
  readonly onSubmitted?: (result: ShotlogSubmitResult) => void;
  /** Called for each failed attempt with a public tagged error, unless its draft was cleared or scope changed. */
  readonly onError?: (error: ShotlogError) => void;
}

/**
 * How the floating Launcher looks.
 * @example
 * ```tsx
 * const launcher: ShotlogLauncherOptions = { content: "text" };
 * ```
 * @public
 */
export interface ShotlogLauncherOptions {
  /** `icon` (default): a round icon button; `text`: `labels.launcher`; `icon-text`: both. */
  readonly content?: "icon" | "text" | "icon-text";
  /** Replaces the default support icon. Rendered inside the widget's shadow root. */
  readonly icon?: ReactNode;
}

/**
 * Programmatic controls for the nearest ShotlogProvider.
 * @example
 * ```tsx
 * import { useShotlog, type ShotlogControls } from "shotlog";
 * function HelpButton() {
 *   const { open, isOpen }: ShotlogControls = useShotlog();
 *   return <button onClick={open} disabled={isOpen}>Get help</button>;
 * }
 * ```
 * @public
 */
export interface ShotlogControls {
  /** Opens the card unless disabled; an already open card is unchanged. */
  readonly open: () => void;
  /** Closes the card, keeping its draft and any running request. */
  readonly close: () => void;
  /** Clears the current scope's stored and in-memory draft, identity, and Screenshot. Call on sign-out. */
  readonly clearDraft: () => void;
  /** Whether the Report Card is visible. */
  readonly isOpen: boolean;
}
