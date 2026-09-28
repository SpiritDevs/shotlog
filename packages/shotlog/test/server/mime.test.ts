import { simpleParser } from "mailparser";
import { expect, test } from "vitest";
import { renderEmail } from "../../src/server/email-template.js";
import { buildMime } from "../../src/server/mime.js";
import { png, submission } from "./fixtures.js";

test("MIME round trips nested boundaries, CID and attached PNG, UTF-8 subject, and CRLF", async () => {
  const log = {
    ...submission(),
    description: "Café 🚀 ".repeat(20),
    reporter: { email: "ada@example.com" },
  };
  const message = renderEmail(
    {
      from: "Shotlog <reports@example.com>",
      to: ["support@example.com", "team@example.com"],
      provider: { name: "test", send: async () => {} },
    },
    log,
    { bytes: png, width: 1, height: 1 },
  );
  const bytes = buildMime(message);
  const raw = new TextDecoder().decode(bytes);
  expect(raw.replaceAll("\r\n", "")).not.toMatch(/[\r\n]/);
  const boundaries = Array.from(
    raw.matchAll(/Content-Type: multipart\/(\w+); boundary="([^"]+)"/g),
  );
  expect(boundaries.map((match) => match[1])).toEqual([
    "mixed",
    "related",
    "alternative",
  ]);
  expect(new Set(boundaries.map((match) => match[2])).size).toBe(3);
  for (const boundary of boundaries)
    expect(raw).toContain(`--${boundary[2]}--\r\n`);
  expect(raw).toMatch(/Subject: =\?UTF-8\?B\?/);
  for (const word of raw.match(/=\?UTF-8\?B\?[^?]+\?=/g) ?? [])
    expect(word.length).toBeLessThanOrEqual(75);
  const bodies = Array.from(
    raw.matchAll(
      /Content-Transfer-Encoding: base64\r\n(?:[^\r\n]+\r\n)*\r\n([A-Za-z0-9+/=\r\n]*?)\r\n--/g,
    ),
  );
  expect(bodies).toHaveLength(4);
  for (const part of bodies) {
    for (const line of (part[1] ?? "").split("\r\n").filter(Boolean))
      expect(line).toMatch(/^[A-Za-z0-9+/=]{1,76}$/);
  }
  const parsed = await simpleParser(Buffer.from(bytes), {
    skipImageLinks: true,
  });
  expect(parsed.subject).toBe(message.subject);
  expect(parsed.text?.replaceAll("\r\n", "\n").trimEnd()).toBe(
    message.text.trimEnd(),
  );
  expect(parsed.replyTo?.value[0]?.address).toBe("ada@example.com");
  expect(parsed.attachments).toHaveLength(2);
  expect(parsed.attachments[0]?.cid).toBe(message.attachments[0]?.contentId);
  expect(parsed.html).toContain(`cid:${parsed.attachments[0]?.cid}`);
  expect(
    parsed.attachments.map((attachment) => attachment.contentDisposition),
  ).toEqual(["inline", "attachment"]);
  for (const attachment of parsed.attachments)
    expect(new Uint8Array(attachment.content)).toEqual(png);
});
