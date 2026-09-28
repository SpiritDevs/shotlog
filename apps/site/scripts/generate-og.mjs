// Usage: node apps/site/scripts/generate-og.mjs /path/to/playwright/index.mjs
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const { chromium } = await import(
  process.argv[2] ? pathToFileURL(process.argv[2]).href : "playwright"
);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  const svg = await readFile(
    new URL("../public/og.svg", import.meta.url),
    "utf8",
  );
  await page.setContent(`<body style="margin:0">${svg}</body>`);
  await page.screenshot({
    path: fileURLToPath(new URL("../public/og.png", import.meta.url)),
  });
} finally {
  await browser.close();
}
