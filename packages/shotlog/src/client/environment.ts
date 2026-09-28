import { version } from "../../package.json";
import type { Environment } from "../types.js";

interface UserAgentData {
  readonly brands?: readonly {
    readonly brand: string;
    readonly version: string;
  }[];
  readonly platform?: string;
  readonly mobile?: boolean;
}

export function captureEnvironment(): Environment {
  const ua = navigator.userAgent;
  const hints = (
    navigator as Navigator & { readonly userAgentData?: UserAgentData }
  ).userAgentData;
  const brand =
    hints?.brands?.find(({ brand }) =>
      /Microsoft Edge|Google Chrome|Opera/i.test(brand),
    ) ?? hints?.brands?.find(({ brand }) => brand === "Chromium");
  const browserMatch =
    ua.match(/(EdgA?|EdgiOS|OPR|SamsungBrowser)\/([\d.]+)/) ??
    ua.match(/(Firefox|FxiOS|Chrome|CriOS)\/([\d.]+)/);
  const browserNames: Record<string, string> = {
    Edg: "Microsoft Edge",
    EdgA: "Microsoft Edge",
    EdgiOS: "Microsoft Edge",
    OPR: "Opera",
    SamsungBrowser: "Samsung Internet",
    Firefox: "Firefox",
    FxiOS: "Firefox",
    Chrome: "Google Chrome",
    CriOS: "Google Chrome",
  };
  const safari = ua.match(/Version\/([\d.]+).*Safari/);
  const browser = brand
    ? `${brand.brand} ${brand.version}`
    : browserMatch
      ? `${browserNames[browserMatch[1] ?? ""]} ${browserMatch[2]}`
      : safari
        ? `Safari ${safari[1]}`
        : "Unknown";
  const ipad =
    /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const os =
    hints?.platform ||
    (ipad || /iPhone|iPod/.test(ua)
      ? "iOS"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /CrOS/.test(ua)
            ? "Chrome OS"
            : /Macintosh|Mac OS X/.test(ua)
              ? "macOS"
              : /Linux/.test(ua)
                ? "Linux"
                : "Unknown");
  const deviceType =
    ipad ||
    /Tablet|Kindle|Silk/i.test(ua) ||
    (/Android/.test(ua) && !/Mobile/.test(ua))
      ? "tablet"
      : (hints?.mobile ?? /Mobi|iPhone|iPod/i.test(ua))
        ? "mobile"
        : hints?.mobile === false || os !== "Unknown"
          ? "desktop"
          : "unknown";

  return {
    url: withoutQuery(location.href),
    route: location.pathname,
    title: document.title,
    referrer: document.referrer ? withoutQuery(document.referrer) : "",
    timeOnPageMs: Math.max(0, Math.round(performance.now())),
    userAgent: ua,
    browser,
    os,
    deviceType,
    language: navigator.language || "und",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    screen: {
      width: Math.max(1, screen.width),
      height: Math.max(1, screen.height),
    },
    viewport: {
      width: Math.max(1, window.innerWidth),
      height: Math.max(1, window.innerHeight),
    },
    devicePixelRatio: window.devicePixelRatio || 1,
    colorScheme: window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light",
    online: navigator.onLine,
    libraryVersion: version,
  };
}

function withoutQuery(value: string): string {
  const url = new URL(value);
  url.search = "";
  return url.href;
}
