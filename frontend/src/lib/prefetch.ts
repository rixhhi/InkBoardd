import { catalogState } from "./catalog-status.ts";

const waiting: Array<() => Promise<unknown>> = [];
let active = 0;

function pump() {
  while (active < 2 && waiting.length > 0) {
    const run = waiting.shift();
    if (!run) break;
    active += 1;
    void Promise.resolve()
      .then(run)
      .catch(() => undefined)
      .finally(() => {
        active -= 1;
        pump();
      });
  }
}

export function schedulePrefetch(run: () => Promise<unknown>): () => void {
  if (catalogState().status === "down") return () => {};
  let cancel = false;
  const timer = setTimeout(() => {
    if (cancel) return;
    waiting.push(run);
    pump();
  }, 150);
  return () => {
    cancel = true;
    clearTimeout(timer);
    const at = waiting.indexOf(run);
    if (at >= 0) waiting.splice(at, 1);
  };
}

export function resetPrefetch() {
  waiting.length = 0;
  active = 0;
}
