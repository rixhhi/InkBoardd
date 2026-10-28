import { markDirty } from "./dirty.ts";
import { WATCH_FLUSH_MS, WATCH_KEY, WATCH_LOG_DAYS, watchKeyOf, type WatchLog } from "./types.ts";
import { addDaysKey, todayKey } from "./dates.ts";

function canStore() {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

let mem: WatchLog[] | null = null;
let lastFlush = 0;
let lastRaw = "";
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function pruneInPlace(logs: WatchLog[], today = todayKey()): WatchLog[] {
  const floor = addDaysKey(today, -WATCH_LOG_DAYS);
  let write = 0;
  for (let i = 0; i < logs.length; i += 1) {
    if (logs[i]!.date >= floor) {
      logs[write] = logs[i]!;
      write += 1;
    }
  }
  logs.length = write;
  return logs;
}

export function readWatchLogs(): WatchLog[] {
  if (mem) return mem;
  if (!canStore()) {
    mem = [];
    return mem;
  }
  try {
    const raw = localStorage.getItem(WATCH_KEY);
    lastRaw = raw ?? "[]";
    mem = pruneInPlace(raw ? (JSON.parse(raw) as WatchLog[]) : []);
  } catch {
    mem = [];
    lastRaw = "[]";
  }
  return mem;
}

function persist() {
  lastFlush = Date.now();
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!mem) return;
  const raw = JSON.stringify(mem);
  const changed = raw !== lastRaw;
  if (canStore() && changed) {
    try {
      localStorage.setItem(WATCH_KEY, raw);
      lastRaw = raw;
    } catch {
      /* quota — keep memory */
    }
  } else if (!changed) {
    return;
  }
  for (const cb of listeners) cb();
}

function scheduleFlush() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    persist();
  }, WATCH_FLUSH_MS);
}

export function writeWatchLogs(logs: WatchLog[], force = false) {
  mem = pruneInPlace(logs);
  const now = Date.now();
  if (!force && now - lastFlush < WATCH_FLUSH_MS) {
    scheduleFlush();
    return;
  }
  persist();
}

export function upsertWatchLog(log: WatchLog, force = false) {
  const logs = readWatchLogs();
  const i = logs.findIndex((w) => w.lessonId === log.lessonId && w.date === log.date);
  if (i >= 0) logs[i] = log;
  else logs.push(log);
  pruneInPlace(logs);
  markDirty({ watch: [watchKeyOf(log.lessonId, log.date)] });
  const now = Date.now();
  if (!force && lastFlush !== 0 && now - lastFlush < WATCH_FLUSH_MS) {
    scheduleFlush();
    return;
  }
  persist();
}

export function flushWatchLogs() {
  if (mem) persist();
}

export function subscribeWatch(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function resetWatchStore() {
  mem = [];
  lastFlush = 0;
  lastRaw = "";
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}
