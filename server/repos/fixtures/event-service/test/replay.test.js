import test from 'node:test';
import assert from 'node:assert/strict';
import { EventStore } from '../src/storage/event-store.js';
import { replayBalances } from '../src/services/replay.js';

const row = (id, amount, tenant = 'harbor', kind = 'credit') => ({ id, amount, tenant, kind, occurredAt: '2026-01-01T00:00:00Z' });
test('replay applies each credit once over several pages', () => assert.equal(replayBalances(new EventStore([row('1', 5), row('2', 10), row('3', 20)]), 'harbor', 2), 35));
test('replay isolates tenants', () => assert.equal(replayBalances(new EventStore([row('1', 5), row('2', 999, 'atlas')]), 'harbor'), 5));
test('replay only applies credits', () => assert.equal(replayBalances(new EventStore([row('1', 5), row('2', 99, 'harbor', 'audit')]), 'harbor'), 5));
