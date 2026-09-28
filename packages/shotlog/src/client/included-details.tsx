import { useEffect, useState, useSyncExternalStore } from "react";
import type { SupportLogSubmission } from "../types.js";
import {
  getDiagnostics,
  getServerDiagnostics,
  subscribeDiagnostics,
} from "./diagnostics.js";
import type { ShotlogLabels } from "./types.js";

export type IncludedContext = Pick<
  SupportLogSubmission,
  "environment" | "reporter" | "metadata"
>;

interface IncludedDetailsProps {
  readonly labels: ShotlogLabels;
  readonly collectContext: () => Promise<IncludedContext>;
  readonly consoleEnabled: boolean;
  readonly networkEnabled: boolean;
}

export function IncludedDetails({
  labels,
  collectContext,
  consoleEnabled,
  networkEnabled,
}: IncludedDetailsProps) {
  const [expanded, setExpanded] = useState(false);
  const [context, setContext] = useState<IncludedContext | "loading" | "error">(
    "loading",
  );
  const trail = useSyncExternalStore(
    subscribeDiagnostics,
    getDiagnostics,
    getServerDiagnostics,
  );
  const consoleEntries = consoleEnabled ? trail.console : [];
  const networkEntries = networkEnabled ? trail.network : [];

  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    setContext("loading");
    void collectContext().then(
      (value) => {
        if (!cancelled) setContext(value);
      },
      () => {
        if (!cancelled) setContext("error");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [expanded, collectContext]);

  return (
    <details
      className="included-details"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>
        {labels.includedDetails(consoleEntries.length, networkEntries.length)}
      </summary>
      {expanded && (
        <section
          className="details-content"
          aria-label={labels.includedDetails(
            consoleEntries.length,
            networkEntries.length,
          )}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard users must be able to scroll the bounded details region
          tabIndex={0}
        >
          <p className="details-note">{labels.detailsRefresh}</p>
          {typeof context === "string" ? (
            <p role="status">
              {context === "loading"
                ? labels.detailsLoading
                : labels.detailsUnavailable}
            </p>
          ) : (
            <>
              <h3>{labels.environment}</h3>
              <Rows value={context.environment} labels={labels} />
              <h3>{labels.reporter}</h3>
              <Rows value={context.reporter} labels={labels} />
              <h3>{labels.metadata}</h3>
              <Rows value={context.metadata} labels={labels} />
            </>
          )}
          <h3>{labels.diagnosticTrail}</h3>
          {!consoleEnabled && !networkEnabled ? (
            <p>{labels.diagnosticsDisabled}</p>
          ) : (
            <>
              <h4>{labels.consoleEntries}</h4>
              {consoleEntries.length === 0 ? (
                <p>{labels.detailsEmpty}</p>
              ) : (
                <ol>
                  {consoleEntries.map((entry, index) => (
                    // The trail is an ordered snapshot; entries have no unique identity.
                    // biome-ignore lint/suspicious/noArrayIndexKey: immutable, read-only diagnostic rows
                    <li key={index}>
                      <Rows value={entry} labels={labels} />
                    </li>
                  ))}
                </ol>
              )}
              <h4>{labels.networkEntries}</h4>
              {networkEntries.length === 0 ? (
                <p>{labels.detailsEmpty}</p>
              ) : (
                <ol>
                  {networkEntries.map((entry, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: immutable, read-only diagnostic rows
                    <li key={index}>
                      <Rows value={entry} labels={labels} />
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </section>
      )}
    </details>
  );
}

function Rows({
  value,
  labels,
}: {
  readonly value: object | undefined;
  readonly labels: ShotlogLabels;
}) {
  const entries = value ? Object.entries(value) : [];
  if (entries.length === 0) return <p>{labels.detailsEmpty}</p>;
  return (
    <dl className="detail-rows">
      {entries.map(([key, item]: [string, unknown]) => (
        <div key={key}>
          <dt>{labels.detailKey(key)}</dt>
          <dd>
            <code>{displayValue(item, labels)}</code>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function displayValue(
  value: unknown,
  labels: ShotlogLabels,
): string | undefined {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return labels.detailsUnavailable;
  }
}
