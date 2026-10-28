import { spawn } from "node:child_process";
import { assertNoDelogo } from "./plan.ts";

export class FfmpegError extends Error {
  stderr: string;
  constructor(message: string, stderr: string) {
    super(message);
    this.name = "FfmpegError";
    this.stderr = stderr;
  }
}

export function runFfmpeg(
  bin: string,
  args: string[],
  opts?: { timeoutMs?: number; signal?: AbortSignal; cwd?: string },
): Promise<{ stderr: string }> {
  assertNoDelogo(args);
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"], shell: false, cwd: opts?.cwd });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, opts?.timeoutMs ?? 10 * 60 * 1000);
    const onAbort = () => child.kill("SIGKILL");
    opts?.signal?.addEventListener("abort", onAbort, { once: true });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 240_000) stderr = stderr.slice(-120_000);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      opts?.signal?.removeEventListener("abort", onAbort);
      if (opts?.signal?.aborted) {
        reject(new FfmpegError("ffmpeg aborted", stderr));
        return;
      }
      if (code === 0) resolve({ stderr });
      else reject(new FfmpegError((stderr.trim().split("\n").slice(-4).join(" ") || `ffmpeg exited ${code}`).slice(0, 500), stderr));
    });
  });
}
