import { apiJson, qs } from "./api-client.ts";
import type { JumpItem } from "@inkboard/shared/jump";

export async function searchDesk({
  data,
}: {
  data: { q: string; goalId?: string };
}): Promise<{ teachers: JumpItem[] }> {
  const q = String(data.q ?? "").trim().slice(0, 80);
  if (q.length < 2) return { teachers: [] };
  return apiJson<{ teachers: JumpItem[] }>(`/api/search/desk${qs({ q, goalId: data.goalId })}`);
}
