import { AsyncLocalStorage } from "node:async_hooks";
import { upstreamTimeout } from "@inkboard/shared/http-error";

type Slot = { until: number; signal: AbortSignal };

const slots = new AsyncLocalStorage<Slot>();

export function requestDeadline(): Slot | undefined {
  return slots.getStore();
}

/** Bound one catalog request. Upstream retries must stop when this signal aborts. */
export function withRequestDeadline<T>(ms: number, fn: () => Promise<T>): Promise<T> {
  const signal = AbortSignal.timeout(ms);
  const run = slots.run({ until: Date.now() + ms, signal }, fn);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(upstreamTimeout()), ms);
    run.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
