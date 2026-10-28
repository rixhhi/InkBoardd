import { byCatalogScore } from "@inkboard/shared/catalog-rank";
import type { JumpItem } from "@inkboard/shared/jump";
import { rememberCatalog } from "../repositories/postgres/catalog-search.ts";
import { searchEducators } from "../catalog/source.ts";
import { defineService } from "../lib/server-fn.ts";

export const searchDesk = defineService({ method: "POST" })
  .validator((d: unknown) => {
    const rec = d && typeof d === "object" ? (d as Record<string, unknown>) : {};
    return {
      q: String(rec.q ?? "").trim().slice(0, 80),
      goalId: String(rec.goalId ?? "").trim(),
    };
  })
  .handler(async ({ data }): Promise<{ teachers: JumpItem[] }> => {
    if (data.q.length < 2) return { teachers: [] };
    const page = await searchEducators({ q: data.q, goalId: data.goalId || undefined });
    const teachers: JumpItem[] = [];
    if (page.exact) {
      teachers.push({
        group: "Teachers",
        id: page.exact.username,
        label: page.exact.name,
        hint: `@${page.exact.username}`,
        avatar: page.exact.avatar,
        href: { kind: "teacher", slug: page.exact.username },
      });
    }
    const ranked = byCatalogScore(page.hits, data.q, (hit) => ({
      title: hit.name,
      topic: hit.topics || hit.bio || "",
      educator: hit.username,
    }));
    for (const hit of ranked) {
      teachers.push({
        group: "Teachers",
        id: hit.username,
        label: hit.name,
        hint: `@${hit.username}`,
        avatar: hit.avatar,
        href: { kind: "teacher", slug: hit.username },
      });
    }
    void rememberCatalog(
      teachers.map((teacher) => ({
        id: teacher.id,
        title: teacher.label,
        topic: teacher.hint ?? "",
        educator: teacher.id,
        href: `/teacher/${teacher.id}`,
      })),
    ).catch(() => undefined);
    return { teachers };
  });
