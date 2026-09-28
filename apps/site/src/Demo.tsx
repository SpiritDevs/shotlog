import { useEffect, useRef, useState } from "react";
import { ShotlogProvider, type ShotlogSubmission, useShotlog } from "shotlog";
import { CopyButton, type Theme } from "./ui";

type Result = { json: string; screenshot?: Blob };

function ResultPanel({
  result,
  visible,
  onClose,
}: {
  result: Result;
  visible: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { close } = useShotlog();
  const [image, setImage] = useState<string>();
  const [jsonFile, setJsonFile] = useState<string>();
  useEffect(() => {
    const screenshotUrl = result.screenshot
      ? URL.createObjectURL(result.screenshot)
      : undefined;
    const jsonUrl = URL.createObjectURL(
      new Blob([result.json], { type: "application/json" }),
    );
    setImage(screenshotUrl);
    setJsonFile(jsonUrl);
    return () => {
      if (screenshotUrl) URL.revokeObjectURL(screenshotUrl);
      URL.revokeObjectURL(jsonUrl);
    };
  }, [result]);
  useEffect(() => {
    if (!visible) return;
    close();
    // Let the Report Card release its focus trap before opening the result.
    const frame = requestAnimationFrame(() => dialog.current?.showModal());
    return () => cancelAnimationFrame(frame);
  }, [visible, close]);
  return (
    <dialog
      ref={dialog}
      className="result-panel"
      aria-labelledby="result-title"
      onClose={onClose}
    >
      <div className="result-heading">
        <div>
          <span className="eyebrow">LOCAL PREVIEW / NOTHING SENT</span>
          <h2 id="result-title">Your Support Log.</h2>
        </div>
        <button
          className="close-button"
          type="button"
          aria-label="Close payload panel"
          onClick={() => dialog.current?.close()}
        >
          ×
        </button>
      </div>
      <p>
        This is the exact JSON received by <code>onSubmit</code>. The annotated
        PNG arrives separately. Both stay in this browser.
      </p>
      <div className="result-grid">
        <section aria-labelledby="json-title">
          <div className="result-section-heading">
            <h3 id="json-title">Support Log JSON</h3>
            <CopyButton value={result.json} label="Copy JSON" />
          </div>
          {/* biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to scroll the complete payload. */}
          <pre className="result-json" tabIndex={0}>
            <code>{result.json}</code>
          </pre>
          <a className="text-link" href={jsonFile} download="support-log.json">
            Download JSON ↓
          </a>
        </section>
        <section aria-labelledby="png-title">
          <div className="result-section-heading">
            <h3 id="png-title">Annotated screenshot</h3>
            <span className="mono">
              {result.screenshot
                ? `${Math.round(result.screenshot.size / 1024)} KB · PNG`
                : "OPTIONAL"}
            </span>
          </div>
          {image ? (
            <>
              <a
                href={image}
                download="shotlog-screenshot.png"
                className="result-image-link"
              >
                <img
                  src={image}
                  alt="Your annotated screenshot"
                  className="result-image"
                />
              </a>
              <a
                className="text-link"
                href={image}
                download="shotlog-screenshot.png"
              >
                Download PNG ↓
              </a>
            </>
          ) : (
            <div className="no-screenshot">
              No screenshot attached.
              <br />A written report works, too.
            </div>
          )}
        </section>
      </div>
      <div className="result-bottom">
        <span>Built with the real shotlog package. No demo API.</span>
        <button
          type="button"
          className="button button-ink"
          onClick={() => dialog.current?.close()}
        >
          Back to the demo ↗
        </button>
      </div>
    </dialog>
  );
}

function Playground({
  result,
  showResult,
  setShowResult,
}: {
  result: Result | null;
  showResult: boolean;
  setShowResult: (show: boolean) => void;
}) {
  const { open, isOpen } = useShotlog();
  const [failed, setFailed] = useState(false);
  const step = result ? 2 : failed ? 1 : 0;
  return (
    <>
      <div className="demo-frame">
        <div className="browser-bar">
          <span className="browser-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="browser-url mono">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <rect x="4" y="7" width="8" height="7" rx="1" />
              <path d="M6 7V4a2 2 0 0 1 4 0v3" />
            </svg>
            your-app.local / releases
          </span>
          <span className="browser-label mono">INTERACTIVE DEMO</span>
        </div>
        <div className="playground-layout">
          <div className="sample-app">
            <div className="sample-app-header">
              <span className="sample-logo">
                ◈ <strong>orbit</strong>
              </span>
              <span className="sample-workspace">
                Your workspace <span className="avatar">Y</span>
              </span>
            </div>
            <div className="sample-breadcrumb mono">
              PROJECT / ORBIT-WEB / RELEASES
            </div>
            <div className="release-heading">
              <div>
                <span className="release-badge mono">VERSION 2.4.0</span>
                <h3>Ready for liftoff.</h3>
                <p>One small release. A few things to check.</p>
              </div>
              <span className="release-orbit" aria-hidden="true">
                ↗
              </span>
            </div>
            <div className="release-checklist">
              <div>
                <span className="check-icon">✓</span>
                <span>Build completed</span>
                <code>1m 24s</code>
              </div>
              <div>
                <span className="check-icon">✓</span>
                <span>All checks passed</span>
                <code>32 / 32</code>
              </div>
              <div>
                <span className="check-icon pending">—</span>
                <span>Release notes</span>
                <code>Not added</code>
              </div>
            </div>
            <div className="release-bottom">
              <div
                aria-live="polite"
                className={failed ? "release-error" : "release-hint"}
              >
                {failed
                  ? "Release paused. The changelog is missing."
                  : "Looks ready. Go ahead, try the button."}
              </div>
              <button
                type="button"
                className="publish-button"
                onClick={() => {
                  setFailed(true);
                  console.warn(
                    "[shotlog demo] Release paused: changelog is missing for orbit-web v2.4.0.",
                  );
                }}
              >
                Publish release <span aria-hidden="true">↗</span>
              </button>
            </div>
            <span className="sample-caption mono">
              A FICTIONAL APP. A REAL SUPPORT FLOW.
            </span>
          </div>
          <div className="demo-guide">
            <div>
              <span className="eyebrow">TAKE IT FOR A SPIN</span>
              <h3>
                A good report <br />
                starts here.
              </h3>
              <p>
                Try publishing the release. <br />
                Then show us what happened.
              </p>
            </div>
            <ol className="demo-steps">
              <li className={step > 0 ? "completed" : "active"}>
                <span>①</span>
                <div>
                  <strong>Find the hiccup</strong>
                  <small>Click “Publish release”.</small>
                </div>
              </li>
              <li
                className={step === 1 ? "active" : step > 1 ? "completed" : ""}
              >
                <span>②</span>
                <div>
                  <strong>Capture & annotate</strong>
                  <small>Open shotlog. Add a screenshot.</small>
                </div>
              </li>
              <li className={step === 2 ? "active" : ""}>
                <span>③</span>
                <div>
                  <strong>Inspect your report</strong>
                  <small>See the JSON and the final PNG.</small>
                </div>
              </li>
            </ol>
            <button
              type="button"
              className="button button-coral"
              onClick={open}
              disabled={isOpen}
            >
              Try shotlog <span aria-hidden="true">↗</span>
            </button>
            {result ? (
              <button
                type="button"
                className="last-report"
                onClick={() => setShowResult(true)}
              >
                View your last report ↗
              </button>
            ) : (
              <span className="demo-local mono">100% LOCAL. ZERO SENDS.</span>
            )}
          </div>
        </div>
      </div>
      {result && (
        <ResultPanel
          result={result}
          visible={showResult}
          onClose={() => setShowResult(false)}
        />
      )}
    </>
  );
}

export default function Demo({ theme }: { theme: Theme }) {
  const pending = useRef<Result | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [showResult, setShowResult] = useState(false);
  const receive = async ({ log, screenshot }: ShotlogSubmission) => {
    pending.current = {
      json: JSON.stringify(log, null, 2),
      ...(screenshot ? { screenshot } : {}),
    };
  };
  return (
    <ShotlogProvider
      theme={theme}
      accent={theme === "light" ? "#A92F24" : "#FF8475"}
      onSubmit={receive}
      onSubmitted={() => {
        setResult(pending.current);
        setShowResult(true);
      }}
      metadata={{ demo: "shotlog.dev", app: "orbit-web", appVersion: "2.4.0" }}
      labels={{
        launcher: "Report an issue",
        title: "Try a Support Log",
        submit: "Preview Support Log",
        sending: "Preparing local preview…",
        sent: (id) => `Preview ready · ${id}`,
      }}
    >
      <Playground
        result={result}
        showResult={showResult}
        setShowResult={setShowResult}
      />
    </ShotlogProvider>
  );
}
