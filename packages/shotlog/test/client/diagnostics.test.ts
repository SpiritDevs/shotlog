import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  acquireDiagnostics,
  getDiagnostics,
} from "../../src/client/diagnostics.js";

// Native EventTarget is enough to exercise recorder hooks without a DOM dependency.
class FakeXHR extends EventTarget {
  status = 0;
  body: Document | XMLHttpRequestBodyInit | null | undefined;
  openArguments: readonly unknown[] = [];
  open(
    method: string,
    url: string | URL,
    async = true,
    username?: string | null,
    password?: string | null,
  ) {
    this.openArguments = [method, url, async, username, password];
  }
  send(body?: Document | XMLHttpRequestBodyInit | null) {
    this.body = body;
  }
  finish(status: number) {
    this.status = status;
    this.dispatchEvent(new Event("loadend"));
  }
}

const originalXhrOpen = FakeXHR.prototype.open;
const originalXhrSend = FakeXHR.prototype.send;
const leases: (() => void)[] = [];
function mount(
  endpoint = "/api/support",
  options = { console: true, network: true },
) {
  const release = acquireDiagnostics(endpoint, options);
  leases.push(release);
  return release;
}

beforeEach(() => {
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("document", { baseURI: "https://example.test/app/" });
  vi.stubGlobal("XMLHttpRequest", FakeXHR);
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () => new Response(null, { status: 404 })),
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  for (const release of leases.splice(0)) release();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  FakeXHR.prototype.open = originalXhrOpen;
  FakeXHR.prototype.send = originalXhrSend;
});

test("two provider leases install once and the last release restores the exact originals", () => {
  const originals = {
    warn: console.warn,
    error: console.error,
    fetch,
    open: FakeXHR.prototype.open,
    send: FakeXHR.prototype.send,
  };
  const releaseFirst = mount();
  const installed = {
    warn: console.warn,
    error: console.error,
    fetch,
    open: FakeXHR.prototype.open,
    send: FakeXHR.prototype.send,
  };
  const releaseSecond = mount();
  expect(console.warn).toBe(installed.warn);
  expect(console.error).toBe(installed.error);
  expect(fetch).toBe(installed.fetch);
  expect(FakeXHR.prototype.open).toBe(installed.open);
  expect(FakeXHR.prototype.send).toBe(installed.send);
  console.warn("once");
  expect(getDiagnostics().console).toHaveLength(1);
  expect(originals.warn).toHaveBeenCalledExactlyOnceWith("once");
  releaseFirst();
  releaseFirst(); // Cleanup is idempotent, including StrictMode lifecycles.
  expect(fetch).toBe(installed.fetch);
  expect(console.warn).toBe(installed.warn);
  releaseSecond();
  expect(console.warn).toBe(originals.warn);
  expect(console.error).toBe(originals.error);
  expect(fetch).toBe(originals.fetch);
  expect(FakeXHR.prototype.open).toBe(originals.open);
  expect(FakeXHR.prototype.send).toBe(originals.send);
  expect(getDiagnostics()).toEqual({ console: [], network: [] });
});

test("later library patches survive cleanup and retained Shotlog wrappers stay inert on remount", async () => {
  const release = mount();
  const wrappedWarn = console.warn;
  const wrappedError = console.error;
  const wrappedFetch = fetch;
  const wrappedOpen = FakeXHR.prototype.open;
  const wrappedSend = FakeXHR.prototype.send;
  const laterWarn = vi.fn((...args: unknown[]) => wrappedWarn(...args));
  const laterError = vi.fn((...args: unknown[]) => wrappedError(...args));
  const laterFetch: typeof fetch = (input, init) => wrappedFetch(input, init);
  const laterOpen: FakeXHR["open"] = function (this: FakeXHR, ...args) {
    wrappedOpen.apply(this, args);
  };
  const laterSend: FakeXHR["send"] = function (this: FakeXHR, body) {
    wrappedSend.call(this, body);
  };
  console.warn = laterWarn;
  console.error = laterError;
  globalThis.fetch = laterFetch;
  FakeXHR.prototype.open = laterOpen;
  FakeXHR.prototype.send = laterSend;
  release();
  expect(console.warn).toBe(laterWarn);
  expect(console.error).toBe(laterError);
  expect(fetch).toBe(laterFetch);
  expect(FakeXHR.prototype.open).toBe(laterOpen);
  expect(FakeXHR.prototype.send).toBe(laterSend);
  console.warn("after release");
  await fetch("/after-release");
  expect(getDiagnostics()).toEqual({ console: [], network: [] });
  const releaseAgain = mount();
  console.warn("remounted");
  await fetch("/once");
  const xhr = new FakeXHR();
  xhr.open("GET", "/once-xhr");
  xhr.send();
  xhr.finish(500);
  expect(getDiagnostics().console).toHaveLength(1);
  expect(getDiagnostics().network).toHaveLength(2);
  releaseAgain();
  expect(console.warn).toBe(laterWarn);
  expect(fetch).toBe(laterFetch);
});

test("console and network channels are independently ref-counted and disabled leases install nothing", async () => {
  const originalWarn = console.warn;
  const originalFetch = fetch;
  mount("/disabled", { console: false, network: false });
  expect(console.warn).toBe(originalWarn);
  expect(fetch).toBe(originalFetch);
  const releaseConsole = mount("/api/support", {
    console: true,
    network: false,
  });
  expect(fetch).toBe(originalFetch);
  const releaseNetwork = mount("/api/support", {
    console: false,
    network: true,
  });
  releaseConsole();
  expect(console.warn).toBe(originalWarn);
  await fetch("/failure");
  expect(getDiagnostics().network).toHaveLength(1);
  releaseNetwork();
  expect(fetch).toBe(originalFetch);
});

test("fetch records only HTTP and network failures, strips queries/fragments, and preserves requests", async () => {
  const response = new Response(null, { status: 422 });
  const failure = new TypeError("Failed to fetch");
  const original = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(response)
    .mockRejectedValueOnce(failure)
    .mockResolvedValueOnce(new Response(null, { status: 200 }))
    .mockResolvedValueOnce(Response.error());
  vi.stubGlobal("fetch", original);
  mount();
  const request = new Request(
    "https://example.test/save?token=secret123#private",
    {
      method: "POST",
      body: "private-body",
      headers: { authorization: "private-header" },
    },
  );
  const init = { method: "PUT" };
  expect(await fetch(request, init)).toBe(response);
  expect(original).toHaveBeenNthCalledWith(1, request, init);
  await expect(
    fetch(new URL("https://example.test/offline?token=secret#hash")),
  ).rejects.toBe(failure);
  await fetch("/ok");
  await fetch("/opaque");
  const entries = getDiagnostics().network;
  expect(entries).toEqual([
    {
      method: "PUT",
      url: "https://example.test/save",
      status: 422,
      at: expect.any(String),
    },
    {
      method: "GET",
      url: "https://example.test/offline",
      status: 0,
      at: expect.any(String),
    },
  ]);
  expect(JSON.stringify(entries)).not.toMatch(/token|secret|private/);
});

test("XHR records failed completions once, preserves send/open arguments, and supports reuse", () => {
  mount();
  const xhr = new FakeXHR();
  const url = new URL("https://example.test/upload?token=secret#fragment");
  const body = new FormData();
  body.set("secret", "body");
  xhr.open("post", url, false, "user", "password");
  xhr.send(body);
  expect(xhr.openArguments).toEqual(["post", url, false, "user", "password"]);
  expect(xhr.body).toBe(body);
  xhr.finish(500);
  xhr.finish(500);
  xhr.open("GET", "next?query=1#part");
  xhr.send();
  xhr.finish(0);
  xhr.open("GET", "/success");
  xhr.send();
  xhr.finish(200);
  expect(getDiagnostics().network).toEqual([
    {
      method: "POST",
      url: "https://example.test/upload",
      status: 500,
      at: expect.any(String),
    },
    {
      method: "GET",
      url: "https://example.test/app/next",
      status: 0,
      at: expect.any(String),
    },
  ]);
});

test("excludes resolved relay URLs for every provider, without excluding other origins or paths", async () => {
  mount("../api/support?tenant=1#part");
  mount("https://other.test/relay");
  await fetch("/api/support?tenant=2");
  await fetch(new Request("https://other.test/relay?token=secret"));
  const xhr = new FakeXHR();
  xhr.open("POST", "https://example.test/api/support#hash");
  xhr.send();
  xhr.finish(500);
  await fetch("https://unrelated.test/api/support");
  await fetch("/api/support-extra");
  expect(getDiagnostics().network.map(({ url }) => url)).toEqual([
    "https://unrelated.test/api/support",
    "https://example.test/api/support-extra",
  ]);
});

test("ring buffers keep the newest 50 entries and earlier submission snapshots stay unchanged", async () => {
  mount();
  console.error("snapshot");
  const snapshot = getDiagnostics();
  for (let index = 0; index < 55; index += 1) {
    console.warn(`warning ${index}`);
    await fetch(`/failure/${index}`);
  }
  const current = getDiagnostics();
  expect(current.console).toHaveLength(50);
  expect(current.network).toHaveLength(50);
  expect(current.console[0]?.message).toBe("warning 5");
  expect(current.console[49]?.message).toBe("warning 54");
  expect(current.network[0]?.url).toBe("https://example.test/failure/5");
  expect(current.network[49]?.url).toBe("https://example.test/failure/54");
  expect(snapshot.console.map(({ message }) => message)).toEqual(["snapshot"]);
  expect(snapshot.network).toEqual([]);
});

test("formats Errors, cyclic objects, bigint and hostile objects without swallowing original console calls", () => {
  const original = console.error;
  mount();
  const error = new Error("Failed save");
  const cyclic: { name: string; self?: unknown } = { name: "cyclic" };
  cyclic.self = cyclic;
  const hostile = {
    get value(): never {
      throw new Error("getter failed");
    },
  };
  console.error("save", error, cyclic, { count: 2n }, undefined, hostile);
  expect(original).toHaveBeenCalledExactlyOnceWith(
    "save",
    error,
    cyclic,
    { count: 2n },
    undefined,
    hostile,
  );
  const entry = getDiagnostics().console[0];
  expect(entry?.message).toBe(
    'save Failed save {"name":"cyclic","self":"[Circular]"} {"count":"2"} undefined [Unserializable]',
  );
  expect(entry?.stack).toBe(error.stack?.slice(0, 4000));
  const huge = new Error("x".repeat(3000));
  huge.stack = "s".repeat(5000);
  console.error(huge, "y".repeat(3000));
  expect(getDiagnostics().console[1]?.message).toHaveLength(2000);
  expect(getDiagnostics().console[1]?.stack).toHaveLength(4000);
});

test("uncaught errors and unhandled rejections share the console buffer and listeners are removed", () => {
  const release = mount();
  const error = new Error("Uncaught failure");
  const emit = () => {
    window.dispatchEvent(
      Object.assign(new Event("error"), { error, message: error.message }),
    );
    window.dispatchEvent(
      Object.assign(new Event("unhandledrejection"), {
        reason: "Rejected value",
      }),
    );
  };
  emit();
  expect(getDiagnostics().console).toEqual([
    {
      level: "error",
      message: error.message,
      stack: error.stack,
      at: expect.any(String),
    },
    { level: "error", message: "Rejected value", at: expect.any(String) },
  ]);
  release();
  emit();
  expect(getDiagnostics().console).toEqual([]);
});

test("in-flight fetch and XHR callbacks cannot write into a new recording session", async () => {
  let finishFetch: ((response: Response) => void) | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(
      () =>
        new Promise((resolve) => {
          finishFetch = resolve;
        }),
    ),
  );
  const release = mount();
  const request = fetch("/slow");
  const xhr = new FakeXHR();
  xhr.open("GET", "/slow-xhr");
  xhr.send();
  release();
  mount();
  finishFetch?.(new Response(null, { status: 500 }));
  await request;
  xhr.finish(500);
  expect(getDiagnostics().network).toEqual([]);
});

test("logging during object serialization does not recursively record or swallow console calls", () => {
  const original = console.warn;
  mount();
  const value = {
    toJSON() {
      console.warn("inside formatter");
      return "formatted";
    },
  };
  console.warn(value);
  expect(original).toHaveBeenCalledTimes(2);
  expect(getDiagnostics().console.map(({ message }) => message)).toEqual([
    '"formatted"',
  ]);
});

test("relative relay exclusion follows SPA navigation and survives the provider unmounting mid-request", async () => {
  let finishFetch: ((response: Response) => void) | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(
      () =>
        new Promise((resolve) => {
          finishFetch = resolve;
        }),
    ),
  );
  const release = mount("support");
  mount("/other-relay");
  vi.stubGlobal("document", { baseURI: "https://example.test/new-route/" });
  const request = fetch("support?token=secret");
  release();
  finishFetch?.(new Response(null, { status: 500 }));
  await request;
  expect(getDiagnostics().network).toEqual([]);
});
