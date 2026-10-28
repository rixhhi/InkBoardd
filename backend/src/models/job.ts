export type JobKind = "lecture" | "chapter" | "course";
export type JobState = "queued" | "running" | "done" | "error" | "cancelled";

export type JobRecord = {
  id: string;
  kind: JobKind;
  state: JobState;
  pct: number;
  step: string;
  error?: string;
  outDir: string;
  payload: Record<string, unknown>;
};
