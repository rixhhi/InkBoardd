export type DownloadStatus = "queued" | "running" | "paused" | "done" | "failed";

export type DownloadJob = {
  id: string;
  total: number;
  offset: number;
  status: DownloadStatus;
  checksum: string | null;
};

function pump(jobs: DownloadJob[]): DownloadJob[] {
  if (jobs.some((job) => job.status === "running")) return jobs;
  const index = jobs.findIndex((job) => job.status === "queued");
  if (index < 0) return jobs;
  return jobs.map((job, i) => (i === index ? { ...job, status: "running" } : job));
}

export function enqueueDownload(jobs: DownloadJob[], id: string, total: number, checksum: string | null = null): DownloadJob[] {
  if (!id || !(total > 0) || jobs.some((job) => job.id === id)) return jobs;
  return pump([...jobs, { id, total, offset: 0, status: "queued", checksum }]);
}

export function advanceDownload(jobs: DownloadJob[], id: string, bytes: number): DownloadJob[] {
  if (!(bytes > 0)) return jobs;
  const next = jobs.map((job) => {
    if (job.id !== id || job.status !== "running") return job;
    const offset = Math.min(job.total, job.offset + Math.floor(bytes));
    return { ...job, offset, status: offset >= job.total ? "done" : job.status } as DownloadJob;
  });
  return pump(next);
}

export function pauseDownload(jobs: DownloadJob[], id: string): DownloadJob[] {
  return pump(jobs.map((job) => (job.id === id && job.status === "running" ? { ...job, status: "paused" } : job)));
}

export function resumeDownload(jobs: DownloadJob[], id: string): DownloadJob[] {
  return pump(jobs.map((job) => (job.id === id && job.status === "paused" ? { ...job, status: "queued" } : job)));
}

/** A bad checksum fails the job and does not pretend the bytes were kept. */
export function rejectDownload(jobs: DownloadJob[], id: string, got: string): DownloadJob[] {
  return pump(
    jobs.map((job) => {
      if (job.id !== id || job.status !== "running" && job.status !== "done") return job;
      if (job.checksum && job.checksum !== got) return { ...job, status: "failed", offset: job.offset };
      return job;
    }),
  );
}
