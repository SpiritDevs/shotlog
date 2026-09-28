import { randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { text } from "node:stream/consumers";
import { simpleParser } from "mailparser";
import type { SupportLog } from "shotlog";
import { toNodeHandler } from "shotlog/node";
import {
  createSupportHandler,
  Forbidden,
  Unauthorized,
  verifyWebhookSignature,
} from "shotlog/server";
import { smtp } from "shotlog/smtp";
import { uploadfile } from "shotlog/uploadfile";
import { SMTPServer } from "smtp-server";
import { createServer as createViteServer } from "vite";
import {
  type InboxEntry,
  isSettings,
  type Settings,
  type SlackBlock,
  type SlackEntry,
} from "./shared.js";

const port = Number(process.env.PLAYGROUND_PORT ?? 5199);
const smtpPort = Number(process.env.SMTP_PORT ?? 2525);
const rateWindowSeconds = Number(
  process.env.PLAYGROUND_RATE_WINDOW_SECONDS ?? 600,
);
const host = "127.0.0.1";
const origin = `http://${host}:${port}`;
const webhookSecret = "shotlog-playground-dev-secret";
const inbox: InboxEntry[] = [];
const subscribers = new Set<ServerResponse>();
let settings: Settings = { authorize: "allow", rateLimit: true, slack: "off" };
// A local stand-in for the Slack Web API. Set SLACK_BOT_TOKEN (and SLACK_CHANNEL for the
// fixed mode) to post to a real workspace instead.
const slackToken = process.env.SLACK_BOT_TOKEN ?? "xoxb-playground";
const slackChannels = [
  { id: "C0SUPPORT", name: "support" },
  { id: "C0BUGS", name: "bugs" },
  { id: "C0DESIGN", name: "design-feedback" },
];
const slackUploads = new Map<string, Buffer>();

function createRelay() {
  return toNodeHandler(
    createSupportHandler({
      delivery: {
        email: {
          from: "reports@playground.test",
          to: "support@playground.test",
          provider: smtp({ host, port: smtpPort }),
        },
        webhook: {
          url: `${origin}/_inbox/webhook`,
          secret: webhookSecret,
          ...(process.env.SHOTLOG_SCREENSHOT_MODE === "upload" &&
          process.env.UPLOADFILE_TOKEN
            ? { screenshotMode: "upload", storage: uploadfile() }
            : {}),
        },
        ...(settings.slack === "off" || !settings.slack
          ? {}
          : {
              slack: {
                token: slackToken,
                ...(process.env.SLACK_BOT_TOKEN
                  ? {}
                  : { apiUrl: `${origin}/_slack/api` }),
                ...(settings.slack === "fixed"
                  ? { channel: process.env.SLACK_CHANNEL ?? "C0SUPPORT" }
                  : {}),
              },
            }),
      },
      authorize: () => {
        if (settings.authorize === "unauthorized") throw new Unauthorized();
        if (settings.authorize === "forbidden") throw new Forbidden();
        return true;
      },
      rateLimit: settings.rateLimit
        ? { windowSeconds: rateWindowSeconds }
        : false,
    }),
  );
}

let relay = createRelay();

function json(res: ServerResponse, value: unknown, status = 200) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(value));
}

function methodNotAllowed(res: ServerResponse, allow: string) {
  res.writeHead(405, { allow });
  res.end();
}

function notifyInbox() {
  for (const subscriber of subscribers) {
    subscriber.write('data: {"changed":true}\n\n');
  }
}

const catcher = new SMTPServer({
  authOptional: true,
  disabledCommands: ["AUTH", "STARTTLS"],
  onData(stream, _session, callback) {
    void simpleParser(stream, { skipImageLinks: true })
      .then((mail) => {
        const images = new Map(
          mail.attachments
            .filter((attachment) => attachment.cid)
            .map((attachment) => [
              attachment.cid,
              `data:${attachment.contentType};base64,${attachment.content.toString("base64")}`,
            ]),
        );
        const html = (mail.html || "").replace(
          /cid:([^\s"'<>]+)/g,
          (source, cid: string) => images.get(cid) ?? source,
        );
        inbox.unshift({
          kind: "email",
          id: randomUUID(),
          subject: mail.subject ?? "",
          from: mail.from?.text ?? "",
          to: Array.isArray(mail.to)
            ? mail.to.map((address) => address.text).join(", ")
            : (mail.to?.text ?? ""),
          replyTo: mail.replyTo?.text ?? "",
          html,
          sourceHtml: mail.html || "",
          text: mail.text ?? "",
          attachments: mail.attachments.map((attachment) => ({
            filename: attachment.filename ?? "attachment",
            contentType: attachment.contentType,
            size: attachment.size,
            disposition: attachment.contentDisposition,
            ...(attachment.cid ? { contentId: attachment.cid } : {}),
          })),
          receivedAt: new Date().toISOString(),
        });
        inbox.length = Math.min(inbox.length, 100);
        notifyInbox();
        callback();
      })
      .catch((error: unknown) =>
        callback(
          error instanceof Error ? error : new Error("Could not parse email"),
        ),
      );
  },
});

function subscribe(res: ServerResponse) {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  res.flushHeaders();
  subscribers.add(res);
  const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 15_000);
  res.once("close", () => {
    clearInterval(heartbeat);
    subscribers.delete(res);
  });
}

async function route(req: IncomingMessage, res: ServerResponse) {
  const path = new URL(req.url ?? "/", origin).pathname;
  if (path === "/api/support") {
    if (req.method !== "POST" && req.method !== "GET")
      return methodNotAllowed(res, "GET, POST");
    relay(req, res);
    return;
  }
  if (path.startsWith("/_slack/")) return fakeSlack(path, req, res);
  if (path === "/_inbox/webhook") {
    if (req.method !== "POST") return methodNotAllowed(res, "POST");
    const payload = await text(req);
    const signature = req.headers["x-shotlog-signature"];
    const signatureValid = await verifyWebhookSignature({
      payload,
      header: typeof signature === "string" ? signature : null,
      secret: webhookSecret,
    });
    // The local relay owns this payload; keep the exact delivered JSON for inspection.
    const supportLog = JSON.parse(payload) as SupportLog;
    inbox.unshift({
      kind: "webhook",
      id: randomUUID(),
      receivedAt: new Date().toISOString(),
      signatureValid,
      supportLog,
    });
    inbox.length = Math.min(inbox.length, 100);
    res.writeHead(204).end();
    notifyInbox();
    return;
  }
  if (path === "/_inbox/events") {
    if (req.method !== "GET") return methodNotAllowed(res, "GET");
    subscribe(res);
    return;
  }
  if (path === "/_inbox") {
    if (req.method === "GET") return json(res, inbox);
    if (req.method !== "DELETE") return methodNotAllowed(res, "GET, DELETE");
    inbox.length = 0;
    res.writeHead(204).end();
    notifyInbox();
    return;
  }
  if (path === "/_settings") {
    if (req.method === "GET") return json(res, settings);
    if (req.method !== "PUT") return methodNotAllowed(res, "GET, PUT");
    const next: unknown = JSON.parse(await text(req));
    if (!isSettings(next)) return json(res, { error: "Invalid settings" }, 400);
    const slack = next.slack ?? "off";
    if (
      settings.authorize !== next.authorize ||
      settings.rateLimit !== next.rateLimit ||
      settings.slack !== slack
    ) {
      settings = {
        authorize: next.authorize,
        rateLimit: next.rateLimit,
        slack,
      };
      relay = createRelay();
    }
    return json(res, settings);
  }
  if (path.startsWith("/api/") || path.startsWith("/_inbox/")) {
    return json(res, { error: "Not found" }, 404);
  }
  vite.middlewares(req, res);
}

async function fakeSlack(
  path: string,
  req: IncomingMessage,
  res: ServerResponse,
) {
  if (req.method !== "POST") return methodNotAllowed(res, "POST");
  if (path.startsWith("/_slack/upload/")) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    slackUploads.set(
      path.slice("/_slack/upload/".length),
      Buffer.concat(chunks),
    );
    res.writeHead(200).end("OK");
    return;
  }
  if (req.headers.authorization !== `Bearer ${slackToken}`)
    return json(res, { ok: false, error: "invalid_auth" });
  const params = new URLSearchParams(await text(req));
  switch (path.slice("/_slack/api/".length)) {
    case "users.conversations":
      return json(res, { ok: true, channels: slackChannels });
    case "files.getUploadURLExternal": {
      const fileId = `F${randomUUID().slice(0, 8)}`;
      return json(res, {
        ok: true,
        file_id: fileId,
        upload_url: `${origin}/_slack/upload/${fileId}`,
      });
    }
    case "chat.postMessage": {
      const requested = params.get("channel")?.replace(/^#/, "") ?? "";
      const channel = slackChannels.find(
        ({ id, name }) => id === requested || name === requested,
      );
      if (!channel) return json(res, { ok: false, error: "channel_not_found" });
      const ts = `${Date.now() / 1000}`;
      const entry: SlackEntry = {
        kind: "slack",
        id: ts,
        receivedAt: new Date().toISOString(),
        channel: channel.name,
        text: params.get("text") ?? "",
        blocks: JSON.parse(params.get("blocks") ?? "[]") as SlackBlock[],
      };
      inbox.unshift(entry);
      inbox.length = Math.min(inbox.length, 100);
      notifyInbox();
      return json(res, { ok: true, channel: channel.id, ts });
    }
    case "files.completeUploadExternal": {
      const [file] = JSON.parse(params.get("files") ?? "[]") as {
        id: string;
      }[];
      const bytes = file && slackUploads.get(file.id);
      const index = inbox.findIndex(
        (entry) =>
          entry.kind === "slack" && entry.id === params.get("thread_ts"),
      );
      const entry = inbox[index];
      if (!bytes || entry?.kind !== "slack")
        return json(res, { ok: false, error: "file_not_found" });
      slackUploads.delete(file.id);
      inbox[index] = {
        ...entry,
        screenshot: `data:image/png;base64,${bytes.toString("base64")}`,
      };
      notifyInbox();
      return json(res, { ok: true, files: [file] });
    }
    default:
      return json(res, { ok: false, error: "unknown_method" });
  }
}

const server = createServer((req, res) => {
  void route(req, res).catch((error: unknown) => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    if (error instanceof SyntaxError) {
      json(res, { error: "Invalid JSON" }, 400);
      return;
    }
    console.error("Playground request failed", error);
    json(res, { error: "Playground request failed" }, 500);
  });
});

const vite = await createViteServer({
  server: { middlewareMode: true, hmr: { server } },
  appType: "spa",
});

async function shutdown() {
  for (const subscriber of subscribers) subscriber.end();
  server.close();
  server.closeAllConnections();
  catcher.close();
  await vite.close();
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
server.once("error", (error) => {
  console.error("Playground could not start", error);
  process.exitCode = 1;
  void shutdown();
});
catcher.once("error", (error) => {
  console.error("Playground SMTP catcher could not start", error);
  process.exitCode = 1;
  void shutdown();
});
catcher.listen(smtpPort, host, () => {
  console.log(`shotlog SMTP catcher → ${host}:${smtpPort}`);
  server.listen(port, host, () => {
    console.log(`shotlog Playground → ${origin}`);
  });
});
