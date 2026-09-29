import { expect, test } from "vitest";
import * as ptBR from "../src/locales/pt-BR.js";
import { renderEmail } from "../src/server/email-template.js";
import { slackMessage } from "../src/server/slack.js";
import { submission } from "./server/fixtures.js";

test("pt-BR server labels translate Types and headings in email and Slack", () => {
  const log = { ...submission(), type: "Question", reporter: { name: "Ana" } };
  const email = renderEmail(
    {
      to: "suporte@example.com",
      from: "relatos@example.com",
      provider: { name: "test", send: async () => {} },
      labels: ptBR.emailLabels,
    },
    log,
  );
  expect(email.subject).toMatch(/^\[Dúvida\] SL-/);
  expect(email.html).toContain('<html lang="pt-BR">');
  expect(email.html).toContain("Descrição");

  const slack = JSON.stringify(slackMessage(log, true, ptBR.slackLabels));
  expect(slack).toContain(`Dúvida · ${log.shortId}`);
  expect(slack).toContain("Captura de tela na conversa");
  expect(slack).not.toContain("Reporter");
});
