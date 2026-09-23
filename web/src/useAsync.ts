import { useCallback, useEffect, useState, type DependencyList } from "react";
import { errorMessage } from "./format.ts";

/** Charge une donnée asynchrone ; `reload` la relit (après une écriture, par exemple). */
export function useAsync<T>(load: () => Promise<T>, deps: DependencyList) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const [round, setRound] = useState(0);
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: undefined }));
    load().then((data) => { if (live) setState({ data, loading: false }); })
      .catch((error) => { if (live) setState({ error: errorMessage(error), loading: false }); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, round]);
  const reload = useCallback(() => setRound((r) => r + 1), []);
  return { ...state, reload };
}

/** Heure courante, rafraîchie à intervalle régulier (compte à rebours, verrouillage). */
export function useNow(intervalMs = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
