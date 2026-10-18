import test from 'node:test';
import assert from 'node:assert/strict';
import { compareEvents } from '../src/domain/order.js';
import { ordered } from '../src/query/sort.js';
import { afterCursor, strictlyOrdered } from '../src/query/window.js';

const at = '2026-01-02T12:00:00.000Z';
const row = (id, occurredAt = at) => ({ id, occurredAt });
test('numeric IDs sort numerically', () => assert.deepEqual(ordered([row('10'), row('2')]).map(x => x.id), ['2', '10']));
test('64-bit IDs retain precision', () => assert(compareEvents(row('9007199254740992'), row('9007199254740993')) < 0));
test('timestamp precedes ID', () => assert(compareEvents(row('99', '2026-01-01T00:00:00Z'), row('1')) < 0));
test('equal keys compare equally', () => assert.equal(compareEvents(row('10'), row('10')), 0));
test('sort leaves caller array untouched', () => { const rows = [row('2'), row('1')]; ordered(rows); assert.equal(rows[0].id, '2'); });
test('cursor excludes earlier and equal IDs at same time', () => assert.deepEqual(afterCursor([row('1'), row('2'), row('3')], row('2')).map(x => x.id), ['3']));
test('cursor excludes older timestamps', () => assert.deepEqual(afterCursor([row('9', '2026-01-01T00:00:00Z')], row('1')), []));
test('strict order rejects duplicates', () => assert.equal(strictlyOrdered([row('2'), row('2')]), false));
