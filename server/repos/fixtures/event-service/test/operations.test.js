import test from 'node:test';
import assert from 'node:assert/strict';
import { EventStore } from '../src/storage/event-store.js';
import { health } from '../src/health.js';
import { kindCounts } from '../src/metrics.js';

const row = { id: '1', tenant: 'harbor', kind: 'credit', occurredAt: '2026-01-01T00:00:00Z' };
test('store rejects duplicate IDs per tenant', () => assert.throws(() => new EventStore([row, row]), /Duplicate/));
test('store permits same ID across tenants', () => assert.equal(new EventStore([row, { ...row, tenant: 'atlas' }]).size, 2));
test('store rejects non-string ID', () => assert.throws(() => new EventStore([{ ...row, id: 1 }]), TypeError));
test('health reports count', () => assert.deepEqual(health(new EventStore([row])), { ready: true, storedEvents: 1 }));
test('metrics count kinds', () => assert.deepEqual(kindCounts([row, { ...row, kind: 'audit' }]), { credit: 1, audit: 1 }));
