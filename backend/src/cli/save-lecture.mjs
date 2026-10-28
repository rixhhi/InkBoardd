#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { parseSaveArgs, saveLecture, verifyBundle, EXIT, SaveLectureError } from "./lib/save-lecture-core.mjs";

export async function main(argv = process.argv.slice(2), io = {}) {
  const parsed = parseSaveArgs(argv);
  if (parsed.error) {
    (io.error || console.error)(parsed.error);
    return parsed.code ?? EXIT.args;
  }
  const ac = io.signal ? null : new AbortController();
  const signal = io.signal || ac?.signal;
  let hits = 0;
  const onInt = () => {
    hits += 1;
    if (hits === 1) {
      ac?.abort();
      (io.error || console.error)("Stopping. Re-run to resume.");
    } else process.exit(1);
  };
  if (typeof process !== "undefined" && ac) process.on?.("SIGINT", onInt);
  try {
    if (parsed.verify) {
      const result = await verifyBundle(parsed.verify, io.log);
      return result.ok ? EXIT.ok : EXIT.error;
    }
    await saveLecture({
      id: parsed.id,
      outDir: parsed.out,
      fetch: io.fetch || globalThis.fetch,
      log: io.log,
      opts: {
        noMedia: parsed.noMedia,
        noNotes: parsed.noNotes,
        remux: parsed.remux,
        title: parsed.title,
        signal,
      },
    });
    return EXIT.ok;
  } catch (err) {
    if (err instanceof SaveLectureError && err.aborted) {
      (io.error || console.error)("Stopped. Re-run to resume.");
      return EXIT.error;
    }
    const code = err instanceof SaveLectureError ? err.code : EXIT.error;
    (io.error || console.error)(err instanceof Error ? err.message : String(err));
    return code;
  } finally {
    if (ac) process.off?.("SIGINT", onInt);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => process.exit(code));
}
