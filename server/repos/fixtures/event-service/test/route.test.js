import test from 'node:test';
import assert from 'node:assert/strict';
import { EventStore } from '../src/storage/event-store.js';
import { getFeed } from '../src/http/feed-route.js';

const store = new EventStore(['1', '2', '3'].map(id => ({ id, tenant: 'harbor', kind: 'credit', occurredAt: '2026-01-01T00:00:00Z' })));
test('route continues the feed', () => {
  const first = getFeed(store, { auth: { tenant: 'harbor' }, query: { limit: 2 } });
  const next = getFeed(store, { auth: { tenant: 'harbor' }, query: { limit: 2, cursor: first.body.nextCursor } });
  assert.deepEqual(next.body.events.map(x => x.id), ['3']);
});
test('unauthenticated requests rejected', () => assert.equal(getFeed(store, { query: {} }).status, 401));
test('query cannot override authenticated tenant', () => assert.equal(getFeed(store, { auth: { tenant: 'atlas' }, query: { tenant: 'harbor' } }).body.events.length, 0));
test('invalid limit is a client error', () => assert.equal(getFeed(store, { auth: { tenant: 'harbor' }, query: { limit: -1 } }).status, 400));
