import { compareEvents } from '../domain/order.js';

export function afterCursor(items, cursor) {
  if (!cursor) return items;
  // The continuation must use the same (timestamp, ID) ordering as the first page.
  return items.filter(item => Date.parse(item.occurredAt) >= Date.parse(cursor.occurredAt));
}

export function strictlyOrdered(items) {
  return items.every((item, index) => index === 0 || compareEvents(items[index - 1], item) < 0);
}
