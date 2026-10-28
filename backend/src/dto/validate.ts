import { z, type ZodType } from "zod";
import { badRequest } from "@inkboard/shared/http-error";

/** Parse a route input. Failures are a typed 400, never a schema dump. */
export function parseInput<T>(schema: ZodType<T>, value: unknown, label = "request"): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw badRequest(`Invalid ${label}`);
  return parsed.data;
}

export const DeskSearchInput = z.object({
  q: z.string().max(80).optional().default(""),
  goalId: z.string().max(32).optional().default(""),
});

export const LessonParams = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{6,40}$/, "Invalid lesson id"),
});

export const LessonNotesQuery = z.object({
  title: z.string().max(180).optional(),
});

export const ProbeBody = z.object({
  ids: z.array(z.unknown()).max(40).optional(),
});

const lessonId = /^[A-Za-z0-9_-]{6,40}$/;

/** Probe drops junk ids instead of failing the whole request. */
export function probeIds(body: unknown): string[] {
  const parsed = parseInput(ProbeBody, body && typeof body === "object" ? body : {}, "body");
  const ids = parsed.ids ?? [];
  return ids.map((id) => (typeof id === "string" ? id.trim() : "")).filter((id) => lessonId.test(id));
}

export const JobIdParams = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
});

export const ArtifactParams = JobIdParams.extend({
  "*": z.string().max(180),
});

export const LectureJobBody = z.object({
  id: z.string().optional(),
  title: z.string().max(200).optional(),
  remux: z.boolean().optional(),
  noMedia: z.boolean().optional(),
  noNotes: z.boolean().optional(),
  enhance: z.boolean().optional(),
});

export const ClipBody = z.object({
  start: z.coerce.number().optional(),
  end: z.coerce.number().optional(),
});
