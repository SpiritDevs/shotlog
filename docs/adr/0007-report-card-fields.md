# ADR-0007: Report Card fields

**Status:** Accepted, 2026-09-28

## Context
The Report Card must stay small and quick. Whoever triages reports still needs enough structure to sort them and to build a useful email subject.

## Decision
The Report Card contains, from top to bottom:
1. **Type** chips: Bug · Question · Idea. Bug is the default. The Host App can replace the list (e.g. add "Billing") or hide it.
   - Options are strings or `{ value, label? }`. Only the value is delivered. An explicit label wins; otherwise Bug, Question, and Idea use the corresponding translated labels, and other values label themselves.
2. **Description**: a single text box with the prompt "What were you trying to do?". This is the only required field.
3. **Screenshot** button: opens capture and then the Annotation Editor. It becomes a thumbnail once a Screenshot is attached. Optional.
4. **Included Details**: collapsed by default (ADR-0006).
5. **Submit**.

The email subject is built from the Type and the first line of the Description, e.g. `[Bug] Save button does nothing on /settings`. The Type is included in the webhook JSON so reports can be routed.

Custom fields added by the Host App (e.g. a severity picker) are **not in v1**. The Host App can pass that kind of data through `metadata` instead.

## Consequences
- Reporting takes one tap plus one text box, and reports can still be triaged by Type.
- Adding custom fields later would change the payload schema, so it's worth leaving room for them in the schema now.
