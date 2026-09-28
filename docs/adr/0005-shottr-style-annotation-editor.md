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
- Resampled exports redact source pixels before resizing, then reapply redaction at output resolution so filtering cannot expose original masked pixels and pixelation stays coarse.
- Shottr's lighter blur isn't used for redaction.

## Consequences
- The Annotation Editor is the largest piece of the library, bigger than capture and delivery combined.
- The editor stops keyboard propagation while open and retains a temporary guard for held keys when it closes, until release or window blur. Enter and Space preserve focused controls' native actions; bare Enter completes editing only on the canvas or stage.
- Host capture-phase keyboard listeners registered earlier still see editor keys; ignore events whose composedPath() includes the shotlog host. A later listener cannot pre-empt an earlier capture listener on the same target. The host is the element marked `data-shotlog`; no additional API is exported.
- Done commits an active drawing, move, or resize before flattening the scene used for preview. Applying a crop retains its existing confirmation step.
- Undo retains at most 100 entries. Arrow-key nudges within 500 ms on the same selection form one transaction; other edits and selection changes end that group.
