import { afterEach, expect, test, vi } from "vitest";
import { request } from "./fixtures.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

test("the Next example fails closed unless demo mode is explicitly enabled", async () => {
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
  vi.stubEnv("SHOTLOG_DEMO", undefined);
  vi.stubEnv("SHOTLOG_WEBHOOK_SECRET", undefined);
  const { register } = await import(
    "../../../../apps/next-example/instrumentation.js"
  );
  await expect(register()).rejects.toThrow(
    "SHOTLOG_WEBHOOK_SECRET is required",
  );

  vi.resetModules();
  vi.stubEnv("SHOTLOG_WEBHOOK_SECRET", "configured-secret");
  const { POST } = await import(
    "../../../../apps/next-example/app/api/support/route.js"
  );
  const { GET } = await import(
    "../../../../apps/next-example/app/api/inbox/route.js"
  );
  expect((await POST(request())).status).toBe(403);
  expect(GET().status).toBe(404);

  vi.resetModules();
  vi.stubEnv("SHOTLOG_DEMO", "1");
  vi.stubEnv("SHOTLOG_WEBHOOK_SECRET", undefined);
  const config = await import("../../../../apps/next-example/lib/config.js");
  expect(config.webhookSecret).toBe("shotlog-next-example-local-secret");
  const demoSupport = await import(
    "../../../../apps/next-example/app/api/support/route.js"
  );
  const demoInbox = await import(
    "../../../../apps/next-example/app/api/inbox/route.js"
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 204 })),
  );
  expect(
    (
      await demoSupport.POST(
        request(undefined, undefined, { "x-real-ip": "127.0.0.1" }),
      )
    ).status,
  ).toBe(200);
  expect(demoInbox.GET().status).toBe(200);
});
