# ADR-0001: React npm library with Standalone and Programmatic modes

**Status:** Accepted, 2026-09-28

## Context
The widget has to be easy to add to any React app. Some Host Apps want a ready-made floating button. Others want to open the Report Card from their own UI.

## Decision
- Ship it as an npm package for React. A plain JS build is a possible later addition and is out of scope for now.
- Support two modes:
  - **Standalone Mode**: the library renders a floating Launcher in a bottom corner.
  - **Programmatic Mode**: the library exposes an API (e.g. a hook and/or imperative `open()`) so the Host App can open the Report Card from anywhere.

## Consequences
- The Report Card, annotation editor, and submit flow are built once and shared by both modes.
- Staying React-only for now lets us use React state and portals freely. A later plain JS build would need a wrapper or a separate entry point.
