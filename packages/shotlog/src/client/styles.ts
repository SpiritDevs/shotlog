export const styles = `
:host {
  all: initial;
  position: fixed !important;
  inset: 0 !important;
  z-index: var(--shotlog-z-index, 2147483000) !important;
  pointer-events: none !important;
}
.shotlog {
  --_surface: var(--shotlog-surface, #ffffff);
  --_raised: #ffffff;
  --_text: var(--shotlog-text, #17181c);
  --_muted: var(--shotlog-muted, #62646c);
  --_line: var(--shotlog-border, #e6e7eb);
  --_line-strong: #cfd0d6;
  --_field: var(--shotlog-field, #f4f4f6);
  --_focus: var(--shotlog-focus, #17181c);
  --_error: var(--shotlog-error, #b42318);
  --_success: var(--shotlog-success, #166534);
  --_backdrop: var(--shotlog-backdrop, #0000000d);
  --_shadow: var(--shotlog-shadow, 0 1px 2px #0000000a, 0 4px 12px #0000000f, 0 28px 64px -16px #0000004d);
  --_accent: var(--shotlog-accent, #4f46e5);
  --_on-accent: var(--shotlog-accent-text, #ffffff);
  --_radius: var(--shotlog-radius, 20px);
  --_control-radius: var(--shotlog-control-radius, 10px);
  --_offset: var(--shotlog-offset, 24px);
  --_launcher: var(--shotlog-launcher-size, 52px);
  --_ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --_ease-in: cubic-bezier(0.4, 0, 1, 1);
  color-scheme: light;
  color: var(--_text);
  font-family: var(--shotlog-font, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  font-size: var(--shotlog-font-size, 14px);
  font-weight: var(--shotlog-font-weight, 400);
  line-height: var(--shotlog-line-height, 1.5);
  text-align: start;
  -webkit-font-smoothing: antialiased;
}
.shotlog[data-theme="dark"] {
  --_surface: var(--shotlog-surface, #1f2024);
  --_raised: #3a3b42;
  --_text: var(--shotlog-text, #f3f3f5);
  --_muted: var(--shotlog-muted, #a4a6ad);
  --_line: var(--shotlog-border, #33343a);
  --_line-strong: #494a52;
  --_field: var(--shotlog-field, #2a2b30);
  --_focus: var(--shotlog-focus, #f3f3f5);
  --_error: var(--shotlog-error, #fca5a5);
  --_success: var(--shotlog-success, #86efac);
  --_backdrop: var(--shotlog-backdrop, #00000033);
  --_shadow: var(--shotlog-shadow, 0 1px 2px #00000052, 0 4px 12px #0000003d, 0 28px 64px -16px #000000b3);
  color-scheme: dark;
}
@media (prefers-color-scheme: dark) {
  .shotlog[data-theme="auto"] {
    --_surface: var(--shotlog-surface, #1f2024);
    --_raised: #3a3b42;
    --_text: var(--shotlog-text, #f3f3f5);
    --_muted: var(--shotlog-muted, #a4a6ad);
    --_line: var(--shotlog-border, #33343a);
    --_line-strong: #494a52;
    --_field: var(--shotlog-field, #2a2b30);
    --_focus: var(--shotlog-focus, #f3f3f5);
    --_error: var(--shotlog-error, #fca5a5);
    --_success: var(--shotlog-success, #86efac);
    --_backdrop: var(--shotlog-backdrop, #00000033);
    --_shadow: var(--shotlog-shadow, 0 1px 2px #00000052, 0 4px 12px #0000003d, 0 28px 64px -16px #000000b3);
    color-scheme: dark;
  }
}
*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
button, textarea, input { font: inherit; color: inherit; margin: 0; }
button { cursor: pointer; -webkit-tap-highlight-color: transparent; }
button:disabled, fieldset:disabled .chip { cursor: default; }
button:disabled { opacity: var(--shotlog-disabled-opacity, 0.55); }
:is(button, textarea, summary, .details-content):focus-visible, .chip:has(input:focus-visible) {
  outline: var(--shotlog-focus-width, 2px) solid var(--_focus);
  outline-offset: var(--shotlog-focus-offset, 2px);
}

/* Launcher */
.launcher {
  position: fixed;
  width: fit-content;
  height: fit-content;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: var(--_launcher);
  padding: 0 20px 0 16px;
  border: 0;
  border-radius: 999px;
  background: var(--_accent);
  color: var(--_on-accent);
  font-weight: var(--shotlog-strong-weight, 600);
  box-shadow: 0 1px 2px #00000029, 0 10px 28px -8px #00000066;
  pointer-events: auto;
  transition: transform 220ms var(--_ease-out), opacity 160ms ease-out 40ms, box-shadow 200ms ease, visibility 0s;
}
.launcher[data-content="icon"] { width: var(--_launcher); padding: 0; border-radius: var(--shotlog-launcher-radius, 50%); }
.launcher[data-content="text"] { padding: 0 20px; }
.launcher:hover { transform: translateY(-1px); box-shadow: 0 2px 4px #00000029, 0 14px 32px -8px #0000007a; }
.launcher:active { transform: scale(0.96); transition-duration: 80ms; }
.launcher[data-open="true"] {
  visibility: hidden;
  opacity: 0;
  transform: scale(2.4);
  pointer-events: none;
  transition: transform 260ms var(--_ease-out), opacity 140ms ease-in, visibility 0s linear 260ms;
}
.launcher-icon { display: inline-flex; line-height: 0; }
.launcher-icon > svg, .launcher-icon > img { width: 22px; height: 22px; }
.launcher[data-content="icon"] .launcher-icon > svg,
.launcher[data-content="icon"] .launcher-icon > img { width: 24px; height: 24px; }

/* Overlay and card */
.overlay {
  position: fixed;
  inset: 0;
  pointer-events: auto;
  background: var(--_backdrop);
  animation: fade-in 260ms var(--_ease-out) both;
}
.overlay[data-state="closing"] { pointer-events: none; animation: fade-out 200ms var(--_ease-in) both; }
.card {
  position: fixed;
  display: flex;
  flex-direction: column;
  width: var(--_card-w, var(--shotlog-card-width, 384px));
  height: fit-content;
  min-height: min(var(--_card-h, 0px), calc(100dvh - var(--_offset) * 2));
  max-width: calc(100vw - var(--_offset) * 2);
  max-height: calc(100dvh - var(--_offset) * 2);
  overflow: hidden;
  border: 1px solid var(--_line);
  border-radius: var(--_radius);
  background: var(--_surface);
  box-shadow: var(--_shadow);
  animation: card-open 280ms var(--_ease-out) both;
}
.card > .heading { flex: none; padding: 20px 20px 0; }
.card-body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 0 20px 20px;
}
.card-body > * { flex: none; }
.card-body > form { flex: 1 0 auto; display: flex; flex-direction: column; }
.card-body > form > * { flex: none; }
.card-body > form > .field { flex: 1 0 auto; }
/* The Launcher and the card share an anchor; the morph scales from that point. */
[data-position="bottom-right"] :is(.launcher, .card) { inset: auto var(--_offset) var(--_offset) auto; transform-origin: 100% 100%; }
[data-position="bottom-left"] :is(.launcher, .card) { inset: auto auto var(--_offset) var(--_offset); transform-origin: 0 100%; }
[data-position="top-right"] :is(.launcher, .card) { inset: var(--_offset) var(--_offset) auto auto; transform-origin: 100% 0; }
[data-position="top-left"] :is(.launcher, .card) { inset: var(--_offset) auto auto var(--_offset); transform-origin: 0 0; }
[data-position="top-center"] :is(.launcher, .card) { inset: var(--_offset) 0 auto 0; margin-inline: auto; transform-origin: 50% 0; }
[data-position="bottom-center"] :is(.launcher, .card) { inset: auto 0 var(--_offset) 0; margin-inline: auto; transform-origin: 50% 100%; }
[data-position="center"] :is(.launcher, .card) { inset: 0; margin: auto; transform-origin: 50% 50%; }
.overlay[data-state="closing"] .card { animation: card-close 200ms var(--_ease-in) both; }
/* Without a Launcher to morph from, the card scales and fades from its anchor. */
[data-mode="programmatic"] .card { animation-name: card-open-anchor; }
[data-mode="programmatic"] .overlay[data-state="closing"] .card { animation-name: card-close-anchor; }

/* Resize handle, diagonally opposite the anchor */
.resize {
  position: absolute;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--_muted);
  opacity: 0.55;
  touch-action: none;
  transition: opacity 120ms ease, color 120ms ease;
}
.resize:hover, .resize:focus-visible { opacity: 1; color: var(--_text); }
.resize:focus-visible { outline-offset: -2px; }
.resize svg { width: 11px; height: 11px; }
[data-corner="bottom-right"] .resize { right: 3px; bottom: 3px; cursor: nwse-resize; }
[data-corner="top-left"] .resize { left: 3px; top: 3px; cursor: nwse-resize; }
[data-corner="top-left"] .resize svg { transform: rotate(180deg); }
[data-corner="top-right"] .resize { right: 3px; top: 3px; cursor: nesw-resize; }
[data-corner="top-right"] .resize svg { transform: rotate(-90deg); }
[data-corner="bottom-left"] .resize { left: 3px; bottom: 3px; cursor: nesw-resize; }
[data-corner="bottom-left"] .resize svg { transform: rotate(90deg); }
.heading, form > *, .success-mark, .status {
  animation: rise 320ms var(--_ease-out) both;
  animation-delay: calc(70ms + var(--_i, 0) * 30ms);
}
form > :nth-child(1) { --_i: 1; }
form > :nth-child(2) { --_i: 2; }
form > :nth-child(3) { --_i: 3; }
form > :nth-child(4) { --_i: 4; }
form > :nth-child(5) { --_i: 5; }
.success-mark { --_i: 1; }
.status { --_i: 2; }

/* Header */
.heading { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
h2 {
  flex: 1;
  margin: 0;
  font-size: var(--shotlog-title-size, 18px);
  font-weight: var(--shotlog-strong-weight, 600);
  line-height: 1.3;
  letter-spacing: -0.01em;
}
.close {
  display: grid;
  place-items: center;
  flex: none;
  width: 30px;
  height: 30px;
  margin: -4px -6px -4px 0;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--_muted);
  transition: background-color 120ms ease, color 120ms ease;
}
.close:hover { background: var(--_field); color: var(--_text); }
.close svg { width: 16px; height: 16px; }

/* Type */
fieldset { margin: 0 0 14px; padding: 0; border: 0; min-width: 0; }
legend { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.chips { display: flex; flex-wrap: wrap; gap: 2px; padding: 3px; border-radius: var(--_control-radius); background: var(--_field); }
.chip {
  position: relative;
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  padding: 0 12px;
  border-radius: calc(var(--_control-radius) - 3px);
  color: var(--_muted);
  font-weight: 500;
  cursor: pointer;
  user-select: none;
  transition: color 120ms ease;
}
.chip:hover { color: var(--_text); }
.chip:has(input:checked) { background: var(--_raised); color: var(--_text); box-shadow: 0 1px 2px #0000001f, 0 0 0 1px #0000000a; }
.chip input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: inherit; }

/* Description */
.field { display: grid; grid-template-rows: auto 1fr; gap: 6px; margin-bottom: 12px; }
.field label { font-weight: 500; }
textarea {
  display: block;
  width: 100%;
  min-height: var(--shotlog-textarea-height, 116px);
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: var(--_control-radius);
  background: var(--_field);
  resize: vertical;
  transition: background-color 120ms ease, border-color 120ms ease;
}
textarea:hover { border-color: var(--_line-strong); }
textarea:focus-visible { background: var(--_surface); border-color: transparent; outline-offset: 0; }
textarea:disabled { opacity: var(--shotlog-disabled-opacity, 0.55); }

/* Screenshot */
.screenshot-controls { position: relative; }
.attachment {
  display: flex;
  align-items: center;
  min-height: 44px;
  border: 1px dashed var(--_line-strong);
  border-radius: var(--_control-radius);
  transition: border-color 120ms ease;
}
.attachment:hover { border-color: var(--_muted); }
.attachment[data-attached="true"] { padding: 5px 6px 5px 5px; gap: 10px; border-style: solid; border-color: var(--_line); }
.attachment[data-attached="true"]:hover { border-color: var(--_line-strong); }
.attachment-main, .attachment-more {
  min-height: 42px;
  padding: 0;
  border: 0;
  background: transparent;
  transition: background-color 120ms ease, color 120ms ease;
}
.attachment-main {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  border-radius: calc(var(--_control-radius) - 1px) 0 0 calc(var(--_control-radius) - 1px);
  font-weight: 500;
  text-align: start;
}
.attachment-main svg { flex: none; color: var(--_muted); }
.attachment-more {
  display: grid;
  place-items: center;
  width: 38px;
  border-left: 1px dashed var(--_line-strong);
  border-radius: 0 calc(var(--_control-radius) - 1px) calc(var(--_control-radius) - 1px) 0;
  color: var(--_muted);
}
.attachment-main:hover:not(:disabled), .attachment-more:hover:not(:disabled) { background: var(--_field); color: var(--_text); }
.attachment-main:focus-visible, .attachment-more:focus-visible, .menu button:focus-visible, .quiet:focus-visible { outline-offset: -2px; }
.attachment-more svg { width: 16px; height: 16px; transition: transform 160ms var(--_ease-out); }
.attachment-more[aria-expanded="true"] svg { transform: rotate(180deg); }
.screenshot-preview { display: block; flex: none; width: 56px; height: 40px; object-fit: cover; border-radius: 6px; background: var(--_field); }
.attachment-actions { display: flex; gap: 2px; margin-left: auto; }
.quiet {
  min-height: 32px;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--_muted);
  font-weight: 500;
  transition: background-color 120ms ease, color 120ms ease;
}
.quiet:hover:not(:disabled) { background: var(--_field); color: var(--_text); }
.menu {
  position: absolute;
  right: 0;
  bottom: calc(100% + 6px);
  z-index: 1;
  display: grid;
  min-width: 208px;
  padding: 4px;
  border: 1px solid var(--_line);
  border-radius: 12px;
  background: var(--_surface);
  box-shadow: var(--_shadow);
  transform-origin: 100% 100%;
  animation: menu-in 140ms var(--_ease-out) both;
}
.menu button {
  min-height: 32px;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  text-align: start;
}
.menu button:hover { background: var(--_field); }
.capture-status { margin-top: 6px; font-size: 12px; color: var(--_muted); }
.capture-status:empty { display: none; }
.capture-status[data-error="true"] { color: var(--_error); }

/* Included details */
.included-details { margin: 8px 0 14px; font-size: 13px; }
.included-details summary {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  margin: 0 -8px;
  padding: 0 8px;
  border-radius: 8px;
  list-style: none;
  cursor: pointer;
  color: var(--_muted);
  font-weight: 500;
  transition: color 120ms ease;
}
.included-details summary::-webkit-details-marker { display: none; }
.included-details summary:hover { color: var(--_text); }
.disclosure { flex: none; width: 14px; height: 14px; transition: transform 160ms var(--_ease-out); }
.included-details[open] .disclosure { transform: rotate(90deg); }
.summary-title { flex: 1; }
.badge {
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--_field);
  font-size: 11px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.details-content {
  max-height: 240px;
  overflow: auto;
  overscroll-behavior: contain;
  margin-top: 4px;
  padding: 10px 12px;
  border-radius: var(--_control-radius);
  background: var(--_field);
  font-size: 12px;
}
.details-content h3 { margin: 12px 0 4px; font-size: 12px; font-weight: 600; }
.details-content h4 { margin: 8px 0 2px; font-size: 12px; font-weight: 500; color: var(--_muted); }
.details-content p { margin: 4px 0; }
.details-content .details-note { margin: 0; color: var(--_muted); }
.details-content ol { margin: 0; padding-left: 16px; }
.detail-rows { margin: 0; }
.detail-rows > div { display: grid; grid-template-columns: minmax(0, 104px) minmax(0, 1fr); gap: 8px; padding: 2px 0; }
.detail-rows dt, .detail-rows dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.detail-rows dt { color: var(--_muted); }
.detail-rows code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11.5px; white-space: pre-wrap; }

/* Submit and status */
.submit {
  width: 100%;
  min-height: var(--shotlog-control-height, 42px);
  border: 0;
  border-radius: var(--_control-radius);
  background: var(--_accent);
  color: var(--_on-accent);
  font-weight: var(--shotlog-strong-weight, 600);
  transition: filter 120ms ease, transform 100ms ease;
}
.submit:hover:not(:disabled) { filter: brightness(1.08); }
.submit { display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
.spinner { width: 14px; height: 14px; flex: none; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: spin 720ms linear infinite; }
.sr-only { position: absolute; width: 1px; height: 1px; margin: 0; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.submit:active:not(:disabled) { transform: scale(0.99); }
.status { margin-top: 10px; font-size: 13px; color: var(--_muted); overflow-wrap: anywhere; }
.status:empty { display: none; }
.status[data-state="error"] { color: var(--_error); }
.status[data-state="sent"] { margin: 0; padding-bottom: 12px; text-align: center; font-size: 15px; font-weight: 600; color: var(--_text); }
.success-mark { display: grid; place-items: center; padding: 18px 0 10px; }
.success-mark svg { width: 56px; height: 56px; stroke: var(--_success); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.success-mark circle, .success-mark path { stroke-dasharray: 1; animation: draw 480ms var(--_ease-out) both; }
.success-mark circle { animation-delay: 120ms; }
.success-mark path { animation-duration: 320ms; animation-delay: 460ms; }

@keyframes spin { to { transform: rotate(360deg); } }
@keyframes pulse { 50% { opacity: 0.35; } }
@keyframes fade-in { from { opacity: 0; } }
@keyframes fade-out { to { opacity: 0; } }
@keyframes rise { from { opacity: 0; transform: translateY(6px); } }
@keyframes menu-in { from { opacity: 0; transform: scale(0.96); } }
@keyframes draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
@keyframes card-open {
  from { opacity: 0; transform: scale(var(--_sx, 0.14), var(--_sy, 0.1)); }
  30% { opacity: 1; }
}
@keyframes card-close {
  55% { opacity: 1; }
  to { opacity: 0; transform: scale(var(--_sx, 0.14), var(--_sy, 0.1)); }
}
@keyframes card-open-anchor { from { opacity: 0; transform: scale(0.94); } }
@keyframes card-close-anchor { to { opacity: 0; transform: scale(0.96); } }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
  .spinner { animation: pulse 1.8s ease-in-out infinite !important; }
}
`;
