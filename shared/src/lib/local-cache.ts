const KEY = "inkboard.local.v1";
const MAX = 48;
const TTL = 45 * 60 * 1000;

type Store = Record<string, { at: number; data: unknown }>;

function readStore(): Store {
  if (typeof window === "undefined" && typeof localStorage === "undefined") return {};
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}") as unknown;
    return raw && typeof raw === "object" ? (raw as Store) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* quota */
  }
}

export function localGet<T>(key: string): { data: T; at: number } | undefined {
  const hit = readStore()[key];
  if (!hit || Date.now() - hit.at > TTL) return undefined;
  return hit as { data: T; at: number };
}

export function localSet(key: string, data: unknown) {
  if (typeof localStorage === "undefined") return;
  try {
    const store = readStore();
    store[key] = { at: Date.now(), data };
    const keys = Object.keys(store).sort((a, b) => store[a]!.at - store[b]!.at);
    while (keys.length > MAX) {
      const drop = keys.shift();
      if (drop) delete store[drop];
    }
    writeStore(store);
  } catch {
    /* quota */
  }
}

export function localRemove(key: string) {
  if (typeof localStorage === "undefined") return;
  const store = readStore();
  if (!(key in store)) return;
  delete store[key];
  writeStore(store);
}

export function localRemovePrefix(prefix: string) {
  if (typeof localStorage === "undefined") return;
  const store = readStore();
  let changed = false;
  for (const key of Object.keys(store)) {
    if (key.startsWith(prefix)) {
      delete store[key];
      changed = true;
    }
  }
  if (changed) writeStore(store);
}
