import { readFeed } from './feed.js';

export function exportEvents(store, query) {
  const items = [], cursors = new Set();
  let cursor = '';
  do {
    const page = readFeed(store, { ...query, cursor });
    items.push(...page.items);
    cursor = page.nextCursor;
    if (cursor && cursors.has(cursor)) throw new Error('Export cursor stopped advancing');
    cursors.add(cursor);
    if (cursors.size > 1000) throw new Error('Export page budget exceeded');
  } while (cursor);
  return items;
}
