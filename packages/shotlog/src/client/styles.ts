export const styles = `
:host {
  all: initial;
  position: fixed;
  inset: 0;
  z-index: var(--shotlog-z-index, 2147483000);
  pointer-events: none;
}
.shotlog {
  --_surface: #ffffff;
  --_text: #18181b;
  --_muted: #52525b;
  --_border: #71717a;
  --_field: #fafafa;
  --_focus: #4f46e5;
  --_error: #b91c1c;
  --_success: #166534;
  color-scheme: light;
  color: var(--shotlog-text, var(--_text));
  font-family: var(--shotlog-font, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  font-size: var(--shotlog-font-size, 14px);
  font-weight: var(--shotlog-font-weight, 400);
  line-height: var(--shotlog-line-height, 1.5);
  text-align: start;
}
.shotlog[data-theme="dark"] {
  --_surface: #18181b;
  --_text: #fafafa;
  --_muted: #d4d4d8;
  --_border: #a1a1aa;
  --_field: #27272a;
  --_focus: #a5b4fc;
  --_error: #fca5a5;
  --_success: #86efac;
  color-scheme: dark;
}
@media (prefers-color-scheme: dark) {
  .shotlog[data-theme="auto"] {
    --_surface: #18181b;
    --_text: #fafafa;
    --_muted: #d4d4d8;
    --_border: #a1a1aa;
    --_field: #27272a;
    --_focus: #a5b4fc;
    --_error: #fca5a5;
    --_success: #86efac;
    color-scheme: dark;
  }
}
*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
button, textarea, input { font: inherit; }
button { cursor: pointer; }
button, textarea, .chip {
  border-radius: var(--shotlog-control-radius, 8px);
  border: var(--shotlog-border-width, 1px) solid var(--shotlog-border, var(--_border));
}
button:focus-visible, textarea:focus-visible, .chip:has(input:focus-visible) {
  outline: var(--shotlog-focus-width, 3px) solid var(--shotlog-focus, var(--_focus));
  outline-offset: var(--shotlog-focus-offset, 3px);
}
button:disabled, fieldset:disabled .chip { cursor: wait; }
button:disabled { opacity: var(--shotlog-disabled-opacity, 0.65); }
.launcher, .submit {
  background: var(--shotlog-accent, #4f46e5);
  color: var(--shotlog-accent-text, #ffffff);
  border-color: var(--shotlog-accent, #4f46e5);
  font-weight: var(--shotlog-strong-weight, 600);
  padding: var(--shotlog-space, 8px) calc(var(--shotlog-space, 8px) * 2);
  min-height: var(--shotlog-control-height, 48px);
}
.launcher {
  position: fixed;
  bottom: var(--shotlog-offset, 24px);
  right: var(--shotlog-offset, 24px);
  pointer-events: auto;
  box-shadow: var(--shotlog-shadow, 0 8px 32px #0000001f);
}
[data-position="bottom-left"] .launcher { right: auto; left: var(--shotlog-offset, 24px); }
.backdrop {
  position: fixed;
  inset: 0;
  pointer-events: auto;
  background: var(--shotlog-backdrop, #0000001a);
}
.card {
  position: fixed;
  bottom: calc(var(--shotlog-offset, 24px) + var(--shotlog-control-height, 48px) + var(--shotlog-space, 8px));
  right: var(--shotlog-offset, 24px);
  width: var(--shotlog-card-width, 384px);
  max-width: calc(100vw - var(--shotlog-offset, 24px) * 2);
  max-height: calc(100dvh - var(--shotlog-offset, 24px) * 2 - var(--shotlog-control-height, 48px) - var(--shotlog-space, 8px));
  overflow: auto;
  overscroll-behavior: contain;
  padding: calc(var(--shotlog-space, 8px) * 3);
  border: var(--shotlog-border-width, 1px) solid var(--shotlog-border, var(--_border));
  border-radius: var(--shotlog-radius, 16px);
  background: var(--shotlog-surface, var(--_surface));
  box-shadow: var(--shotlog-shadow, 0 8px 32px #0000001f);
}
[data-position="bottom-left"] .card { right: auto; left: var(--shotlog-offset, 24px); }
[data-mode="programmatic"] .card {
  top: 50%;
  left: 50%;
  right: auto;
  bottom: auto;
  transform: translate(-50%, -50%);
  max-height: calc(100dvh - var(--shotlog-offset, 24px) * 2);
}
.heading { display: flex; align-items: center; gap: var(--shotlog-space, 8px); margin-bottom: calc(var(--shotlog-space, 8px) * 2); }
h2 { margin: 0; flex: 1; font-size: var(--shotlog-title-size, 18px); font-weight: var(--shotlog-strong-weight, 600); }
.close {
  display: grid;
  place-items: center;
  width: var(--shotlog-control-height, 48px);
  height: var(--shotlog-control-height, 48px);
  flex-shrink: 0;
  background: var(--shotlog-surface, var(--_surface));
  color: var(--shotlog-muted, var(--_muted));
}
.close svg { width: var(--shotlog-icon-size, 16px); height: var(--shotlog-icon-size, 16px); }
fieldset { border: 0; margin: 0 0 calc(var(--shotlog-space, 8px) * 2); padding: 0; min-width: 0; }
legend, .description-label { display: block; font-weight: var(--shotlog-strong-weight, 600); margin-bottom: var(--shotlog-space, 8px); }
.chips { display: flex; flex-wrap: wrap; gap: var(--shotlog-space, 8px); }
.chip { position: relative; padding: var(--shotlog-space, 8px) calc(var(--shotlog-space, 8px) * 2); cursor: pointer; background: var(--shotlog-field, var(--_field)); }
.chip:has(input:checked) { background: var(--shotlog-accent, #4f46e5); border-color: var(--shotlog-accent, #4f46e5); color: var(--shotlog-accent-text, #ffffff); }
.chip input { position: absolute; opacity: 0; width: 1px; height: 1px; }
textarea { display: block; width: 100%; min-height: var(--shotlog-textarea-height, 144px); padding: calc(var(--shotlog-space, 8px) * 2); resize: vertical; color: var(--shotlog-text, var(--_text)); background: var(--shotlog-field, var(--_field)); }
.submit { width: 100%; margin-top: calc(var(--shotlog-space, 8px) * 2); }
.status { margin-top: calc(var(--shotlog-space, 8px) * 2); color: var(--shotlog-muted, var(--_muted)); overflow-wrap: anywhere; }
.status:empty { margin: 0; }
.status[data-state="error"] { color: var(--shotlog-error, var(--_error)); }
.status[data-state="sent"] { margin: 0; padding: calc(var(--shotlog-space, 8px) * 3) 0; text-align: center; font-weight: 600; color: var(--shotlog-success, var(--_success)); }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
}
`;
