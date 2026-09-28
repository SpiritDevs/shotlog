import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { socketAddresses } from "../internal/socket.js";

/**
 * Adapt a Fetch handler to node:http, Express, or Fastify's raw request/response objects.
 * Mount before body-parsing middleware so the incoming stream is still available.
 * Unread bodies are drained before early responses, with a 10-second total deadline,
 * a 64 MiB cap, and at most 8 concurrent drains per adapter. Exceeding a bound closes
 * the connection without a response. Locked or response-owned streams are not drained.
 * @example
 * ```ts
 * import { createServer } from "node:http";
 * import { createSupportHandler, type SupportHandlerConfig } from "shotlog/server";
 * import { toNodeHandler } from "shotlog/node";
 * function supportServer(config: SupportHandlerConfig) {
 *   return createServer(toNodeHandler(createSupportHandler(config)));
 * }
 * ```
 * @public
 */
export function toNodeHandler(
  handler: (request: Request) => Promise<Response>,
): (req: IncomingMessage, res: ServerResponse) => void {
  let activeDrains = 0;
  const drainUnread = async (
    body: ReadableStream<Uint8Array>,
    destroy: () => void,
  ): Promise<boolean> => {
    if (activeDrains >= 8) {
      destroy();
      return false;
    }
    activeDrains += 1;
    try {
      return await drain(body, destroy);
    } finally {
      activeDrains -= 1;
    }
  };
  return (req, res) => {
    handle(handler, req, res, drainUnread).catch((error: unknown) => {
      if (disconnected(req, res)) return;
      console.error("shotlog: Node handler failed", error);
      if (res.headersSent) res.destroy();
      else {
        res.statusCode = 500;
        res.end();
      }
    });
  };
}

async function handle(
  handler: (request: Request) => Promise<Response>,
  req: IncomingMessage,
  res: ServerResponse,
  drainUnread: (
    body: ReadableStream<Uint8Array>,
    destroy: () => void,
  ) => Promise<boolean>,
): Promise<void> {
  const headers = new Headers();
  for (let index = 0; index < req.rawHeaders.length; index += 2) {
    const name = req.rawHeaders[index];
    const value = req.rawHeaders[index + 1];
    if (name !== undefined && value !== undefined) headers.append(name, value);
  }
  const protocol =
    "encrypted" in req.socket && req.socket.encrypted ? "https" : "http";
  const url = new URL(
    req.url ?? "/",
    `${protocol}://${headers.get("host") ?? "localhost"}`,
  );
  const controller = new AbortController();
  const abort = () => {
    if (!res.writableFinished) controller.abort();
  };
  res.once("close", abort);
  const init: RequestInit & { duplex: "half" } = {
    method: req.method ?? "GET",
    headers,
    signal: controller.signal,
    duplex: "half",
    ...(req.method === "GET" || req.method === "HEAD"
      ? {}
      : { body: Readable.toWeb(req) as ReadableStream<Uint8Array> }),
  };
  const request = new Request(url, init);
  if (req.socket.remoteAddress)
    socketAddresses.set(request, req.socket.remoteAddress);
  try {
    const response = await handler(request);
    if (disconnected(req, res)) return;
    // Firefox may wait for its upload to finish before reading an early rejection.
    // A response can own the same unlocked stream (e.g. an echo handler).
    const unread =
      request.body &&
      !request.bodyUsed &&
      !request.body.locked &&
      response.body !== request.body;
    if (unread && request.body) {
      const drained = await drainUnread(request.body, () => {
        req.destroy();
        res.destroy();
      });
      if (!drained) return;
    }
    if (disconnected(req, res)) return;
    res.statusCode = response.status;
    response.headers.forEach((value, name) => {
      if (name !== "set-cookie") res.setHeader(name, value);
    });
    if (unread) res.setHeader("connection", "close");
    const cookies = response.headers.getSetCookie();
    if (cookies.length > 0) res.setHeader("set-cookie", cookies);
    if (response.body)
      await pipeline(
        Readable.fromWeb(response.body as NodeReadableStream<Uint8Array>),
        res,
      );
    else res.end();
  } finally {
    res.off("close", abort);
  }
}

function disconnected(req: IncomingMessage, res: ServerResponse): boolean {
  // Node also auto-destroys IncomingMessage after a normal EOF. That alone must
  // not suppress a response on a live socket (including a successfully drained 413).
  return (
    res.destroyed ||
    req.socket.destroyed ||
    (req.destroyed && !req.readableEnded)
  );
}

async function drain(
  body: ReadableStream<Uint8Array>,
  destroy: () => void,
): Promise<boolean> {
  const reader = body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<false>((resolve) => {
    timer = setTimeout(() => {
      destroy();
      resolve(false);
    }, 10_000);
  });
  const read = async () => {
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return true;
        bytes += value.byteLength;
        if (bytes > 64 * 1024 * 1024) {
          destroy();
          return false;
        }
      }
    } catch {
      destroy();
      return false;
    }
  };
  try {
    // Racing the whole drain interrupts even a pending read, not just the next loop.
    return await Promise.race([read(), deadline]);
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}
