---
"shotlog": minor
---

Brazilian Portuguese, and translatable emails and Slack messages.

- `shotlog/locales/pt-BR` exports `labels` for the widget, and `emailLabels` and `slackLabels` for the server. Import it with `import * as ptBR from "shotlog/locales/pt-BR"`.
- `ShotlogLabels.lang` (default `en`) is set as the widget's `lang` attribute.
- `delivery.slack.labels` (`Partial<SlackLabels>`) and `defaultSlackLabels` translate Slack messages.
- `EmailLabels` gains `lang` for `<html lang>` and `type`, which names Type values in the subject and heading. Both default to the previous English output.
