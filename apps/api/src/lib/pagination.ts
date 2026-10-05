/**
 * Pagination for every list endpoint.
 *
 * Nothing here is bounded by nature: a batch can hold hundreds of students, a
 * bank thousands of questions, a report card a whole term's roster. So each
 * list route takes `limit`/`offset` and answers with the same envelope, and
 * callers page instead of pulling everything and slicing it in the browser.
 */

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export interface Page {
  limit: number;
  offset: number;
}

export interface Paged<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

interface QuerySource {
  req: { query: (key: string) => string | undefined };
}

/** Reads `?limit=&offset=` with a sane default and a hard cap. */
export function pageParams(c: QuerySource, fallback = DEFAULT_LIMIT): Page {
  const rawLimit = Number(c.req.query("limit"));
  const rawOffset = Number(c.req.query("offset"));

  const limit =
    Number.isFinite(rawLimit) && rawLimit >= 1
      ? Math.min(Math.floor(rawLimit), MAX_LIMIT)
      : fallback;
  const offset = Number.isFinite(rawOffset) && rawOffset >= 1 ? Math.floor(rawOffset) : 0;

  return { limit, offset };
}

export function paginate<T>(items: T[], total: number, page: Page): Paged<T> {
  return {
    items,
    total,
    limit: page.limit,
    offset: page.offset,
    hasMore: page.offset + items.length < total,
  };
}
