export type RestPage<T extends { uid: string }> = { lessons: T[]; nextOffset: number | null };

export async function drainCoursePages<T extends { uid: string }>(opts: {
  start: number;
  seen: Set<string>;
  load: (offset: number, signal: AbortSignal) => Promise<RestPage<T>>;
  signal: AbortSignal;
  initial?: T[];
  cap?: number;
  onPage?: (acc: T[]) => void;
}): Promise<{ status: "done" | "error" | "aborted"; acc: T[]; failedOffset: number | null; error?: unknown }> {
  const acc = opts.initial ? [...opts.initial] : [];
  let offset: number | null = opts.start;
  const cap = opts.cap ?? 40;
  for (let pageNo = 0; pageNo < cap && offset != null; pageNo += 1) {
    if (opts.signal.aborted) return { status: "aborted", acc, failedOffset: offset };
    let batch: RestPage<T>;
    try {
      batch = await opts.load(offset, opts.signal);
    } catch (error) {
      if (opts.signal.aborted) return { status: "aborted", acc, failedOffset: offset };
      return { status: "error", acc, failedOffset: offset, error };
    }
    const fresh = batch.lessons.filter((lesson) => lesson.uid && !opts.seen.has(lesson.uid));
    if (fresh.length === 0) {
      opts.onPage?.(acc);
      return { status: "done", acc, failedOffset: null };
    }
    for (const lesson of fresh) opts.seen.add(lesson.uid);
    acc.push(...fresh);
    opts.onPage?.([...acc]);
    offset = batch.nextOffset;
  }
  return { status: "done", acc, failedOffset: null };
}
