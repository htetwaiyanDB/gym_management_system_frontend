import { useEffect, useRef } from "react";

export default function useRealtimePolling(task, intervalMs = 10000, deps = []) {
  const taskRef = useRef(task);

  useEffect(() => {
    taskRef.current = task;
  }, [task]);

  useEffect(() => {
    let timer = null;

    const run = () => {
      if (document.visibilityState !== "visible") return;
      taskRef.current?.({ silent: true });
    };

    taskRef.current?.({ silent: false });
    timer = window.setInterval(run, intervalMs);

    const onFocus = () => taskRef.current?.({ silent: true });
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        taskRef.current?.({ silent: true });
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
