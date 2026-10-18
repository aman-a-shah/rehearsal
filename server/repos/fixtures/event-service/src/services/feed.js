import { executePlan } from '../query/plan.js';
import { encodeCursor } from '../domain/cursor.js';

export function readFeed(store, query) {
  const page = executePlan(store, query);
  return { ...page, nextCursor: page.hasMore ? encodeCursor(page.items.at(-1), query.tenant, query.kind || '') : null };
}
