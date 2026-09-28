import type { EmailAttachment, EmailMessage } from "./email-types.js";

const crlf = "\r\n";
const encoder = new TextEncoder();

export function base64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  }
  return btoa(chunks.join(""));
}

function encodedWords(value: string): string {
  const words: string[] = [];
  let chunk = "";
  // Keep encoded words below RFC 2047's 75 characters without splitting UTF-8 characters.
  for (const character of value) {
    if (encoder.encode(chunk + character).length > 42) {
      words.push(`=?UTF-8?B?${base64(encoder.encode(chunk))}?=`);
      chunk = "";
    }
    chunk += character;
  }
  if (chunk) words.push(`=?UTF-8?B?${base64(encoder.encode(chunk))}?=`);
  return words.join(`${crlf} `);
}

function header(value: string): string {
  if (
    Array.from(value).some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    throw new Error("Invalid email header");
  return value;
}

function subjectHeader(value: string): string {
  header(value);
  return /[^\x20-\x7e]/.test(value) || value.length > 68
    ? encodedWords(value)
    : value;
}

function mailbox(value: string): string {
  header(value);
  const named = /^(.*?)\s*<([^<>]+)>$/.exec(value);
  if (named?.[1] && named[2]) {
    const name = named[1].trim().replace(/^"(.*)"$/, "$1");
    const displayName = /[^\x20-\x7e]/.test(name)
      ? encodedWords(name)
      : `"${name.replace(/["\\]/g, "\\$&")}"`;
    return `${displayName} <${mailbox(named[2])}>`;
  }
  if (
    !/^[^\s<>@,;:]+@[^\s<>@,;:]+$/.test(value) ||
    /[^\x21-\x7e]/.test(value) ||
    value.length > 254
  ) {
    throw new Error("Invalid email address");
  }
  return value;
}

function encodedBody(bytes: Uint8Array): string {
  return (
    base64(bytes)
      .match(/.{1,76}/g)
      ?.join(crlf) ?? ""
  );
}

function textPart(type: string, value: string): string {
  return [
    `Content-Type: ${type}; charset=utf-8`,
    "Content-Transfer-Encoding: base64",
    "",
    encodedBody(encoder.encode(value.replace(/\r\n|\r|\n/g, crlf))),
  ].join(crlf);
}

function attachmentPart(attachment: EmailAttachment): string {
  const { filename, contentType, contentId, content } = attachment;
  header(filename);
  if (!/^[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+$/.test(contentType))
    throw new Error("Invalid attachment content type");
  if (
    contentId !== undefined &&
    (!/^[\x21-\x7e]+$/.test(contentId) || /[<>]/.test(contentId))
  )
    throw new Error("Invalid attachment content ID");
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return [
    `Content-Type: ${contentType}`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: ${contentId ? "inline" : "attachment"}; filename="${safeFilename}";`,
    ` filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)}`,
    ...(contentId ? [`Content-ID: <${contentId}>`] : []),
    "",
    encodedBody(content),
  ].join(crlf);
}

function multipart(
  type: string,
  boundary: string,
  parts: readonly string[],
): string {
  return [
    `Content-Type: multipart/${type}; boundary="${boundary}"`,
    "",
    ...parts.flatMap((part) => [`--${boundary}`, part]),
    `--${boundary}--`,
  ].join(crlf);
}

/** RFC 5322 / 2045 message: mixed > related > alternative, with a separate downloadable PNG. */
export function buildMime(message: EmailMessage): Uint8Array {
  const id = crypto.randomUUID();
  const alternative = multipart("alternative", `shotlog_alt_${id}`, [
    textPart("text/plain", message.text),
    textPart("text/html", message.html),
  ]);
  const related = multipart("related", `shotlog_rel_${id}`, [
    alternative,
    ...message.attachments
      .filter((attachment) => attachment.contentId !== undefined)
      .map(attachmentPart),
  ]);
  const mixed = multipart("mixed", `shotlog_mix_${id}`, [
    related,
    ...message.attachments
      .filter((attachment) => attachment.contentId === undefined)
      .map(attachmentPart),
  ]);
  return encoder.encode(
    [
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${id}@shotlog>`,
      `From: ${mailbox(message.from)}`,
      `To: ${message.to.map(mailbox).join(`,${crlf} `)}`,
      ...(message.replyTo ? [`Reply-To: ${mailbox(message.replyTo)}`] : []),
      `Subject: ${subjectHeader(message.subject)}`,
      "MIME-Version: 1.0",
      mixed,
      "",
    ].join(crlf),
  );
}
