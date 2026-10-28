/** Byte window for a saved lecture. `total` is the cached blob's size, not its bytes. */
/**
 * @param {number} total
 * @param {string | null | undefined} header
 * @param {string | undefined} contentType
 * @returns {{ status: 200 | 206 | 416, start: number, end: number, contentRange: string | null, contentType: string } | null}
 */
export function rangeReply(total, header, contentType) {
  const type = contentType || "application/octet-stream";
  const size = Number.isFinite(total) && total > 0 ? total : 0;
  const refused = () => ({
    status: /** @type {416} */ (416),
    start: 0,
    end: -1,
    contentRange: `bytes */${size}`,
    contentType: type,
  });
  if (!Number.isFinite(total) || total <= 0) return header ? refused() : null;
  if (!header) {
    return {
      status: /** @type {200} */ (200),
      start: 0,
      end: total - 1,
      contentRange: null,
      contentType: type,
    };
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
  if (!match || (match[1] === "" && match[2] === "")) return refused();
  let start;
  let end;
  if (match[1] === "") {
    const suffix = Number(match[2]);
    if (!Number.isInteger(suffix) || suffix <= 0) return refused();
    start = Math.max(0, total - suffix);
    end = total - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? total - 1 : Number(match[2]);
    if (!Number.isInteger(start) || !Number.isInteger(end)) return refused();
    if (end >= total) end = total - 1;
  }
  if (start < 0 || start >= total || end < start) return refused();
  return {
    status: /** @type {206} */ (206),
    start,
    end,
    contentRange: `bytes ${start}-${end}/${total}`,
    contentType: type,
  };
}
