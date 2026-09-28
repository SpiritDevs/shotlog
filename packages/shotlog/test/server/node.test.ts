import { createServer } from "node:http";
import { afterEach, expect, test, vi } from "vitest";
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
