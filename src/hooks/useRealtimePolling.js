import { useEffect, useRef } from "react";

export default function useRealtimePolling(task, intervalMs = 10000, deps = []) {
  const taskRef = useRef(task);
  const inFlightRef = useRef(false);

  useEffect(() => {
    taskRef.current = task;
  }, [task]);

  useEffect(() => {
    let timer = null;

    const runTask = async (options) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        await Promise.resolve(taskRef.current?.(options));
      } finally {
        inFlightRef.current = false;
      }
    };

    const run = () => {
      if (document.visibilityState !== "visible") return;
      runTask({ silent: true });
    };

    runTask({ silent: false });
    timer = window.setInterval(run, intervalMs);

    const onFocus = () => runTask({ silent: true });
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        runTask({ silent: true });
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (timer) window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, ...deps]);
}
