# ADR-0005: Model the Annotation Editor on Shottr

**Status:** Accepted, 2026-09-28

## Context
The Reporter needs to mark up the Screenshot. The reference for how that should look and feel is [Shottr](https://shottr.cc), a macOS screenshot tool known for a fast annotation editor that relies heavily on keyboard shortcuts.

## Decision
- The Annotation Editor aims to match Shottr's feel: pick a tool, drag to draw, then everything stays editable (select, move, restyle, delete, copy/paste, Opt/Alt-drag to duplicate), with single-key tool shortcuts and undo/redo.
- **The Annotation Editor opens as a full-viewport overlay**, not inside the Report Card. A Shottr-style editor can't fit in a small pop-up. After editing, the Reporter returns to the Report Card with a thumbnail of the annotated Screenshot.
- Output is a **flattened PNG** with annotations and redactions baked in. The un-annotated original never leaves the browser.

## Scope tiers
- **v1:**
  - Select/Move
  - Arrow, straight and curved
  - Rectangle, with a rounded-corners option
  - Oval
  - Text
  - Freehand
  - Highlighter
  - Step Counter
  - Spotlight
  - Pixelate/Redact
  - Crop
  - Colour and thickness controls
- **Later:**
  - Blur
  - Magnifier callout
  - Hand-drawn style
- **Out:**
  - Backdrop (gradient, shadow): used for making shareable marketing shots, which doesn't apply to support.
  - Image overlay
  - Content-aware "remove object"

## Redaction
- Pixelate/Redact uses **coarse** blocks, so the text underneath can't be recovered.
- It also has a **solid fill** option.
- Both are applied permanently when the image is flattened.
- Shottr's lighter blur isn't used for redaction.

## Consequences
- The Annotation Editor is the largest piece of the library, bigger than capture and delivery combined.
- The keyboard shortcuts must not leak to the Host App while the editor is open.
