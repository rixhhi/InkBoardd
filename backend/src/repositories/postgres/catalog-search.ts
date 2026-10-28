import { getPool } from "./client.ts";

export type CatalogDoc = {
  id: string;
  title: string;
  topic: string;
  educator: string;
  href: string;
};

let trigram: boolean | null = null;

/** True when pg_trgm is available. A failed extension install still leaves full-text search on. */
export async function trigramEnabled(): Promise<boolean> {
  if (trigram != null) return trigram;
  const pool = getPool();
  if (!pool) return false;
  try {
    await pool.query("create extension if not exists pg_trgm");
    trigram = true;
  } catch {
    trigram = false;
  }
  return trigram;
}

export async function rememberCatalog(rows: CatalogDoc[]): Promise<void> {
  const pool = getPool();
  if (!pool || rows.length === 0) return;
  const ids = [] as string[];
  const titles = [] as string[];
  const topics = [] as string[];
  const educators = [] as string[];
  const hrefs = [] as string[];
  for (const row of rows) {
    const id = row.id.trim();
    const title = row.title.trim();
    if (!id || !title) continue;
    ids.push(id);
    titles.push(title);
    topics.push(row.topic.trim());
    educators.push(row.educator.trim());
    hrefs.push(row.href.trim() || `/teacher/${id}`);
  }
  if (ids.length === 0) return;
  await pool.query(
    `insert into catalog_search (id, title, topic, educator, href)
     select * from unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[])
     on conflict (id) do update
       set title = excluded.title,
           topic = excluded.topic,
           educator = excluded.educator,
           href = excluded.href`,
    [ids, titles, topics, educators, hrefs],
  );
}

/** Title-weighted full text, plus a trigram fallback when the extension exists. */
export async function findCatalog(query: string, limit = 8): Promise<CatalogDoc[]> {
  const pool = getPool();
  const q = query.trim();
  if (!pool || q.length < 2) return [];
  const fuzzy = await trigramEnabled();
  const where = fuzzy
    ? `document @@ plainto_tsquery('simple', $1) or similarity(title, $1) > 0.25`
    : `document @@ plainto_tsquery('simple', $1)`;
  const { rows } = await pool.query<CatalogDoc>(
    `select id, title, topic, educator, href
       from catalog_search
      where ${where}
      order by ts_rank(document, plainto_tsquery('simple', $1)) desc, title asc
      limit $2`,
    [q, Math.min(20, Math.max(1, limit))],
  );
  return rows;
}

export async function forgetCatalog(ids: string[]): Promise<void> {
  const pool = getPool();
  if (!pool || ids.length === 0) return;
  await pool.query("delete from catalog_search where id = any($1::text[])", [ids]);
}
