import { defineService } from "../lib/server-fn.ts";
import { readUpstreamFail } from "@inkboard/shared/upstream";

export const loadUpstreamHealth = defineService({ method: "GET" }).handler(async () => {
  const fail = readUpstreamFail();
  if (!fail) return { ok: true as const };
  return { ok: false as const, at: fail.at, scope: fail.scope, status: fail.status };
});
