export const editorStyles = `
.sl-editor { position: fixed; inset: 0; z-index: 10; pointer-events: auto; display: flex; flex-direction: column; gap: 12px; padding: 16px; background: var(--shotlog-surface, var(--_surface)); color: var(--shotlog-text, var(--_text)); font: 14px/1.4 var(--shotlog-font, system-ui, sans-serif); }
.sl-editor button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-width: 36px; min-height: 36px; padding: 6px 10px; background: var(--shotlog-field, var(--_field)); color: inherit; border: 1px solid var(--shotlog-border, var(--_border)); border-radius: 8px; }
.sl-editor button[aria-pressed="true"] { background: var(--shotlog-text, var(--_text)); color: var(--shotlog-surface, var(--_surface)); box-shadow: 0 0 0 2px var(--shotlog-surface, var(--_surface)), 0 0 0 3px var(--shotlog-text, var(--_text)); }
.sl-editor button:focus-visible, .sl-editor canvas:focus-visible { outline: 3px solid var(--shotlog-focus, var(--_focus)); outline-offset: 3px; }
.sl-editor-header { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.sl-editor-header h2 { font-size: 16px; flex: 1; }
.sl-editor button.sl-done { background: var(--shotlog-accent, #4f46e5); color: var(--shotlog-accent-text, white); border-color: transparent; font-weight: 600; }
.sl-editor-stage { position: relative; flex: 1; min-height: 60px; display: flex; align-items: center; justify-content: center; overflow: hidden; border-radius: 12px; background: repeating-conic-gradient(#85858b22 0% 25%, #85858b11 0% 50%) 50% / 20px 20px; }
.sl-editor-image { position: relative; flex: none; box-shadow: 0 3px 18px #0003; line-height: 0; }
.sl-editor canvas { display: block; touch-action: none; cursor: crosshair; }
.sl-editor canvas[data-select="true"] { cursor: default; }
.sl-editor textarea.sl-editor-text { position: absolute; padding: 0; margin: 0; min-height: 32px; min-width: 80px; resize: none; border: 1px dashed #4f46e5; border-radius: 0; background: #ffffffed; font-family: system-ui, sans-serif; font-weight: 600; line-height: 1.25; }
.sl-editor-footer { align-self: center; max-width: 100%; display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--shotlog-border, var(--_border)); border-radius: 14px; box-shadow: 0 4px 16px #0001; }
.sl-editor .sl-editor-style { margin: 0; padding: 0; }
.sl-editor-tools, .sl-editor-style { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 7px; }
.sl-editor-tools button { position: relative; width: 42px; height: 42px; padding: 6px; }
.sl-editor-tools svg { width: 23px; height: 23px; }
.sl-editor-tools kbd { position: absolute; right: 3px; bottom: 0; font: 9px/1 system-ui, sans-serif; opacity: .8; }
.sl-editor .sl-swatch { min-width: 28px; min-height: 28px; width: 28px; height: 28px; padding: 5px; border-radius: 50%; }
.sl-swatch span { width: 16px; height: 16px; border-radius: 50%; border: 1px solid #777; }
.sl-divider { width: 1px; height: 24px; background: var(--shotlog-border, var(--_border)); margin: 0 3px; }
.sl-editor-status { min-height: 20px; text-align: center; font-size: 12px; color: var(--shotlog-muted, var(--_muted)); }
.sl-editor-error { color: var(--shotlog-error, var(--_error)); }
@media (max-width: 600px) { .sl-editor { padding: 8px; gap: 8px; } .sl-editor-tools { gap: 5px; } .sl-editor-tools button { width: 36px; height: 36px; } .sl-editor-footer { padding: 8px; } }
`;
