/** The byte window a video element asked for. `null` means the range cannot be served. */
export function byteRange(total: number, header: string | null): { start: number; end: number; status: 200 | 206 } | null {
  if (!Number.isFinite(total) || total <= 0) return null;
  if (!header) return { start: 0, end: total - 1, status: 200 };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const startRaw = match[1] ?? "";
  const endRaw = match[2] ?? "";
  if (startRaw === "" && endRaw === "") return null;
  let start: number;
  let end: number;
  if (startRaw === "") {
    const suffix = Number(endRaw);
    if (!Number.isInteger(suffix) || suffix <= 0) return null;
    start = Math.max(0, total - suffix);
    end = total - 1;
  } else {
    start = Number(startRaw);
    end = endRaw === "" ? total - 1 : Number(endRaw);
    if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
    if (end >= total) end = total - 1;
  }
  if (start < 0 || start >= total || end < start) return null;
  return { start, end, status: 206 };
}

/** The bytes a player should receive, or null when the range is unusable. */
export function sliceRange(bytes: Uint8Array, header: string | null): { status: 200 | 206 | 416; body: Uint8Array; contentRange: string } | null {
  const window = byteRange(bytes.length, header);
  if (!window) {
    if (!header) return null;
    return { status: 416, body: new Uint8Array(), contentRange: `bytes */${bytes.length}` };
  }
  return {
    status: window.status,
    body: bytes.subarray(window.start, window.end + 1),
    contentRange: `bytes ${window.start}-${window.end}/${bytes.length}`,
  };
}
