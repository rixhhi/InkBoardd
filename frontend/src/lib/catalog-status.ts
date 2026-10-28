export type CatalogState = { status: "ok" | "down"; at: number };

let state: CatalogState = { status: "ok", at: 0 };
const listeners = new Set<() => void>();

export function catalogState(): CatalogState {
  return state;
}

export function setCatalogStatus(status: "ok" | "down") {
  if (state.status === status) return;
  state = { status, at: Date.now() };
  for (const listener of listeners) listener();
}

export function subscribeCatalog(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetCatalogStatus() {
  state = { status: "ok", at: 0 };
  for (const listener of listeners) listener();
}
