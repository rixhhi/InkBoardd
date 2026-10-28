/** A loaded course must not grow a catalog banner from a side request. */

export type CatalogSignal = "ok" | "down" | "ignore";

export function catalogSignal(path: string, ok: boolean, status: number, code = ""): CatalogSignal {
  const pathOnly = path.split("?")[0] || "";
  const primary =
    pathOnly === "/api/exams" ||
    /^\/api\/(?:courses\/[^/]+|exams\/[^/]+\/(?:hub|teachers|courses|tests|practice)|educators\/[^/]+|search(?:\/[^/]+)?|batches\/[^/]+|live\/feed)$/.test(
      pathOnly,
    );
  const side = /^\/api\/(?:courses|exams|educators|teachers|search|lessons|batches|live)\b/.test(pathOnly);
  if (ok && (primary || side) && !pathOnly.endsWith("/probe")) return "ok";
  if (!ok && primary) {
    if (status === 404 || status === 410 || status === 429 || code === "NOT_FOUND" || code === "RATE_LIMIT") return "ignore";
    if (
      status === 0 ||
      status >= 500 ||
      code === "UPSTREAM" ||
      code === "UPSTREAM_TIMEOUT" ||
      code === "UPSTREAM_BREAKER_OPEN" ||
      code === "TIMEOUT" ||
      code === "NETWORK" ||
      code === "BAD_RESPONSE"
    ) {
      return "down";
    }
  }
  return "ignore";
}
