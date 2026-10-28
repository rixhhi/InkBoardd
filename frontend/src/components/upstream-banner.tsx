import { useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { COPY } from "@inkboard/shared/copy";
import { catalogState, setCatalogStatus, subscribeCatalog } from "@/lib/catalog-status";

/** Shown when a real catalog request failed. Cached pages do not clear it. */
export function UpstreamBanner() {
  const down = useSyncExternalStore(subscribeCatalog, () => catalogState().status === "down", () => false);
  const qc = useQueryClient();
  if (!down) return null;
  return (
    <div className="mx-4 mt-4 flex items-center justify-between gap-4 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-4 py-3 text-sm" role="status">
      <p>{COPY.wallDidNotAnswer}</p>
      <button
        type="button"
        className="h-11 shrink-0 text-accent"
        onClick={() => {
          void qc.refetchQueries({ type: "active" }).then(() => setCatalogStatus("ok"));
        }}
      >
        {COPY.tryAgain}
      </button>
    </div>
  );
}
