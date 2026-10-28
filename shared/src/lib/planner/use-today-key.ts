import { useEffect, useState } from "react";
import { msUntilNextLocalMidnight, todayKey } from "./dates.ts";

/** Re-renders at local midnight and when the tab becomes visible after a day change. */
export function useTodayKey(): string {
  const [key, setKey] = useState(() => todayKey());
  useEffect(() => {
    let id = 0;
    const arm = () => {
      id = window.setTimeout(() => setKey(todayKey()), msUntilNextLocalMidnight());
    };
    arm();
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      setKey(todayKey());
      window.clearTimeout(id);
      arm();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [key]);
  return key;
}
