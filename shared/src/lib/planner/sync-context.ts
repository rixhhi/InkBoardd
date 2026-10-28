import { createContext } from "react";
import type { SyncStatus } from "./types.ts";

export type PlannerSyncCtx = {
  sync: SyncStatus;
  retrySync: () => void;
  lastSyncedAt: string | null;
};

export const PlannerSyncContext = createContext<PlannerSyncCtx>({
  sync: "local-only",
  retrySync: () => undefined,
  lastSyncedAt: null,
});
