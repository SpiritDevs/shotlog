import { useCallback, useEffect, useRef, useState } from "react";
import type { InboxEntry } from "../shared.js";
import { errorMessage, requestJson } from "./api.js";

export function useInbox() {
  const [entries, setEntries] = useState<InboxEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState("Connecting");
  const [error, setError] = useState("");
  const [clearing, setClearing] = useState(false);
  const pending = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    try {
      const next = await requestJson<InboxEntry[]>("/_inbox", {
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        setEntries(next);
        setError("");
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(errorMessage(cause));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const events = new EventSource("/_inbox/events");
    events.onopen = () => {
      setConnection("Live");
      // Resync on every connection, including after a server restart.
      void refresh();
    };
    events.onmessage = () => void refresh();
    events.onerror = () => setConnection("Reconnecting");
    return () => {
      events.close();
      pending.current?.abort();
    };
  }, [refresh]);

  async function clear() {
    setClearing(true);
    try {
      const response = await fetch("/_inbox", { method: "DELETE" });
      if (!response.ok)
        throw new Error(`Clear returned HTTP ${response.status}`);
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setClearing(false);
    }
  }

  return { entries, loading, connection, error, clearing, clear };
}
