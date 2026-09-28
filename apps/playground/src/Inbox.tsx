import type { InboxEntry } from "../shared.js";

export function Inbox({
  entries,
}: {
  readonly entries: readonly InboxEntry[];
}) {
  if (entries.length === 0) {
    return (
      <div className="panel empty-state">
        <h2>No Support Logs yet</h2>
        <p>Open the report card or fire a burst to see signed webhooks here.</p>
        <a href="#/">Go to Home →</a>
      </div>
    );
  }

  return (
    <ol className="inbox-list" aria-label="Received Support Logs">
      {entries.map((entry) => {
        const log = entry.supportLog;
        const screenshot = log.screenshot;
        const image = screenshot
          ? screenshot._tag === "Inline"
            ? `data:image/png;base64,${screenshot.data}`
            : screenshot.url
          : undefined;
        return (
          <li key={entry.id}>
            <article className="panel inbox-entry">
              <div className="entry-heading">
                <h2>{log.shortId}</h2>
                <span className="badge">{log.type}</span>
                <span className="muted">{entry.kind}</span>
                <span
                  className={`badge signature ${entry.signatureValid ? "success" : "failure"}`}
                >
                  {entry.signatureValid
                    ? "✓ Signature valid"
                    : "✗ Signature invalid"}
                </span>
              </div>
              <div className="two-column">
                <div className="report-summary">
                  <p className="description">{log.description}</p>
                  <dl className="report-details">
                    <dt>Reporter</dt>
                    <dd>
                      <code>{JSON.stringify(log.reporter ?? null)}</code>
                    </dd>
                    <dt>Received</dt>
                    <dd>
                      <time dateTime={entry.receivedAt}>
                        {new Date(entry.receivedAt).toLocaleString()}
                      </time>
                    </dd>
                  </dl>
                  {image && screenshot && (
                    <img
                      className="screenshot"
                      src={image}
                      alt={`Screenshot attached to ${log.shortId}`}
                      width={screenshot.width}
                      height={screenshot.height}
                      loading="lazy"
                    />
                  )}
                </div>
                <details className="raw-json">
                  <summary>Raw webhook JSON</summary>
                  <pre>
                    <code>{JSON.stringify(log, null, 2)}</code>
                  </pre>
                </details>
              </div>
            </article>
          </li>
        );
      })}
    </ol>
  );
}
