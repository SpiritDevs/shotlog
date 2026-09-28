import { useEffect, useState } from "react";
import { isSettings, type Settings } from "../shared.js";
import { errorMessage, requestJson } from "./api.js";
import { buildOversizedSubmission, buildSubmission } from "./submission.js";

interface SubmissionResult {
  readonly sequence: number;
  readonly status: number | null;
}

export function SettingsStrip() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<SubmissionResult[]>([]);
  const [error, setError] = useState("");
  const [oversizedResult, setOversizedResult] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void requestJson<Settings>("/_settings", { signal: controller.signal })
      .then(setSettings)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      });
    return () => controller.abort();
  }, []);

  async function save(next: Settings) {
    setSaving(true);
    setError("");
    try {
      const saved = await requestJson<unknown>("/_settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!isSettings(saved)) throw new Error("Invalid settings response");
      setSettings(saved);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function fireSubmissions() {
    setRunning(true);
    setResults([]);
    setError("");
    // Send sequentially so the transition from 200 to 429 is easy to follow.
    for (let sequence = 1; sequence <= 20; sequence += 1) {
      let status: number | null = null;
      try {
        const response = await fetch("/api/support", {
          method: "POST",
          body: buildSubmission(sequence),
        });
        await response.text();
        status = response.status;
      } catch (cause) {
        setError(errorMessage(cause));
      }
      setResults((current) => [...current, { sequence, status }]);
    }
    setRunning(false);
  }

  async function sendOversized() {
    setRunning(true);
    setError("");
    setOversizedResult("");
    try {
      const response = await fetch("/api/support", {
        method: "POST",
        body: await buildOversizedSubmission(),
      });
      setOversizedResult(
        `Oversized screenshot: HTTP ${response.status} · ${await response.text()}`,
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setRunning(false);
    }
  }

  const disabled = !settings || saving || running;
  return (
    <section className="settings panel" aria-labelledby="settings-title">
      <div className="section-heading">
        <h2 id="settings-title">Relay settings</h2>
        <span className="muted">{saving ? "Saving…" : "Server memory"}</span>
      </div>
      <div className="settings-controls">
        <label className="select-label">
          Authorize
          <select
            value={settings?.authorize ?? "allow"}
            disabled={disabled}
            onChange={(event) => {
              const next = { ...settings, authorize: event.target.value };
              if (isSettings(next)) void save(next);
            }}
          >
            <option value="allow">Allow</option>
            <option value="unauthorized">Unauthorized · 401</option>
            <option value="forbidden">Forbidden · 403</option>
          </select>
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={settings?.rateLimit ?? true}
            disabled={disabled}
            onChange={(event) => {
              if (settings)
                void save({ ...settings, rateLimit: event.target.checked });
            }}
          />
          Rate limit · 5 per 10 min
        </label>
        <button
          type="button"
          disabled={disabled}
          onClick={() => void fireSubmissions()}
        >
          {running ? `Sending ${results.length}/20…` : "Fire 20 submissions"}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => void sendOversized()}
        >
          Oversized screenshot
        </button>
      </div>
      <p className="hint">
        Changing a setting recreates the handler and resets rate limits and
        delivered IDs. Clearing the Inbox only removes entries.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {oversizedResult && <p role="status">{oversizedResult}</p>}
      {results.length > 0 && (
        <div className="burst-results">
          <p role="status" className="hint">
            {results.length}/20 completed · HTTP status for each submission
          </p>
          <ol className="status-list" aria-label="Submission responses">
            {results.map((result) => (
              <li
                key={result.sequence}
                className={`badge ${result.status === 200 ? "success" : "failure"}`}
                aria-label={`Submission ${result.sequence}: ${result.status ?? "network error"}`}
                title={`Submission ${result.sequence}`}
              >
                <span className="status-index">{result.sequence}.</span>{" "}
                {result.status ?? "Error"}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
