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
import { SMTPServer } from "smtp-server";
import { createServer as createViteServer } from "vite";
import { type InboxEntry, isSettings, type Settings } from "./shared.js";

const port = Number(process.env.PORT ?? 5199);
const host = "127.0.0.1";
const origin = `http://${host}:${port}`;
const webhookSecret = "shotlog-playground-dev-secret";
const inbox: InboxEntry[] = [];
const subscribers = new Set<ServerResponse>();
let settings: Settings = { authorize: "allow", rateLimit: true };

function createRelay() {
  return toNodeHandler(
    createSupportHandler({
      delivery: {
        email: {
          from: "reports@playground.test",
          to: "support@playground.test",
          provider: smtp({ host, port: 2525 }),
        },
        webhook: { url: `${origin}/_inbox/webhook`, secret: webhookSecret },
      },
      authorize: () => {
        if (settings.authorize === "unauthorized") throw new Unauthorized();
        if (settings.authorize === "forbidden") throw new Forbidden();
        return true;
      },
      rateLimit: settings.rateLimit ? {} : false,
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
          text: mail.text ?? "",
          attachments: mail.attachments.map((attachment) => ({
            filename: attachment.filename ?? "attachment",
            contentType: attachment.contentType,
            size: attachment.size,
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
    if (req.method !== "POST") return methodNotAllowed(res, "POST");
    relay(req, res);
    return;
  }
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
    if (
      settings.authorize !== next.authorize ||
      settings.rateLimit !== next.rateLimit
    ) {
      settings = { authorize: next.authorize, rateLimit: next.rateLimit };
      relay = createRelay();
    }
    return json(res, settings);
  }
  if (path.startsWith("/api/") || path.startsWith("/_inbox/")) {
    return json(res, { error: "Not found" }, 404);
  }
  vite.middlewares(req, res);
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
catcher.listen(2525, host, () => {
  console.log(`shotlog SMTP catcher → ${host}:2525`);
  server.listen(port, host, () => {
    console.log(`shotlog Playground → ${origin}`);
  });
});
