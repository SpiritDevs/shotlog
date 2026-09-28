# ADR-0004: Hybrid screenshot capture

**Status:** Accepted, 2026-09-28

## Context
A web page can't natively screenshot itself.
- Rebuilding the page as an image from the DOM is instant and needs no permission, but misses cross-origin iframes, video, some canvas/WebGL content, cross-origin images without CORS, and some CSS effects.
- The browser's screen-capture API (`getDisplayMedia`) gives the real pixels, but prompts every time, isn't available on most mobile browsers (including iOS Safari), and the user can pick the wrong surface.

## Decision
The Report Card offers three Capture Methods:
1. **Page Render** (default, one tap): rebuilds the page as an image (e.g. `modern-screenshot` / `html-to-image`).
2. **Screen Capture** (fallback, labelled "Capture exact screen"): uses `getDisplayMedia`. Only offered where the browser supports it.
3. **Paste / Upload**: the Reporter supplies their own image.

The Launcher and Report Card are hidden during Page Render and Screen Capture so they don't appear in the Screenshot.

A Support Log has **at most one Screenshot** in v1. This is a default we chose; revisit if Reporters need more than one.

## Consequences
- Most apps get a one-tap capture that works everywhere, and there's always a way out when Page Render comes out wrong.
- There are two capture code paths to maintain and test across browsers.
- The Screen Capture option must be hidden where it isn't supported, not shown and then fail.
