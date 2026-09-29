import { Data, Effect, Layer, Schedule } from "effect";
import { formatDuration } from "../internal/duration.js";
import { DeliveryFailed } from "../internal/errors.js";
import type { SlackChannelOption } from "../internal/wire.js";
import type { SlackConfig } from "./config.js";
import { type DeliveredLog, Delivery } from "./delivery.js";
import type { ParsedScreenshot } from "./multipart.js";
import { defaultSlackLabels, type SlackLabels } from "./slack-types.js";

class SlackFailure extends Data.TaggedError("SlackFailure")<{
  readonly method: string;
  /** Slack's error code, or the HTTP status when there was no JSON answer. */
  readonly error: string;
  readonly retryable: boolean;
  readonly cause?: unknown;
}> {}

type SlackResponse = { readonly ok: boolean; readonly error?: string } & Record<
  string,
  unknown
>;

const retry = Schedule.exponential("200 millis").pipe(
  Schedule.intersect(Schedule.recurs(2)),
);

// Misconfiguration (bad token, missing scope, app not in the channel) is logged for the
// operator; the browser only learns that Slack delivery failed.
const toDeliveryFailed = (failure: SlackFailure) => {
  if (!failure.retryable)
    console.error(
      `shotlog: Slack ${failure.method} failed with ${failure.error}`,
    );
  return new DeliveryFailed({ channel: "slack", cause: failure });
};

function slackClient(config: SlackConfig) {
  const base = (config.apiUrl ?? "https://slack.com/api").replace(/\/+$/, "");
  const timeoutMs = config.timeoutMs ?? 5_000;
  const attempt = (
    method: string,
    run: (signal: AbortSignal) => Promise<SlackResponse>,
  ) =>
    Effect.tryPromise({
      try: run,
      catch: (cause) =>
        cause instanceof SlackFailure
          ? cause
          : new SlackFailure({
              method,
              error: "network_error",
              retryable: true,
              cause,
            }),
    }).pipe(
      Effect.timeoutFail({
        duration: timeoutMs,
        onTimeout: () =>
          new SlackFailure({ method, error: "timeout", retryable: true }),
      }),
      Effect.retry({ schedule: retry, while: (failure) => failure.retryable }),
    );
  // Form encoding is accepted by every Web API method, including the read-only ones.
  const call = (method: string, params: Record<string, string>) =>
    attempt(method, async (signal) => {
      const response = await fetch(`${base}/${method}`, {
        method: "POST",
        redirect: "manual",
        signal,
        headers: {
          authorization: `Bearer ${config.token}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(params),
      });
      if (response.status === 429 || response.status >= 500) {
        await response.body?.cancel();
        throw new SlackFailure({
          method,
          error: `http_${response.status}`,
          retryable: true,
        });
      }
      const body = (await response.json().catch(() => undefined)) as
        | SlackResponse
        | undefined;
      if (!body?.ok)
        throw new SlackFailure({
          method,
          error: body?.error ?? `http_${response.status}`,
          retryable: false,
        });
      return body;
    });
  const upload = (url: string, bytes: Uint8Array) =>
    attempt("upload", async (signal) => {
      const response = await fetch(url, {
        method: "POST",
        redirect: "manual",
        signal,
        headers: { "content-type": "application/octet-stream" },
        body: new Blob([bytes as Uint8Array<ArrayBuffer>]),
      });
      await response.body?.cancel();
      if (!response.ok)
        throw new SlackFailure({
          method: "upload",
          error: `http_${response.status}`,
          retryable: response.status === 429 || response.status >= 500,
        });
      return { ok: true } as SlackResponse;
    });
  return { call, upload };
}

const normalise = (channel: string) => channel.trim().replace(/^#/, "");

/**
 * Lists the channels a Reporter may choose. Cached for a minute so opening the Report Card
 * never costs a Slack call per Reporter.
 */
export function slackChannels(config: SlackConfig) {
  const { call } = slackClient(config);
  const allowed = config.channels?.map(normalise);
  let cached: { at: number; channels: readonly SlackChannelOption[] } | null =
    null;
  const load = Effect.gen(function* () {
    const channels: SlackChannelOption[] = [];
    let cursor = "";
    // 10 pages of 200 covers any workspace a support widget should be offering.
    for (let page = 0; page < 10; page++) {
      const body = yield* call("users.conversations", {
        types: "public_channel,private_channel",
        exclude_archived: "true",
        limit: "200",
        ...(cursor ? { cursor } : {}),
      });
      for (const channel of (body.channels ?? []) as {
        id?: unknown;
        name?: unknown;
      }[]) {
        if (typeof channel.id === "string" && typeof channel.name === "string")
          channels.push({ id: channel.id, name: channel.name });
      }
      const next = (body.response_metadata as { next_cursor?: unknown })
        ?.next_cursor;
      if (typeof next !== "string" || !next) break;
      cursor = next;
    }
    const offered = (
      allowed
        ? channels.filter(
            ({ id, name }) => allowed.includes(id) || allowed.includes(name),
          )
        : channels
    ).sort((a, b) => a.name.localeCompare(b.name));
    if (offered.length === 0)
      console.warn(
        "shotlog: no Slack channels to offer; invite the app to a channel or check `channels`",
      );
    return offered;
  });
  return Effect.suspend(() =>
    cached && Date.now() - cached.at < 60_000
      ? Effect.succeed(cached.channels)
      : load.pipe(
          Effect.tap((channels) =>
            Effect.sync(() => {
              cached = { at: Date.now(), channels };
            }),
          ),
        ),
  ).pipe(Effect.mapError(toDeliveryFailed));
}

// Slack mrkdwn treats &, < and > as control characters; escaping them also defuses
// <!channel> style mentions in Reporter-written text.
const mrkdwn = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const clip = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;
const display = (value: unknown) =>
  typeof value === "string" ? value : (JSON.stringify(value) ?? "");

const typeEmoji: Record<string, string> = {
  Bug: ":beetle:",
  Question: ":question:",
  Idea: ":bulb:",
};

export function slackMessage(
  log: DeliveredLog,
  hasScreenshot: boolean,
  labels: SlackLabels = defaultSlackLabels,
) {
  const firstLine = (log.description.split(/[\r\n]/, 1)[0] ?? "").trim();
  const type = labels.type(log.type);
  const title = `${type} · ${log.shortId}`;
  const { environment: env, reporter } = log;
  const fields = [
    reporter &&
      `*${mrkdwn(labels.reporter)}*\n${
        [
          reporter.name && mrkdwn(reporter.name),
          reporter.email &&
            `<mailto:${mrkdwn(reporter.email)}|${mrkdwn(reporter.email)}>`,
          !reporter.name && !reporter.email && reporter.id
            ? mrkdwn(reporter.id)
            : undefined,
        ]
          .filter(Boolean)
          .join(" · ") || "—"
      }`,
    `*${mrkdwn(labels.page)}*\n<${mrkdwn(env.url)}|${mrkdwn(clip(env.title || env.route, 80))}>`,
    `*${mrkdwn(labels.browser)}*\n${mrkdwn(`${env.browser} · ${env.os} · ${env.deviceType}`)}`,
    `*${mrkdwn(labels.viewport)}*\n${env.viewport.width}×${env.viewport.height} @${env.devicePixelRatio}x`,
  ].filter((field): field is string => Boolean(field));
  const consoleEntries = log.diagnostics?.console ?? [];
  const networkEntries = log.diagnostics?.network ?? [];
  const trail = [
    ...consoleEntries
      .slice(-5)
      .map((entry) => `${entry.level.padEnd(5)} ${entry.message}`),
    ...networkEntries
      .slice(-5)
      .map(
        (entry) =>
          `${entry.method} ${entry.status || labels.failed} ${entry.url}`,
      ),
  ].map((line) => clip(line.replace(/\s+/g, " "), 200));
  const metadata = Object.entries(log.metadata ?? {}).map(
    ([key, value]) => `*${mrkdwn(key)}:* ${mrkdwn(clip(display(value), 200))}`,
  );
  const blocks: unknown[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${typeEmoji[log.type] ?? ":memo:"} ${clip(title, 140)}`,
        emoji: true,
      },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: mrkdwn(clip(log.description, 2900)) },
    },
    ...(log.recording
      ? [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `:movie_camera: *<${mrkdwn(log.recording.url)}|${mrkdwn(labels.recording)}>* · ${formatDuration(log.recording.durationMs)}`,
            },
          },
        ]
      : []),
    {
      type: "section",
      fields: fields.map((text) => ({ type: "mrkdwn", text })),
    },
  ];
  if (metadata.length)
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: clip(metadata.join("   "), 2900) }],
    });
  if (trail.length)
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${mrkdwn(labels.diagnosticTrail)}* · ${consoleEntries.length} ${mrkdwn(labels.console)} · ${networkEntries.length} ${mrkdwn(labels.network)}\n\`\`\`${mrkdwn(clip(trail.join("\n"), 2800))}\`\`\``,
      },
    });
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `${hasScreenshot ? `:paperclip: ${mrkdwn(labels.screenshotInThread)} · ` : ""}${log.id} · <!date^${Math.floor(Date.parse(log.createdAt) / 1000)}^{date_short_pretty} {time}|${log.createdAt}>`,
      },
    ],
  });
  return {
    text: clip(`[${type}] ${log.shortId} · ${firstLine}`, 300),
    blocks,
  };
}

export function slackLayer(config: SlackConfig) {
  const { call, upload } = slackClient(config);
  const labels = { ...defaultSlackLabels, ...config.labels };
  return Layer.succeed(Delivery, {
    deliver: Effect.fn("deliverSlack")(function* (
      log: DeliveredLog,
      screenshot?: ParsedScreenshot,
      target?: { readonly slackChannel?: string },
    ) {
      // The handler resolves fixed, per-Type and Reporter-chosen channels.
      const channel = target?.slackChannel;
      if (!channel)
        return yield* new DeliveryFailed({
          channel: "slack",
          message: "No Slack channel",
        });
      return yield* Effect.gen(function* () {
        // Upload the bytes first: nothing is visible until the message posts, so a failed
        // upload retries cleanly instead of leaving a report without its Screenshot.
        const file = screenshot
          ? yield* call("files.getUploadURLExternal", {
              filename: `support-log-${log.id}.png`,
              length: String(screenshot.bytes.byteLength),
              alt_txt: `${labels.screenshot} ${log.shortId}`,
            }).pipe(
              Effect.tap((body) =>
                upload(String(body.upload_url), screenshot.bytes),
              ),
            )
          : undefined;
        const message = slackMessage(log, file !== undefined, labels);
        const posted = yield* call("chat.postMessage", {
          channel,
          text: message.text,
          blocks: JSON.stringify(message.blocks),
          unfurl_links: "false",
          unfurl_media: "false",
        });
        if (!file) return;
        // The report is already visible. Resending it for a failed share would post it twice.
        yield* call("files.completeUploadExternal", {
          files: JSON.stringify([
            {
              id: String(file.file_id),
              title: `${labels.screenshot} ${log.shortId}`,
            },
          ]),
          channel_id: String(posted.channel),
          thread_ts: String(posted.ts),
        }).pipe(
          Effect.catchAll((failure) =>
            Effect.sync(() =>
              console.error(
                `shotlog: Slack report ${log.shortId} posted, but sharing its Screenshot failed with ${failure.error}`,
              ),
            ),
          ),
        );
      }).pipe(
        // Four calls with retries could outlast the client's 60-second budget.
        Effect.timeoutFail({
          duration: 40_000,
          onTimeout: () =>
            new SlackFailure({
              method: "delivery",
              error: "timeout",
              retryable: true,
            }),
        }),
        Effect.mapError(toDeliveryFailed),
      );
    }),
  });
}
