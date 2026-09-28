export const editorStyles = `
.sl-editor { position: fixed; inset: 0; z-index: 10; pointer-events: auto; background: var(--shotlog-editor-backdrop, #0000004d); color: var(--shotlog-text, var(--_text)); font: 14px/1.4 var(--shotlog-font, system-ui, sans-serif); animation: sl-fade-in 240ms var(--_ease-out) both; }
.sl-editor[data-state="closing"] { pointer-events: none; animation: sl-fade-out 200ms var(--_ease-in) both; }
.sl-editor-card { position: fixed; inset: 20px; display: flex; flex-direction: column; gap: 12px; padding: 16px; border: 1px solid var(--shotlog-border, var(--_line)); border-radius: var(--_radius); background: var(--shotlog-surface, var(--_surface)); box-shadow: var(--_shadow); overflow: hidden; transform-origin: 50% 50%; animation: sl-card-in 320ms var(--_ease-out) both; }
.sl-editor[data-state="closing"] .sl-editor-card { animation: sl-card-out 220ms var(--_ease-in) both; }
.sl-editor-card > :not(style) { animation: sl-content-in 200ms ease-out both; animation-delay: 140ms; }
.sl-editor[data-state="closing"] .sl-editor-card > :not(style) { animation: sl-content-out 120ms ease-in both; }
.sl-editor button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-width: 36px; min-height: 36px; padding: 6px 12px; background: var(--shotlog-field, var(--_field)); color: inherit; border: 0; border-radius: var(--_control-radius); font-weight: 500; transition: background-color 120ms ease, color 120ms ease; }
.sl-editor button:hover:not(:disabled) { background: var(--_line); }
.sl-editor button[aria-pressed="true"] { background: var(--shotlog-text, var(--_text)); color: var(--shotlog-surface, var(--_surface)); box-shadow: 0 0 0 2px var(--shotlog-surface, var(--_surface)), 0 0 0 3px var(--shotlog-text, var(--_text)); }
.sl-editor button:focus-visible, .sl-editor canvas:focus-visible { outline: 2px solid var(--shotlog-focus, var(--_focus)); outline-offset: 2px; }
.sl-editor-header { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.sl-editor-header h2 { flex: 1; margin: 0; }
.sl-editor button.sl-done { background: var(--shotlog-accent, var(--_accent)); color: var(--shotlog-accent-text, var(--_on-accent)); font-weight: 600; }
.sl-editor button.sl-done:hover:not(:disabled) { background: var(--shotlog-accent, var(--_accent)); filter: brightness(1.08); }
.sl-editor-stage { position: relative; flex: 1; min-height: 60px; display: flex; align-items: center; justify-content: center; overflow: hidden; border-radius: var(--_control-radius); background: repeating-conic-gradient(#85858b22 0% 25%, #85858b11 0% 50%) 50% / 20px 20px; }
.sl-editor-image { position: relative; flex: none; box-shadow: 0 3px 18px #0003; line-height: 0; }
.sl-editor canvas { display: block; touch-action: none; cursor: crosshair; }
.sl-editor canvas[data-select="true"] { cursor: default; }
.sl-editor canvas[data-tool="text"] { cursor: text; }
.sl-editor textarea.sl-editor-text { position: absolute; display: block; margin: 0; min-height: 0; min-width: 0; border: 0; outline: 0; resize: none; overflow: hidden; white-space: pre; box-shadow: 0 0 0 1.5px #ffffffb3, 0 0 0 3px #6366f1; font-family: system-ui, sans-serif; font-weight: 600; line-height: 1.25; }
.sl-editor-footer { align-self: center; max-width: 100%; display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--shotlog-border, var(--_line)); border-radius: 16px; background: var(--shotlog-surface, var(--_surface)); box-shadow: 0 4px 16px #0000001a; }
.sl-editor .sl-editor-style { margin: 0; padding: 0; }
.sl-editor-tools, .sl-editor-style { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 7px; }
.sl-editor-tools button { position: relative; width: 42px; height: 42px; padding: 6px; }
.sl-editor-tools svg { width: 23px; height: 23px; }
.sl-editor-tools kbd { position: absolute; right: 3px; bottom: 0; font: 9px/1 system-ui, sans-serif; opacity: .8; }
.sl-editor .sl-swatch { min-width: 28px; min-height: 28px; width: 28px; height: 28px; padding: 5px; border-radius: 50%; }
.sl-swatch span { width: 16px; height: 16px; border-radius: 50%; border: 1px solid #77777788; }
.sl-divider { width: 1px; height: 24px; background: var(--shotlog-border, var(--_line)); margin: 0 3px; }
.sl-editor-status { min-height: 20px; text-align: center; font-size: 12px; color: var(--shotlog-muted, var(--_muted)); }
.sl-editor-error { color: var(--shotlog-error, var(--_error)); }
@keyframes sl-fade-in { from { opacity: 0; } }
@keyframes sl-fade-out { to { opacity: 0; } }
@keyframes sl-content-in { from { opacity: 0; } }
@keyframes sl-content-out { to { opacity: 0; } }
@keyframes sl-card-in { from { opacity: 0; transform: translate(var(--_fx, 0px), var(--_fy, 0px)) scale(var(--_fsx, 0.96), var(--_fsy, 0.96)); } 35% { opacity: 1; } }
@keyframes sl-card-out { 45% { opacity: 1; } to { opacity: 0; transform: translate(var(--_fx, 0px), var(--_fy, 0px)) scale(var(--_fsx, 0.96), var(--_fsy, 0.96)); } }
@media (max-width: 600px) { .sl-editor-card { inset: 8px; padding: 8px; gap: 8px; } .sl-editor-tools { gap: 5px; } .sl-editor-tools button { width: 36px; height: 36px; } .sl-editor-footer { padding: 8px; } }
.sl-confirm-backdrop { position: absolute; inset: 0; z-index: 2; display: grid; place-items: center; padding: 16px; border-radius: inherit; background: var(--shotlog-backdrop, #00000059); animation: sl-confirm-fade 160ms ease-out; }
.sl-confirm { width: min(360px, 100%); padding: 20px; border-radius: 16px; background: var(--shotlog-surface, var(--_surface)); color: var(--shotlog-text, var(--_text)); box-shadow: 0 24px 64px #00000040, 0 2px 8px #0000001f; animation: sl-confirm-in 200ms cubic-bezier(0.2, 0.9, 0.3, 1.2); }
.sl-confirm p { margin: 0 0 20px; font-size: 15px; font-weight: 600; line-height: 1.4; }
.sl-confirm-actions { display: flex; justify-content: flex-end; gap: 8px; }
.sl-editor button.sl-danger { background: var(--shotlog-danger, #d92d20); color: #ffffff; font-weight: 600; }
.sl-editor button.sl-danger:hover:not(:disabled) { background: var(--shotlog-danger, #d92d20); filter: brightness(1.08); }
@keyframes sl-confirm-fade { from { opacity: 0; } }
@keyframes sl-confirm-in { from { opacity: 0; transform: translateY(8px) scale(0.96); } }
@media (prefers-reduced-motion: reduce) { .sl-confirm-backdrop, .sl-confirm { animation: none; } }
.sl-text-size { font-weight: 700; line-height: 1; }
.sl-history-icon { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
`;
