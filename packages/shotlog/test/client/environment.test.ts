import { afterEach, expect, test, vi } from "vitest";
import { captureEnvironment } from "../../src/client/environment.js";

afterEach(() => vi.unstubAllGlobals());

test("strips credentials, queries and fragments from both the page URL and referrer", () => {
  vi.stubGlobal("location", {
    href: "https://username:password@example.test/page?secret=1#access_token=abc",
    pathname: "/page",
  });
  vi.stubGlobal("document", {
    title: "Page",
    referrer: "https://refuser:refpass@example.test/referrer?secret=2",
  });
  vi.stubGlobal("navigator", { userAgent: "", onLine: true });
  vi.stubGlobal("screen", { width: 1000, height: 800 });
  vi.stubGlobal("window", {
    innerWidth: 1000,
    innerHeight: 800,
    matchMedia: () => ({ matches: false }),
  });

  expect(captureEnvironment()).toMatchObject({
    url: "https://example.test/page",
    referrer: "https://example.test/referrer",
  });
});
