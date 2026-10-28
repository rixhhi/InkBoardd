export type RankedText = { title: string; topic: string; educator: string };

/** Title outweighs topic, and topic outweighs the teacher name. */
export function catalogScore(row: RankedText, query: string): number {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return 0;
  const title = row.title.toLowerCase();
  const topic = row.topic.toLowerCase();
  const educator = row.educator.toLowerCase();
  let score = 0;
  if (title.startsWith(needle)) score += 100;
  else if (title.includes(needle)) score += 60;
  if (topic.includes(needle)) score += 30;
  if (educator.startsWith(needle)) score += 20;
  else if (educator.includes(needle)) score += 10;
  return score;
}

export function byCatalogScore<T>(rows: T[], query: string, text: (row: T) => RankedText): T[] {
  return rows
    .map((row, index) => ({ row, index, score: catalogScore(text(row), query) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item.row);
}
