/** HTTP smoke of the routes the budget locks. Width is not a fetch header. */
const routes = ["/", "/planner/today", "/play/YOTUH123", "/offline"];

export async function smoke(baseUrl = "http://127.0.0.1:4173") {
  const results = [];
  for (const route of routes) {
    const url = `${baseUrl}${route}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      results.push({ route, status: res.status, ok: res.ok });
    } catch (err) {
      results.push({ route, status: 0, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}

if (process.argv[1]?.endsWith("phase5-smoke.mjs")) {
  const base = process.argv[2] || "http://127.0.0.1:4173";
  const results = await smoke(base);
  let failed = false;
  for (const r of results) {
    const icon = r.ok ? "ok" : "fail";
    console.log(`${icon} ${r.route} → ${r.status}${r.error ? " (" + r.error + ")" : ""}`);
    if (!r.ok) failed = true;
  }
  if (failed) process.exit(1);
}
