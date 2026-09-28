# ADR-0010: Shadow DOM style isolation, themed with CSS variables

**Status:** Accepted, 2026-09-28

## Context
The widget runs inside arbitrary React apps. The Host App's global CSS (resets, Tailwind preflight, element selectors) can break the widget's UI. CSS leaking out of the widget would break the Host App, which is worse.

## Decision
- The Launcher, Report Card, and Annotation Editor render inside a **shadow root** that the library owns, via a React portal. Styles can't get in or out.
- **Theming** works through:
  - `theme`: `"light" | "dark" | "auto"` (default `auto`, follows `prefers-color-scheme`)
  - `accent`: a colour
  - `position`: `"bottom-right" | "bottom-left"`, for the Launcher in Standalone Mode
  - CSS custom properties (`--shotlog-accent`, `--shotlog-radius`, `--shotlog-font`, ...) for everything else. These pass into the shadow root by design.
- Fully restyling or replacing the Report Card's markup is **not in v1**.

## Consequences
- The widget looks the same in every Host App regardless of their CSS.
- Pointer and keyboard handling (drawing, tool shortcuts) must be tested inside the shadow root. Keyboard events must not leak to the Host App while the Annotation Editor is open (see ADR-0005).
- Page Render capture never has to deal with the shadow root, because the widget is hidden during capture (ADR-0004).
- Styles ship as a string injected into the shadow root, not as a separate CSS file the Host App has to import.
