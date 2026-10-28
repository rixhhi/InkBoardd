import { apiJson, qs } from "./api-client.ts";
import type { Timeline } from "@inkboard/shared/dcn";

export const ARCHIVED_MSG =
  "ARCHIVED: Unacademy moved this recording to cold storage. The video cannot be streamed until they restore it.";

export function isArchivedLessonError(err: unknown) {
  const m = err instanceof Error ? err.message : String(err ?? "");
  return m.includes("ARCHIVED") || m.includes("cold storage");
}

export async function loadLessonTimeline({ data, signal }: { data: { id: string }; signal?: AbortSignal }): Promise<Timeline> {
  const id = data.id.trim();
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(id)) throw new Error("Invalid lesson id");
  return apiJson<Timeline>(`/api/lessons/${encodeURIComponent(id)}/timeline`, signal ? { signal } : {});
}

export type NotesHit = { url: string; filename: string; kind: "notes" | "slides" };

export async function resolveLessonNotes({
  data,
  signal,
}: {
  data: { id: string; title?: string };
  signal?: AbortSignal;
}): Promise<NotesHit | null> {
  const id = data.id.trim();
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(id)) throw new Error("Invalid lesson id");
  return apiJson<NotesHit | null>(`/api/lessons/${encodeURIComponent(id)}/notes${qs({ title: data.title })}`, signal ? { signal } : {});
}

export type ReplayMedia = { archived: boolean };

export async function probeReplayMedia({
  data,
  signal,
}: {
  data: { ids: string[] };
  signal?: AbortSignal;
}): Promise<Record<string, ReplayMedia>> {
  return apiJson<Record<string, ReplayMedia>>("/api/lessons/probe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids: data.ids ?? [] }),
    signal,
  });
}
