import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "src");
const sharedRoot = join(dirname(fileURLToPath(import.meta.url)), "../shared/src/lib");

function existingFile(base) {
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mjs`,
    `${base}.js`,
    join(base, "index.ts"),
    join(base, "index.mjs"),
  ];
  for (const file of candidates) {
    if (existsSync(file) && statSync(file).isFile()) return file;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@inkboard/shared/")) {
    const rest = specifier.slice("@inkboard/shared/".length).replace(/\.tsx?$/, "");
    const file = existingFile(join(sharedRoot, rest));
    if (file) return nextResolve(pathToFileURL(file).href, context);
  }
  if (specifier.startsWith("@/")) {
    const parent = context.parentURL ? fileURLToPath(context.parentURL) : "";
    const root = parent.includes(`${join("frontend", "src")}`)
      ? join(dirname(fileURLToPath(import.meta.url)), "../frontend/src")
      : srcRoot;
    const rest = specifier.slice(2);
    const file = existingFile(join(root, rest));
    if (file) return nextResolve(pathToFileURL(file).href, context);
  }
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const parent = context.parentURL ? fileURLToPath(context.parentURL) : srcRoot;
    const raw = join(dirname(parent), specifier);
    if (!extname(raw)) {
      const file = existingFile(raw);
      if (file) return nextResolve(pathToFileURL(file).href, context);
    }
  }
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    // If default resolution fails for a bare specifier imported from shared/ or frontend/,
    // try resolving from frontend/node_modules (e.g. @tanstack/react-start).
    if (
      err?.code === "ERR_MODULE_NOT_FOUND" &&
      !specifier.startsWith(".") &&
      !specifier.startsWith("/") &&
      context.parentURL
    ) {
      const parent = fileURLToPath(context.parentURL);
      if (parent.includes("shared/") || parent.includes("frontend/")) {
        const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), "../frontend");
        try {
          return await nextResolve(specifier, { ...context, parentURL: pathToFileURL(join(frontendRoot, "_virtual.mjs")).href });
        } catch {
          // fall through to original error
        }
      }
    }
    throw err;
  }
}

let oxc;
async function tsxCompiler() {
  if (!oxc) {
    // TypeScript 7 is the native port and no longer ships a JS `transpileModule`, so
    // JSX is stripped with oxc-transform — the same transformer Vite 8 uses for the
    // real build, so tests and the bundle see identical output.
    try {
      oxc = await import("oxc-transform");
    } catch {
      throw new Error("oxc-transform is not installed (run npm install at the repo root)");
    }
  }
  return oxc;
}

/** Node strips `.ts` but not JSX. Tests that render a component need this. */
export async function load(url, context, nextLoad) {
  if (!url.endsWith(".tsx")) return nextLoad(url, context);
  const { transformSync } = await tsxCompiler();
  const file = fileURLToPath(url);
  const source = readFileSync(file, "utf8");
  const out = transformSync(file, source, {
    jsx: { runtime: "automatic" },
    target: "es2022",
  });
  const fatal = out.errors.filter((e) => e.severity === "Error");
  if (fatal.length) {
    throw new Error(`${file}: ${fatal.map((e) => e.message).join("; ")}`);
  }
  return { format: "module", source: out.code, shortCircuit: true };
}
