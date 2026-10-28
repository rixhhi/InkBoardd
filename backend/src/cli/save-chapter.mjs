#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { EXIT, SaveLectureError, parseChapterArgs, saveChapter, verifyChapterFolder } from "./lib/save-chapter-core.mjs";

export async function main(argv = process.argv.slice(2), io = {}) {
  const parsed = parseChapterArgs(argv);
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
      const result = await verifyChapterFolder(parsed.verify, io.log);
      return result.exit;
    }
    const raw = JSON.parse(readFileSync(parsed.file, "utf8"));
    const result = await saveChapter({
      chapter: raw,
      outDir: parsed.out,
      fetch: io.fetch || globalThis.fetch,
      log: io.log,
      opts: {
        remux: parsed.remux,
        noMedia: parsed.noMedia,
        noNotes: parsed.noNotes,
        dryRun: parsed.dryRun,
        retryArchived: parsed.retryArchived,
        maxLectures: parsed.maxLectures,
      },
      saveOne: io.saveOne,
      sleep: io.sleep,
      now: io.now,
      freeSpace: io.freeSpace,
      random: io.random,
      signal,
      shouldStop: () => Boolean(signal?.aborted) || Boolean(io.shouldStop?.()),
    });
    return result.exit;
  } catch (err) {
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
