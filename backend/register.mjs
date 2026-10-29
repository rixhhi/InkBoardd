import { existsSync } from "node:fs";
import { register } from "node:module";
import { fileURLToPath } from "node:url";

// Test-only helper that layers the frontend's CSS files for source-pinned
// tests. Optional: a backend-only deploy (Render, the backend Dockerfile) has
// no frontend/ checkout, and must still boot.
const styles = new URL("../frontend/src/lib/read-styles.ts", import.meta.url);
if (existsSync(fileURLToPath(styles))) {
  const { installStylesRead } = await import(styles.href);
  installStylesRead();
}

register("./loader.mjs", import.meta.url);
