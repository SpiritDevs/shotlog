import { type ComponentProps, useEffect, useState } from "react";
import { useShotlog } from "shotlog";
import { CapturePage } from "./CapturePage.js";
import { metadata, reporter } from "./context.js";
import { Inbox } from "./Inbox.js";
import { ProviderSettings } from "./ProviderSettings.js";
import { SettingsStrip } from "./SettingsStrip.js";
import { TroubleButtons } from "./TroubleButtons.js";
import { useInbox } from "./useInbox.js";

const currentView = () =>
  location.hash === "#/capture"
    ? "capture"
    : location.hash === "#/inbox"
      ? "inbox"
      : "home";

export function App({
  providerSettings,
  onProviderSettingsChange,
}: {
  readonly providerSettings: ComponentProps<
    typeof ProviderSettings
  >["settings"];
  readonly onProviderSettingsChange: ComponentProps<
    typeof ProviderSettings
  >["onChange"];
}) {
  const [view, setView] = useState(currentView);
  const { open } = useShotlog();
  const inbox = useInbox();

  useEffect(() => {
    const navigate = () => setView(currentView());
    window.addEventListener("hashchange", navigate);
    return () => window.removeEventListener("hashchange", navigate);
  }, []);

  if (view === "capture") return <CapturePage />;

  return (
    <div className="app-shell">
      <header className="app-header">
        <a href="#/" className="brand">
          shotlog <span>Playground</span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#/" aria-current={view === "home" ? "page" : undefined}>
            Home
          </a>
          <a
            href="#/inbox"
            aria-current={view === "inbox" ? "page" : undefined}
          >
            Inbox <span className="nav-count">{inbox.entries.length}</span>
          </a>
          <a href="#/capture">Capture tests</a>
        </nav>
      </header>

      <main>
        <div className="page-heading">
          <div>
            <p className="eyebrow">LOCAL DEVELOPMENT</p>
            <h1>{view === "home" ? "Try a Support Log" : "Inbox"}</h1>
            <p className="muted">
              {view === "home"
                ? "Open the card, send a report, and inspect what arrives."
                : "Signed webhooks, newest first. The last 100 entries are kept in memory."}
            </p>
          </div>
          <span
            className={`badge ${inbox.connection === "Live" ? "success" : ""}`}
          >
            {inbox.connection}
          </span>
        </div>

        <SettingsStrip />
        <ProviderSettings
          settings={providerSettings}
          onChange={onProviderSettingsChange}
        />

        {view === "home" ? (
          <div className="two-column home-grid">
            <section className="panel home-card">
              <span className="eyebrow">REPORT CARD</span>
              <h2>Two ways to open it</h2>
              <p>
                Use the button below to call <code>useShotlog().open()</code>,
                or use the Standalone Launcher when it is enabled.
              </p>
              <button
                type="button"
                className="primary"
                onClick={open}
                disabled={!providerSettings.enabled}
              >
                Open report card (Programmatic)
              </button>
              <p className="hint">
                Both open the same card and preserve its draft.
              </p>
              <a href="#/inbox">View received Support Logs →</a>
            </section>
            <section className="panel home-card">
              <span className="eyebrow">HOST CONTEXT</span>
              <h2>A small, pretend app</h2>
              <p>Every report includes this fake Reporter and Metadata.</p>
              <pre className="context-json">
                <code>{JSON.stringify({ reporter, metadata }, null, 2)}</code>
              </pre>
            </section>
            <TroubleButtons />
          </div>
        ) : (
          <section aria-label="Inbox">
            <div className="inbox-toolbar">
              <p className="muted" role="status">
                {inbox.loading
                  ? "Loading…"
                  : `${inbox.entries.length} received`}
              </p>
              <button
                type="button"
                disabled={inbox.clearing || inbox.entries.length === 0}
                onClick={() => void inbox.clear()}
              >
                {inbox.clearing ? "Clearing…" : "Clear"}
              </button>
            </div>
            {inbox.error && (
              <p role="alert" className="error">
                {inbox.error}
              </p>
            )}
            {!inbox.loading && <Inbox entries={inbox.entries} />}
          </section>
        )}
      </main>
      <footer>shotlog · local relay + webhook inbox · :5199</footer>
    </div>
  );
}
