export type SpriteSheet = {
  interval: number;
  count: number;
  columns: number;
  rows: number;
  cellW: number;
  cellH: number;
  url: string;
  duration?: number;
};

export type PreparedMedia = {
  sprites: SpriteSheet | null;
  audioUrl: string | null;
  hlsUrl: string | null;
  silence?: { start: number; end: number }[] | null;
  waveformUrl?: string | null;
  jobId?: string | null;
};

export function parseSpriteSheet(raw: unknown, resolvedUrl: string): SpriteSheet | null {
  if (!raw || typeof raw !== "object" || !resolvedUrl) return null;
  const row = raw as Record<string, unknown>;
  const num = (key: string) => {
    const n = Number(row[key]);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const interval = num("interval");
  const count = num("count");
  const columns = num("columns");
  const rows = num("rows");
  const cellW = num("cellW");
  const cellH = num("cellH");
  if (!interval || !count || !columns || !rows || !cellW || !cellH) return null;
  const duration = Number(row.duration);
  return {
    interval,
    count,
    columns,
    rows,
    cellW,
    cellH,
    url: resolvedUrl,
    duration: Number.isFinite(duration) && duration > 0 ? duration : undefined,
  };
}

export function spriteCell(timeSec: number, sheet: SpriteSheet) {
  const interval = sheet.interval > 0 ? sheet.interval : 10;
  const count = Math.max(1, sheet.count);
  const index = Math.min(count - 1, Math.max(0, Math.floor(Math.max(0, timeSec) / interval)));
  const columns = Math.max(1, sheet.columns);
  const col = index % columns;
  const row = Math.floor(index / columns);
  return {
    index,
    col,
    row,
    x: col === 0 ? 0 : -col * sheet.cellW,
    y: row === 0 ? 0 : -row * sheet.cellH,
    sheetW: columns * sheet.cellW,
    sheetH: Math.max(1, sheet.rows) * sheet.cellH,
  };
}

export function resolveSpriteUrl(sheet: SpriteSheet, base?: string): string {
  if (/^(https?:|blob:)/.test(sheet.url) || sheet.url.startsWith("/")) return sheet.url;
  if (!base) return sheet.url;
  return `${base.replace(/\/$/, "")}/${sheet.url}`;
}
