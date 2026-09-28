import { type ParsedMail, simpleParser } from "mailparser";
import { SMTPServer } from "smtp-server";
import { expect, test } from "vitest";
import { createSupportHandler } from "../../src/server.js";
import { smtp } from "../../src/smtp.js";
import { png, request, submission } from "./fixtures.js";

test("SMTP delivers a real multipart report with server recipients, Reply-To, and both PNG copies", async () => {
  const inbox: ParsedMail[] = [];
  const recipients: string[] = [];
  const server = new SMTPServer({
    authOptional: true,
    disabledCommands: ["AUTH", "STARTTLS"],
    onRcptTo(address, _session, callback) {
      recipients.push(address.address);
      callback();
    },
    onData(stream, _session, callback) {
      void simpleParser(stream, { skipImageLinks: true })
        .then((mail) => {
          inbox.push(mail);
          callback();
        })
        .catch((error: Error) => callback(error));
    },
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    const address = server.server.address();
    if (!address || typeof address === "string")
      throw new Error("No SMTP address");
    const handler = createSupportHandler({
      delivery: {
        email: {
          from: "Shotlog <reports@example.com>",
          to: ["support@example.com", "team@example.com"],
          provider: smtp({ host: "127.0.0.1", port: address.port }),
        },
      },
      authorize: () => true,
      rateLimit: false,
    });
    const log = {
      ...submission(),
      reporter: { email: "reporter@example.com", to: "attacker@example.com" },
    };
    const response = await handler(
      request(log, new Blob([png], { type: "image/png" })),
    );
    expect(response.status).toBe(200);
    expect(recipients).toEqual(["support@example.com", "team@example.com"]);
    expect(inbox).toHaveLength(1);
    const mail = inbox[0];
    expect(mail?.from?.value[0]?.address).toBe("reports@example.com");
    expect(mail?.replyTo?.value[0]?.address).toBe("reporter@example.com");
    expect(mail?.subject).toBe(`[Bug] ${log.shortId} · ${log.description}`);
    expect(mail?.text).toContain(log.description);
    expect(mail?.attachments).toHaveLength(2);
    expect(mail?.html).toContain(`cid:${mail?.attachments[0]?.cid}`);
    for (const attachment of mail?.attachments ?? [])
      expect(new Uint8Array(attachment.content)).toEqual(png);
    expect((await handler(request(log))).status).toBe(200);
    expect(inbox).toHaveLength(1);
  } finally {
    await new Promise<void>((resolve) => server.close(resolve));
  }
});
