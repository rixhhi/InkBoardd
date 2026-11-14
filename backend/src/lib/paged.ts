/**
 * Follow a paginated listing one page at a time, but stop when the time budget is spent.
 *
 * A catalog search used to walk up to 12 pages in a row, each with its own retries, so one
 * slow upstream page could eat the whole request deadline. The first page is always
 * returned; later pages are a bonus and are dropped once the budget is gone.
 */
export type PagedOptions<T> = {
  first: unknown;
  /** Rows of one raw page. */
  rows: (page: unknown) => T[];
  /** URL of the page after `page` (which is page number `index`, 1-based for the first follow-up), or null. */
  next: (page: unknown, index: number) => string | null;
  fetchPage: (url: string) => Promise<unknown>;
  maxPages: number;
  budgetMs: number;
  now?: () => number;
};

export async function collectPages<T>(o: PagedOptions<T>): Promise<{ rows: T[]; pages: number; truncated: boolean }> {
  const now = o.now ?? Date.now;
  const start = now();
  const rows: T[] = [...o.rows(o.first)];
  let url = o.next(o.first, 1);
  let pages = 1;
  let truncated = false;
  while (url && pages < o.maxPages) {
    if (now() - start >= o.budgetMs) {
      truncated = true;
      break;
    }
    const page = await o.fetchPage(url).catch(() => null);
    if (!page) break;
    const more = o.rows(page);
    if (!more.length) break;
    rows.push(...more);
    pages += 1;
    url = o.next(page, pages);
  }
  return { rows, pages, truncated };
}
