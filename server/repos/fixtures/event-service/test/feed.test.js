import test from 'node:test';
import assert from 'node:assert/strict';
import { EventStore } from '../src/storage/event-store.js';
import { readFeed } from '../src/services/feed.js';

const at = '2026-01-02T12:00:00Z';
const rows = ['9007199254740994', '9007199254740993', '9007199254740992'].map(id => ({ id, occurredAt: at, tenant: 'harbor', kind: 'credit', amount: 1 }));
test('first page is ordered without losing ID precision', () => assert.deepEqual(readFeed(new EventStore(rows), { tenant: 'harbor', limit: 2 }).items.map(x => x.id), ['9007199254740992', '9007199254740993']));
test('continuation returns each same-time event exactly once', () => {
  const store = new EventStore(rows);
  const first = readFeed(store, { tenant: 'harbor', limit: 2 });
  const next = readFeed(store, { tenant: 'harbor', limit: 2, cursor: first.nextCursor });
  assert.deepEqual(next.items.map(x => x.id), ['9007199254740994']);
  assert.equal(next.nextCursor, null);
});
test('tenant scope applied before page limit', () => {
  const store = new EventStore([{ ...rows[0], tenant: 'atlas' }, ...rows]);
  assert(readFeed(store, { tenant: 'harbor', limit: 2 }).items.every(x => x.tenant === 'harbor'));
});
test('kind filter applied before page limit', () => {
  const store = new EventStore([{ ...rows[0], id: '1', kind: 'debit' }, ...rows]);
  assert(readFeed(store, { tenant: 'harbor', kind: 'credit', limit: 2 }).items.every(x => x.kind === 'credit'));
});
test('empty tenant feed terminates', () => assert.deepEqual(readFeed(new EventStore(rows), { tenant: 'empty' }), { items: [], hasMore: false, nextCursor: null }));
test('retention removes old events', () => assert.equal(readFeed(new EventStore(rows), { tenant: 'harbor', since: '2026-01-03T00:00:00Z' }).items.length, 0));
