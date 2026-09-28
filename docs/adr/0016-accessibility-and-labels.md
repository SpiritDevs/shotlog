# ADR-0016: Accessibility and translation baseline

**Status:** Accepted, 2026-09-28

## Decision

### Accessibility
- **Launcher:** a real `<button>` with an accessible name.
- **Report Card:**
  - Traps focus while open, closes on Esc, and returns focus to wherever it was.
  - Controls are labelled.
  - Screen readers announce submission progress, success, and errors.
- **Annotation Editor:**
  - Every tool has a keyboard shortcut and a labelled toolbar button.
  - The selected Annotation can be moved with the arrow keys and removed with Delete.
  - Full screen-reader support isn't a goal, because it's a drawing tool. Instead, **the Screenshot is always optional**, so every Reporter can submit a complete Support Log.
- Respects `prefers-reduced-motion`. Both themes meet WCAG AA contrast.

### Translation
- English only in v1.
- **Every piece of text is replaceable** through a fully typed `labels` prop on the client. The server's email template has its own typed `labels`.
- No built-in language packs, and no translation library dependency.

## Consequences
- Accessibility is covered by the end-to-end tests (e.g. an axe check on the Report Card) under ADR-0013.
- The `labels` keys are part of the public API snapshot, so renaming one counts as a breaking change.
