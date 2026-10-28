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

let typescript;
async function tsCompiler() {
  if (!typescript) {
    // Hoisted to the root by npm workspaces; older per-package installs keep it in frontend/.
    const here = dirname(fileURLToPath(import.meta.url));
    const file = [join(here, "../node_modules/typescript/lib/typescript.js"), join(here, "../frontend/node_modules/typescript/lib/typescript.js"), join(here, "node_modules/typescript/lib/typescript.js")].find((f) => existsSync(f));
    if (!file) throw new Error("typescript is not installed (run npm install at the repo root)");
    typescript = await import(pathToFileURL(file).href);
  }
  return typescript;
}

/** Node strips `.ts` but not JSX. Tests that render a component need this. */
export async function load(url, context, nextLoad) {
  if (!url.endsWith(".tsx")) return nextLoad(url, context);
  const ts = await tsCompiler();
  const source = readFileSync(fileURLToPath(url), "utf8");
  const out = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: url,
  });
  return { format: "module", source: out.outputText, shortCircuit: true };
}
