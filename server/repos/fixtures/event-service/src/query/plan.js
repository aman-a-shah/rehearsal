import { decodeCursor } from '../domain/cursor.js';
import { matchesKind } from '../domain/filters.js';
import { pageLimit } from '../domain/limits.js';
import { retained } from '../domain/retention.js';
import { ordered } from './sort.js';
import { afterCursor } from './window.js';

export function executePlan(store, { tenant, cursor = '', kind = '', limit = 25, since = '' }) {
  if (!tenant) throw new TypeError('Tenant required');
  const size = pageLimit(limit);
  const position = decodeCursor(cursor, tenant, kind);
  const scoped = store.forTenant(tenant).filter(item => matchesKind(item, kind) && retained(item, since));
  const remaining = afterCursor(ordered(scoped), position);
  return { items: remaining.slice(0, size), hasMore: remaining.length > size };
}
