import snippets from "virtual:snippets";
import { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import {
  Arrow,
  Footer,
  Header,
  InstallCommand,
  Scribble,
  useTheme,
} from "./ui";
import "./styles.css";

const Demo = lazy(() => import("./Demo"));

function Code({ title, code }: { title: string; code: string }) {
  return (
    <div className="code-block">
      <div className="code-title">
        <span>{title}</span>
        <span>README ↙</span>
      </div>
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to scroll code examples. */}
      <pre tabIndex={0}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

function App() {
  const { theme, toggleTheme } = useTheme();
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Header theme={theme} toggleTheme={toggleTheme} />
      <main id="main-content">
        <section className="hero container" aria-labelledby="hero-title">
          <h1 id="hero-title">
            Show the{" "}
            <span className="circled">
              bug
              <Scribble />
            </span>
            .<br />
            Keep the context.
          </h1>
          <div className="hero-bottom">
            <div>
              <p className="hero-pitch">
                An annotated screenshot. The trail behind it. One useful report.
              </p>
              <div className="hero-actions">
                <InstallCommand />
                <a
                  className="text-link"
                  href="/docs/#quick-start-nextjs-app-router"
                >
                  Start building <Arrow />
                </a>
              </div>
            </div>
            <div className="hero-note">
              Less “can you send
              <br />a screenshot?”
              <svg viewBox="0 0 100 75" aria-hidden="true">
                <path d="M9 4c61-5 80 16 55 59m-11-20 10 22 22-8" />
              </svg>
            </div>
          </div>
        </section>

        <section
          id="demo"
          className="demo-section container"
          aria-label="Live demo"
        >
          <Suspense
            fallback={
              <div className="demo-loading" role="status">
                Loading the real shotlog widget…
              </div>
            }
          >
            <Demo theme={theme} />
          </Suspense>
          <div className="demo-footnote">
            <p>
              No signup. No backend. Nothing you report leaves this browser.
            </p>
            <a href="/docs/#custom-delivery">
              How this demo works <Arrow />
            </a>
          </div>
        </section>

        <section
          className="how-it-works container"
          aria-label="How shotlog works"
        >
          <div>
            <span className="step-number">①</span>
            <h3>Catch the moment.</h3>
            <p>
              A floating widget or your own button. Right where the problem
              happens.
            </p>
          </div>
          <div>
            <span className="step-number">②</span>
            <h3>Make it obvious.</h3>
            <p>
              Capture, circle, add an arrow. Bring the relevant details along.
            </p>
          </div>
          <div>
            <span className="step-number">③</span>
            <h3>Get the whole story.</h3>
            <p>
              One Support Log, delivered through your backend to where you work.
            </p>
          </div>
        </section>

        <div className="features container">
          <section className="feature" aria-labelledby="annotation-title">
            <div className="feature-copy">
              <span className="eyebrow">01 / ANNOTATION EDITOR</span>
              <h2 id="annotation-title">
                “Right <span className="underline">there.</span>”<br />
                Now it’s clear.
              </h2>
              <p>
                A Shottr-style editor, right inside your app. Arrows, shapes,
                text, step counters, and keyboard shortcuts. Every mark stays
                editable until Done.
              </p>
              <p className="feature-detail">
                Capture the page now or after a 5-second countdown, use exact
                screen capture where supported, or paste an image. Solid
                redaction covers sensitive pixels before the final PNG is
                flattened. With UploadFile, reporters can also record the tab,
                talking and drawing as they go.
              </p>
              <a
                className="text-link"
                href="/docs/#screenshots-and-the-annotation-editor"
              >
                Meet the editor <Arrow />
              </a>
            </div>
            <div className="feature-visual">
              <div
                className="annotation-study"
                role="img"
                aria-label="Illustration of an annotated save button"
              >
                <div className="study-toolbar" aria-hidden="true">
                  <span>↖</span>
                  <span className="selected">↗</span>
                  <span>□</span>
                  <span>○</span>
                  <span>T</span>
                  <span>①</span>
                  <span>▧</span>
                </div>
                <div className="study-scene">
                  <span className="study-label mono">ACCOUNT SETTINGS</span>
                  <div className="study-field">
                    <span>Email address</span>
                    <span className="redacted">████████████████</span>
                  </div>
                  <div className="study-save">
                    Save changes
                    <Scribble />
                  </div>
                  <span className="study-note">this one!</span>
                  <svg
                    className="study-arrow"
                    viewBox="0 0 150 90"
                    aria-hidden="true"
                  >
                    <path d="M140 12C81-4 49 22 20 64m-1-23-2 26 28-2" />
                  </svg>
                </div>
                <div className="study-caption mono">
                  ILLUSTRATION / YOUR POINT, MADE.
                </div>
              </div>
              <Code
                title="app/providers.tsx · excerpt"
                code={snippets.annotation}
              />
            </div>
          </section>

          <section className="feature" aria-labelledby="diagnostics-title">
            <div className="feature-copy">
              <span className="eyebrow">02 / DIAGNOSTIC TRAIL</span>
              <h2 id="diagnostics-title">
                The screenshot is
                <br />
                half the story.
              </h2>
              <p>
                Bring the page, browser, viewport, and recent console warnings,
                errors, and failed requests. Add the user and app context only
                your app knows.
              </p>
              <p className="feature-detail">
                Network diagnostics record method, URL, and status—not bodies or
                headers. Query strings are stripped by default. Reporters can
                preview Included Details.
              </p>
              <a className="text-link" href="/docs/#the-support-log-payload">
                Inside a Support Log <Arrow />
              </a>
            </div>
            <div className="feature-visual">
              <div className="trail-card">
                <div className="trail-header">
                  <span className="mono">SUPPORT LOG</span>
                  <span className="trail-id mono">SL-7F3K · EXAMPLE</span>
                </div>
                <h3>Save changes does nothing.</h3>
                <div className="trail-row">
                  <span>Environment</span>
                  <code>/settings · Chrome · macOS</code>
                </div>
                <div className="trail-row">
                  <span>Host Context</span>
                  <code>user-42 · app v1.0.0</code>
                </div>
                <div className="trail-row trail-error">
                  <span>Diagnostic Trail</span>
                  <code>POST /api/settings → 500</code>
                </div>
                <div className="trail-attachment">
                  <span aria-hidden="true">▧</span> screenshot.png{" "}
                  <span>+ the exact thing they saw</span>
                </div>
              </div>
              <Code
                title="ShotlogProvider · excerpt"
                code={snippets.diagnostics}
              />
            </div>
          </section>

          <section className="feature" aria-labelledby="delivery-title">
            <div className="feature-copy">
              <span className="eyebrow">03 / DELIVERY</span>
              <h2 id="delivery-title">
                Your app.
                <br />
                Your inbox.
              </h2>
              <p>
                Email with Resend, Amazon SES, or SMTP. A Slack channel, fixed
                or picked by the reporter. Signed JSON webhooks to your own
                tools. Or all of them. Your backend owns delivery.
              </p>
              <p className="feature-detail">
                Keep the PNG inline, or use UploadFile or a custom Storage
                Adapter for a screenshot URL. The widget, emails, and Slack
                messages also come in Brazilian Portuguese. Custom{" "}
                <code>onSubmit</code> gives you control over the next step.
              </p>
              <a className="text-link" href="/docs/#delivery">
                Choose a destination <Arrow />
              </a>
            </div>
            <div className="feature-visual">
              <div className="delivery-route">
                <span className="route-origin">
                  <img src="/icon.svg" width="35" height="35" alt="" />
                  Support Log
                </span>
                <span className="route-arrow" aria-hidden="true">
                  →
                </span>
                <span className="route-destinations">
                  <span>Email</span>
                  <span>Slack</span>
                  <span>Signed webhook</span>
                  <span>Screenshot storage</span>
                </span>
              </div>
              <Code title="server delivery · README" code={snippets.delivery} />
            </div>
          </section>

          <section className="feature" aria-labelledby="security-title">
            <div className="feature-copy">
              <span className="eyebrow">04 / SECURITY</span>
              <h2 id="security-title">
                A small widget.
                <br />
                Clear boundaries.
              </h2>
              <p>
                Your Host App decides who can report. Your Authorize Hook checks
                the session. Credentials and destinations stay on the server.
              </p>
              <p className="feature-detail">
                Schema validation, size limits, and default rate limits protect
                the Relay Endpoint. Shadow DOM keeps widget styles isolated from
                your app.
              </p>
              <a className="text-link" href="/docs/#security">
                Wire in your auth <Arrow />
              </a>
            </div>
            <div className="feature-visual">
              <div className="security-notes">
                <span>
                  <span aria-hidden="true">✓</span> Server-owned destinations
                </span>
                <span>
                  <span aria-hidden="true">✓</span> Explicit session
                  authorization
                </span>
                <span>
                  <span aria-hidden="true">✓</span> Validated, bounded requests
                </span>
              </div>
              <Code
                title="authorize hook · README excerpt"
                code={snippets.security}
              />
            </div>
          </section>
        </div>

        <section className="closing container">
          <span className="eyebrow">LESS GUESSWORK STARTS HERE.</span>
          <h2>
            Give “it’s broken”
            <br />
            some{" "}
            <span className="circled">
              context.
              <Scribble />
            </span>
          </h2>
          <div className="closing-actions">
            <a className="button button-ink" href="/docs/#install">
              Read the docs <Arrow />
            </a>
            <code>npm i shotlog</code>
          </div>
          <p>React ≥18 · TypeScript · Your backend</p>
        </section>
      </main>
      <Footer />
    </>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
