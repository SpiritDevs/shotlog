import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

/**
 * Adapt a Fetch handler to node:http, Express, or Fastify's raw request/response objects.
 * Mount before body-parsing middleware so the incoming stream is still available.
 * @example
 * ```ts
 * import { createServer } from "node:http";
 * import { createSupportHandler } from "shotlog/server";
 * import { toNodeHandler } from "shotlog/node";
 * createServer(toNodeHandler(createSupportHandler(config))).listen(3000);
 * ```
 * @public
 */
export function toNodeHandler(
  handler: (request: Request) => Promise<Response>,
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    handle(handler, req, res).catch((error: unknown) => {
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
  const response = await handler(new Request(url, init));
  res.statusCode = response.status;
  response.headers.forEach((value, name) => {
    if (name !== "set-cookie") res.setHeader(name, value);
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) res.setHeader("set-cookie", cookies);
  if (response.body)
    await pipeline(
      Readable.fromWeb(response.body as NodeReadableStream<Uint8Array>),
      res,
    );
  else res.end();
  res.off("close", abort);
}
