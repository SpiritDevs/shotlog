import { formatDuration } from "../internal/duration.js";
import type { Environment } from "../types.js";
import type { EmailConfig } from "./config.js";
import type { DeliveredLog } from "./delivery.js";
import { defaultEmailLabels, type EmailMessage } from "./email-types.js";
import type { ParsedScreenshot } from "./multipart.js";

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });

const display = (value: unknown): string =>
  typeof value === "string" ? value : (JSON.stringify(value) ?? "");

// Accept only one bare address; display names, lists, and header controls are excluded.
function replyAddress(value: string | undefined): string | undefined {
  if (!value || /[\r\n,]/.test(value)) return undefined;
  const address = value.trim();
  if (address.length > 254) return undefined;
  const [local] = address.split("@");
  if (!local || local.length > 64) return undefined;
  return /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/.test(
    address,
  )
    ? address
    : undefined;
}

const heading = (label: string) =>
  `<h2 style="margin:24px 0 10px;font-size:17px;color:#111827">${escapeHtml(label)}</h2>`;
const cellStyle =
  "padding:8px;border-bottom:1px solid #e5e7eb;text-align:left;vertical-align:top;overflow-wrap:anywhere;white-space:pre-wrap";

function table(
  rows: readonly (readonly string[])[],
  headers?: readonly string[],
): string {
  return `<table role="table" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;table-layout:fixed">${headers ? `<thead><tr>${headers.map((header) => `<th scope="col" style="${cellStyle}">${escapeHtml(header)}</th>`).join("")}</tr></thead>` : ""}<tbody>${rows.map((row) => `<tr>${row.map((value, index) => (!headers && index === 0 ? `<th scope="row" style="${cellStyle}">${escapeHtml(value)}</th>` : `<td style="${cellStyle}">${escapeHtml(value)}</td>`)).join("")}</tr>`).join("")}</tbody></table>`;
}

export function renderEmail(
  config: EmailConfig,
  log: DeliveredLog,
  screenshot?: ParsedScreenshot,
): EmailMessage {
  const labels = { ...defaultEmailLabels, ...config.labels };
  const firstLine = (log.description.split(/[\r\n]/, 1)[0] ?? "").trim();
  const characters = Array.from(firstLine);
  const preview =
    characters.length > 80
      ? `${characters.slice(0, 79).join("").trimEnd()}…`
      : firstLine;
  const type = labels.type(log.type);
  const subject = `[${type}] ${log.shortId} · ${preview}`.replace(
    /[\r\n]+/g,
    " ",
  );
  const contentId = `screenshot-${log.id}@shotlog`;
  const filename = `support-log-${log.id}.png`;
  const replyTo = replyAddress(log.reporter?.email);
  const html: string[] = [
    heading(labels.description),
    `<p style="white-space:pre-wrap;overflow-wrap:anywhere;margin:0">${escapeHtml(log.description)}</p>`,
  ];
  const text: string[] = [subject, `${labels.description}\n${log.description}`];
  if (log.recording) {
    const duration = formatDuration(log.recording.durationMs);
    html.push(
      heading(labels.recording),
      `<p style="margin:0"><a href="${escapeHtml(log.recording.url)}" style="display:inline-block;padding:10px 16px;border-radius:6px;background:#111827;color:#ffffff;font-weight:bold;text-decoration:none">&#9654;&nbsp; ${escapeHtml(labels.watchRecording)} · ${duration}</a></p>`,
    );
    text.push(`${labels.recording} (${duration})\n${log.recording.url}`);
  }
  if (screenshot) {
    html.push(
      heading(labels.screenshot),
      `<img src="cid:${escapeHtml(contentId)}" alt="${escapeHtml(labels.screenshot)}" width="${Math.min(screenshot.width, 592)}" style="display:block;max-width:100%;height:auto;border:1px solid #e5e7eb" />`,
    );
    text.push(`${labels.screenshot}: ${filename}`);
  }
  const section = (
    label: string,
    rows: readonly (readonly string[])[],
    headers?: readonly string[],
  ) => {
    html.push(
      heading(label),
      rows.length ? table(rows, headers) : `<p>${escapeHtml(labels.none)}</p>`,
    );
    text.push(
      `${label}\n${rows.length ? [...(headers ? [headers.join(" | ")] : []), ...rows.map((row) => row.join(headers ? " | " : ": "))].join("\n") : labels.none}`,
    );
  };
  section(
    labels.reporter,
    Object.entries(log.reporter ?? {}).map(([key, value]) => [
      key === "id" || key === "name" || key === "email" ? labels[key] : key,
      display(value),
    ]),
  );
  section(
    labels.metadata,
    Object.entries(log.metadata ?? {}).map(([key, value]) => [
      key,
      display(value),
    ]),
  );
  section(
    labels.environment,
    Object.entries(log.environment).map(([key, value]) => [
      labels[key as keyof Environment],
      display(value),
    ]),
  );
  html.push(heading(labels.diagnosticTrail));
  text.push(labels.diagnosticTrail);
  section(
    labels.console,
    (log.diagnostics?.console ?? []).map((entry) => [
      entry.at,
      entry.level,
      entry.message,
      entry.stack ?? "",
    ]),
    [labels.time, labels.level, labels.message, labels.stack],
  );
  section(
    labels.network,
    (log.diagnostics?.network ?? []).map((entry) => [
      entry.at,
      entry.method,
      entry.url,
      String(entry.status),
    ]),
    [labels.time, labels.method, labels.url, labels.status],
  );
  const footer = `${labels.supportLogId}: ${log.id}\n${labels.createdAt}: ${log.createdAt}`;
  text.push(footer);
  return {
    from: config.from,
    to: typeof config.to === "string" ? [config.to] : [...config.to],
    ...(replyTo ? { replyTo } : {}),
    subject,
    html: `<!doctype html><html lang="${escapeHtml(labels.lang)}"><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head><body style="margin:0;padding:24px 12px;background:#f3f4f6;color:#374151;font:14px/1.5 Arial,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border:1px solid #e5e7eb"><tr><td style="padding:24px"><h1 style="margin:0;font-size:22px;color:#111827">${escapeHtml(`[${type}] ${log.shortId}`)}</h1>${html.join("")}<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;white-space:pre-wrap">${escapeHtml(footer)}</p></td></tr></table></td></tr></table></body></html>`,
    text: text.join("\n\n"),
    attachments: screenshot
      ? [
          {
            filename,
            contentType: "image/png",
            content: screenshot.bytes,
            contentId,
          },
          { filename, contentType: "image/png", content: screenshot.bytes },
        ]
      : [],
  };
}
