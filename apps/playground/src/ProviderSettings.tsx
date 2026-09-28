import { useState } from "react";
import type { ShotlogProviderProps } from "shotlog";

interface Settings {
  readonly enabled: boolean;
  readonly launcher: boolean;
  readonly launcherContent: "icon" | "text" | "icon-text";
  readonly position: NonNullable<ShotlogProviderProps["position"]>;
  readonly theme: NonNullable<ShotlogProviderProps["theme"]>;
  readonly accent: string;
  readonly console: boolean;
  readonly network: boolean;
  readonly types: "default" | "custom" | "empty";
}

const storageKey = "shotlog:playground:provider";
const defaults: Settings = {
  enabled: true,
  launcher: true,
  launcherContent: "icon",
  position: "bottom-right",
  theme: "light",
  accent: "#343c35",
  console: true,
  network: true,
  types: "default",
};
const customTypes = ["Bug", "Billing", "Other"];
const emptyTypes: readonly string[] = [];

function isSettings(value: unknown): value is Settings {
  return (
    typeof value === "object" &&
    value !== null &&
    "enabled" in value &&
    typeof value.enabled === "boolean" &&
    "launcher" in value &&
    typeof value.launcher === "boolean" &&
    "launcherContent" in value &&
    (value.launcherContent === "icon" ||
      value.launcherContent === "text" ||
      value.launcherContent === "icon-text") &&
    "position" in value &&
    (value.position === "bottom-right" || value.position === "bottom-left") &&
    "theme" in value &&
    (value.theme === "auto" ||
      value.theme === "light" ||
      value.theme === "dark") &&
    "accent" in value &&
    typeof value.accent === "string" &&
    /^#[0-9a-f]{6}$/i.test(value.accent) &&
    "console" in value &&
    typeof value.console === "boolean" &&
    "network" in value &&
    typeof value.network === "boolean" &&
    "types" in value &&
    (value.types === "default" ||
      value.types === "custom" ||
      value.types === "empty")
  );
}

function loadSettings(): Settings {
  try {
    const saved: unknown = JSON.parse(
      localStorage.getItem(storageKey) ?? "null",
    );
    // Settings saved before a new option existed pick up its default.
    const merged: unknown =
      typeof saved === "object" && saved !== null
        ? { ...defaults, ...saved }
        : saved;
    if (isSettings(merged)) return merged;
  } catch {
    // The Playground still works when browser storage is unavailable.
  }
  return defaults;
}

export function useProviderSettings() {
  const [settings, setSettings] = useState(loadSettings);
  const update = (next: Settings) => {
    setSettings(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* Keep in-memory settings. */
    }
  };
  const providerProps = {
    enabled: settings.enabled,
    launcher: settings.launcher && { content: settings.launcherContent },
    position: settings.position,
    theme: settings.theme,
    accent: settings.accent,
    diagnostics: { console: settings.console, network: settings.network },
    ...(settings.types === "default"
      ? {}
      : { types: settings.types === "custom" ? customTypes : emptyTypes }),
  } satisfies Partial<ShotlogProviderProps>;
  return { settings, update, providerProps };
}

export function ProviderSettings({
  settings,
  onChange,
}: {
  readonly settings: Settings;
  readonly onChange: (settings: Settings) => void;
}) {
  return (
    <section
      className="settings panel"
      aria-labelledby="provider-settings-title"
    >
      <div className="section-heading">
        <h2 id="provider-settings-title">Client settings</h2>
        <span className="muted">Saved in this browser</span>
      </div>
      <div className="settings-controls provider-controls">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(event) =>
              onChange({ ...settings, enabled: event.currentTarget.checked })
            }
          />
          Enabled
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={settings.launcher}
            onChange={(event) =>
              onChange({ ...settings, launcher: event.currentTarget.checked })
            }
          />
          Launcher
        </label>
        <label className="select-label">
          Launcher style
          <select
            value={settings.launcherContent}
            disabled={!settings.launcher}
            onChange={(event) => {
              const launcherContent = event.currentTarget.value;
              if (
                launcherContent === "icon" ||
                launcherContent === "text" ||
                launcherContent === "icon-text"
              )
                onChange({ ...settings, launcherContent });
            }}
          >
            <option value="icon">Icon</option>
            <option value="text">Text</option>
            <option value="icon-text">Icon + text</option>
          </select>
        </label>
        <label className="select-label">
          Position
          <select
            value={settings.position}
            onChange={(event) => {
              const position = event.currentTarget.value;
              if (position === "bottom-right" || position === "bottom-left")
                onChange({ ...settings, position });
            }}
          >
            <option value="bottom-right">Bottom right</option>
            <option value="bottom-left">Bottom left</option>
          </select>
        </label>
        <label className="select-label">
          Theme
          <select
            value={settings.theme}
            onChange={(event) => {
              const theme = event.currentTarget.value;
              if (theme === "auto" || theme === "light" || theme === "dark")
                onChange({ ...settings, theme });
            }}
          >
            <option value="auto">Auto</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <label className="select-label">
          Accent colour
          <input
            type="color"
            value={settings.accent}
            onChange={(event) =>
              onChange({ ...settings, accent: event.currentTarget.value })
            }
          />
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={settings.console}
            onChange={(event) =>
              onChange({ ...settings, console: event.currentTarget.checked })
            }
          />
          Console diagnostics
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={settings.network}
            onChange={(event) =>
              onChange({ ...settings, network: event.currentTarget.checked })
            }
          />
          Network diagnostics
        </label>
        <label className="select-label">
          Types
          <select
            value={settings.types}
            onChange={(event) => {
              const types = event.currentTarget.value;
              if (
                types === "default" ||
                types === "custom" ||
                types === "empty"
              )
                onChange({ ...settings, types });
            }}
          >
            <option value="default">Default</option>
            <option value="custom">Bug / Billing / Other</option>
            <option value="empty">Empty</option>
          </select>
        </label>
      </div>
    </section>
  );
}
