import { apiJson } from "./api-client.ts";

export type UpstreamHealth =
  | { ok: true }
  | ({ ok?: false } & { at: number; scope: string; status?: number });

export async function loadUpstreamHealth(): Promise<UpstreamHealth | null> {
  return apiJson<UpstreamHealth | null>("/api/upstream/health");
}
