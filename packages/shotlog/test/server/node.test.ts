import { createServer } from "node:http";
import { connect } from "node:net";
import { afterEach, expect, onTestFinished, test, vi } from "vitest";
import { socketAddresses } from "../../src/internal/socket.js";
import { toNodeHandler } from "../../src/node.js";
import { createSupportHandler } from "../../src/server.js";
import { png, request } from "./fixtures.js";

afterEach(() => vi.unstubAllGlobals());

test("streams a real node:http multipart request and Fetch response, including repeated cookies", async () => {
  const realFetch = globalThis.fetch;
  const webhook = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", webhook);
  const support = createSupportHandler({
    delivery: {
      webhook: {
        url: "https://receiver.example.com/logs",
        secret: "node-test",
      },
    },
    authorize: (input) =>
      input.headers.get("authorization") === "Bearer session",
    rateLimit: false,
  });
  let receivedUrl: string | undefined;
  let socketAddress: string | null = null;
  const server = createServer(
    toNodeHandler(async (input) => {
      receivedUrl = input.url;
      socketAddress = socketAddresses.get(input) ?? null;
      const response = await support(input);
      response.headers.append("set-cookie", "first=1; Path=/");
      response.headers.append("set-cookie", "second=2; Path=/");
      return response;
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  await (async () => {
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("No listening address");
    const source = request(undefined, new Blob([png], { type: "image/png" }), {
      authorization: "Bearer session",
      "x-forwarded-for": "198.51.100.1",
    });
    const url = `http://127.0.0.1:${address.port}/support?source=node`;
    const init: RequestInit & { duplex: "half" } = {
      method: "POST",
      headers: source.headers,
      body: source.body,
      duplex: "half",
    };
    const response = await realFetch(url, init);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, duplicate: false });
    expect(response.headers.getSetCookie()).toEqual([
      "first=1; Path=/",
      "second=2; Path=/",
    ]);
    expect(receivedUrl).toBe(url);
    // The socket address travels outside headers; a spoofed forwarded header can't replace it.
    expect(socketAddress).toBe("127.0.0.1");
    expect(webhook).toHaveBeenCalledOnce();
  })().finally(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  );
});

async function rawServer(handler: (request: Request) => Promise<Response>) {
  const server = createServer(toNodeHandler(handler));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  onTestFinished(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  );
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No listening address");
  return address.port;
}

function rawUpload(port: number, size: number, body: string | Buffer) {
  const socket = connect(port, "127.0.0.1");
  onTestFinished(() => {
    socket.destroy();
  });
  const chunks: Buffer[] = [];
  const closed = new Promise<string>((resolve, reject) => {
    socket.on("data", (chunk: Buffer) => chunks.push(chunk));
    socket.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "ECONNRESET" && error.code !== "EPIPE") reject(error);
    });
    socket.on("close", () => resolve(Buffer.concat(chunks).toString()));
    socket.setTimeout(14_000, () => {
      reject(new Error("Socket did not close within the drain deadline"));
      socket.destroy();
    });
  });
  socket.write(
    `POST /support HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nContent-Type: multipart/form-data; boundary=test\r\nContent-Length: ${size}\r\nConnection: close\r\n\r\n`,
  );
  socket.write(body);
  return { socket, closed };
}

test("closes a one-byte-then-stalled upload at the 10-second deadline and releases the reader", async () => {
  let body: ReadableStream<Uint8Array> | null = null;
  const port = await rawServer(async (request) => {
    body = request.body;
    return new Response("Too large", { status: 413 });
  });
  const started = performance.now();
  const { closed } = rawUpload(port, 6 * 1024 * 1024, "x");
  expect(await closed).toBe("");
  expect(performance.now() - started).toBeGreaterThanOrEqual(9_500);
  expect(performance.now() - started).toBeLessThan(13_000);
  await vi.waitFor(() => expect(body?.locked).toBe(false));
  // The same adapter is still usable after the interrupted drain.
  expect(await rawUpload(port, 1, "x").closed).toContain("413");
}, 15_000);

test.each(["direct", "locked"])(
  "preserves a %s response-owned echo stream",
  async (mode) => {
    const port = await rawServer(
      async (request) =>
        new Response(
          mode === "locked"
            ? request.body?.pipeThrough(
                new TransformStream<Uint8Array, Uint8Array>(),
              )
            : request.body,
          { headers: { "content-length": "10" } },
        ),
    );
    const response = await rawUpload(port, 10, "hello echo").closed;
    expect(response).toContain("200 OK");
    expect(response.split("\r\n\r\n")[1]).toBe("hello echo");
  },
);

test("drains a normal 6 MiB upload and delivers its 413 with Connection: close", async () => {
  const port = await rawServer(
    createSupportHandler({
      authorize: () => true,
      rateLimit: false,
      delivery: {
        webhook: { url: "https://receiver.example.com", secret: "test" },
      },
    }),
  );
  const response = await rawUpload(
    port,
    6 * 1024 * 1024,
    Buffer.alloc(6 * 1024 * 1024),
  ).closed;
  expect(response).toContain("413 Payload Too Large");
  expect(response.toLowerCase()).toContain("connection: close\r\n");
  expect(response).toContain('"_tag":"PayloadTooLarge"');
});

test("destroys an upload past the 64 MiB drain cap without writing the response", async () => {
  let body: ReadableStream<Uint8Array> | null = null;
  const port = await rawServer(async (request) => {
    body = request.body;
    return new Response("Too large", { status: 413 });
  });
  const size = 64 * 1024 * 1024 + 1;
  expect(await rawUpload(port, size, Buffer.alloc(size)).closed).toBe("");
  await vi.waitFor(() => expect(body?.locked).toBe(false));
});

test("allows only eight concurrent drains and reuses a released slot", async () => {
  const bodies: ReadableStream<Uint8Array>[] = [];
  const port = await rawServer(async (request) => {
    if (request.body) bodies.push(request.body);
    return new Response("Too large", { status: 413 });
  });
  const pending = Array.from({ length: 8 }, () => rawUpload(port, 2, "x"));
  await vi.waitFor(() => {
    expect(bodies).toHaveLength(8);
    expect(bodies.every((body) => body.locked)).toBe(true);
  });
  expect(await rawUpload(port, 2, "x").closed).toBe("");
  const first = pending[0];
  if (!first) throw new Error("Missing first connection");
  first.socket.write("x");
  expect(await first.closed).toContain("413");
  expect(await rawUpload(port, 1, "x").closed).toContain("413");
  for (const { socket } of pending) socket.destroy();
  await Promise.all(pending.map(({ closed }) => closed));
  await vi.waitFor(() =>
    expect(bodies.every((body) => !body.locked)).toBe(true),
  );
});
