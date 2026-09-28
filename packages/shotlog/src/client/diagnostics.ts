import type { ConsoleEntry, Diagnostics, NetworkEntry } from "../types.js";

export interface DiagnosticOptions {
  readonly console: boolean;
  readonly network: boolean;
}

const empty: Diagnostics = { console: [], network: [] };
let trail = empty;
const listeners = new Set<() => void>();
const clients = new Set<{
  readonly endpoint: string;
  readonly options: DiagnosticOptions;
}>();
let recordingConsole = false;
let restoreConsole: (() => void) | undefined;
let restoreNetwork: (() => void) | undefined;

export const getDiagnostics = (): Diagnostics => trail;
export const getServerDiagnostics = (): Diagnostics => empty;
export function subscribeDiagnostics(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(next: Diagnostics) {
  trail = next;
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* A subscriber must not break a host call. */
    }
  }
}

/** One lease per mounted provider. Hooks are shared, with independent channel counts. */
export function acquireDiagnostics(
  endpoint: string,
  options: DiagnosticOptions,
): () => void {
  if (typeof window === "undefined" || (!options.console && !options.network))
    return () => {};
  const client = { endpoint, options };
  clients.add(client);
  if (options.console && !restoreConsole) restoreConsole = installConsole();
  if (options.network && !restoreNetwork) restoreNetwork = installNetwork();
  return () => {
    if (!clients.delete(client)) return;
    if (![...clients].some(({ options }) => options.console)) {
      restoreConsole?.();
      restoreConsole = undefined;
    }
    if (![...clients].some(({ options }) => options.network)) {
      restoreNetwork?.();
      restoreNetwork = undefined;
    }
    if (clients.size === 0) publish(empty);
  };
}

/** Resolve like browser requests, then remove query and fragment before storing. */
function cleanUrl(value: string): string | undefined {
  try {
    const url = new URL(value, document.baseURI);
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    // Invalid URLs are left to the native request implementation; never retain raw input.
    return undefined;
  }
}

function requestUrl(value: string): string | undefined {
  const url = cleanUrl(value);
  // Resolve relative endpoints when the request starts: SPA navigation can change the base.
  return [...clients].some((client) => cleanUrl(client.endpoint) === url)
    ? undefined
    : url;
}

function format(value: unknown): string {
  try {
    if (value instanceof Error) return value.message.slice(0, 2000);
    if (typeof value !== "object" || value === null)
      return String(value).slice(0, 2000);
    const seen = new WeakSet<object>();
    return (
      JSON.stringify(value, (_key, item: unknown) => {
        if (typeof item === "bigint") return String(item);
        if (typeof item === "object" && item !== null) {
          if (seen.has(item)) return "[Circular]";
          seen.add(item);
        }
        return item;
      }) ?? String(value)
    ).slice(0, 2000);
  } catch {
    return "[Unserializable]";
  }
}

function recordConsole(level: ConsoleEntry["level"], args: readonly unknown[]) {
  // Formatters and store subscribers may themselves call console.
  if (recordingConsole) return;
  recordingConsole = true;
  // A hostile getter/proxy must never stop the host's console method from running.
  try {
    let stack = "";
    let message = "";
    for (const arg of args) {
      if (message.length < 2000)
        message = `${message}${message ? " " : ""}${format(arg)}`.slice(
          0,
          2000,
        );
      if (arg instanceof Error && arg.stack && stack.length < 4000)
        stack = `${stack}${stack ? "\n" : ""}${arg.stack}`.slice(0, 4000);
    }
    const entry: ConsoleEntry = {
      level,
      message,
      ...(stack ? { stack } : {}),
      at: new Date().toISOString(),
    };
    publish({ ...trail, console: [...trail.console.slice(-49), entry] });
  } catch {
    // Diagnostics are best effort and must not change application behaviour.
  } finally {
    recordingConsole = false;
  }
}

function installConsole(): () => void {
  let active = true;
  const originals = { error: console.error, warn: console.warn };
  const error = function (this: Console, ...args: unknown[]) {
    if (active) recordConsole("error", args);
    return originals.error.apply(this, args);
  };
  const warn = function (this: Console, ...args: unknown[]) {
    if (active) recordConsole("warn", args);
    return originals.warn.apply(this, args);
  };
  console.error = error;
  console.warn = warn;
  const onError = (event: ErrorEvent) =>
    recordConsole("error", [event.error ?? event.message]);
  const onRejection = (event: PromiseRejectionEvent) =>
    recordConsole("error", [event.reason]);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    active = false;
    if (console.error === error) console.error = originals.error;
    if (console.warn === warn) console.warn = originals.warn;
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}

function recordNetwork(
  method: string,
  url: string | undefined,
  status: number,
) {
  if (!url || (status !== 0 && status < 400)) return;
  const entry: NetworkEntry = {
    method: method.toUpperCase(),
    url,
    status,
    at: new Date().toISOString(),
  };
  publish({ ...trail, network: [...trail.network.slice(-49), entry] });
}

function installNetwork(): () => void {
  let active = true;
  const originalFetch = globalThis.fetch;
  const fetch: typeof globalThis.fetch = function (
    this: typeof globalThis,
    input,
    init,
  ) {
    let url: string | undefined;
    let method = "GET";
    try {
      const request =
        typeof Request !== "undefined" && input instanceof Request;
      url = requestUrl(request ? input.url : String(input));
      method = init?.method ?? (request ? input.method : "GET");
    } catch {
      // Preserve native validation and return values for unusual request inputs.
    }
    return originalFetch.call(this, input, init).then(
      (response) => {
        // Opaque responses also have status 0, but are not network failures.
        if (active && response.status >= 400)
          recordNetwork(method, url, response.status);
        return response;
      },
      (error: unknown) => {
        if (active) recordNetwork(method, url, 0);
        throw error;
      },
    );
  };
  if (typeof originalFetch === "function") globalThis.fetch = fetch;

  const prototype = globalThis.XMLHttpRequest?.prototype;
  const originalOpen = prototype?.open;
  const originalSend = prototype?.send;
  const requests = new WeakMap<
    XMLHttpRequest,
    { method: string; url: string | undefined }
  >();
  const pending = new Set<() => void>();
  const open: XMLHttpRequest["open"] = function (
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    async: boolean = true,
    username?: string | null,
    password?: string | null,
  ) {
    // Opening a reused XHR can finish its previous request, so update after open.
    originalOpen?.call(this, method, url, async, username, password);
    if (active) requests.set(this, { method, url: requestUrl(String(url)) });
  };
  const send: XMLHttpRequest["send"] = function (this: XMLHttpRequest, body) {
    const request = active ? requests.get(this) : undefined;
    if (!request) return originalSend?.call(this, body);
    const cleanup = () => {
      this.removeEventListener("loadend", complete);
      pending.delete(cleanup);
    };
    const complete = () => {
      cleanup();
      if (active) recordNetwork(request.method, request.url, this.status);
    };
    this.addEventListener("loadend", complete);
    pending.add(cleanup);
    try {
      return originalSend?.call(this, body);
    } catch (error) {
      cleanup();
      // Synchronous network errors report status 0; invalid-state errors are not requests.
      if (
        active &&
        error instanceof DOMException &&
        error.name === "NetworkError"
      )
        recordNetwork(request.method, request.url, 0);
      throw error;
    }
  };
  if (prototype) {
    prototype.open = open;
    prototype.send = send;
  }
  return () => {
    active = false;
    if (globalThis.fetch === fetch) globalThis.fetch = originalFetch;
    if (prototype?.open === open && originalOpen) prototype.open = originalOpen;
    if (prototype?.send === send && originalSend) prototype.send = originalSend;
    for (const cleanup of pending) cleanup();
  };
}
