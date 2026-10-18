import test from 'node:test';
import assert from 'node:assert/strict';
import { EventStore } from '../src/storage/event-store.js';
import { exportEvents } from '../src/services/export.js';

const rows = ['4', '1', '3', '2'].map(id => ({ id, tenant: 'harbor', kind: 'credit', occurredAt: '2026-01-01T00:00:00Z' }));
test('export drains tied timestamps with no repeats', () => assert.deepEqual(exportEvents(new EventStore(rows), { tenant: 'harbor', limit: 2 }).map(x => x.id), ['1', '2', '3', '4']));
test('one-item pages advance', () => assert.equal(exportEvents(new EventStore(rows), { tenant: 'harbor', limit: 1 }).length, 4));
test('large page finishes at once', () => assert.equal(exportEvents(new EventStore(rows), { tenant: 'harbor', limit: 50 }).length, 4));
test('empty export', () => assert.deepEqual(exportEvents(new EventStore(), { tenant: 'harbor' }), []));
