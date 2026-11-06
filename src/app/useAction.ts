import { useCallback, useState } from "react";

/** Runs an async action with a busy flag and keeps its last status message (or error). */
export function useAction(): [run: (action: () => Promise<string>) => Promise<void>, busy: boolean, message: string | null] {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const run = useCallback(async (action: () => Promise<string>) => {
    setBusy(true);
    try {
      setMessage(await action());
    } catch (error) {
      setMessage(`出错了：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }, []);
  return [run, busy, message];
}
