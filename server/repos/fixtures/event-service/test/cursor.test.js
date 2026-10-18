import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeCursor, decodeCursor } from '../src/domain/cursor.js';
import { pageLimit } from '../src/domain/limits.js';

const item = { id: '9007199254740993', occurredAt: '2026-01-02T12:00:00Z' };
test('cursor round trip is lossless', () => assert.deepEqual(decodeCursor(encodeCursor(item, 'harbor'), 'harbor'), item));
test('cursor is tenant scoped', () => assert.throws(() => decodeCursor(encodeCursor(item, 'harbor'), 'atlas'), /scope/));
test('cursor preserves kind filter', () => assert.throws(() => decodeCursor(encodeCursor(item, 'harbor', 'credit'), 'harbor', 'debit'), /scope/));
test('invalid cursor rejected', () => assert.throws(() => decodeCursor('broken', 'harbor'), TypeError));
test('empty cursor starts first page', () => assert.equal(decodeCursor('', 'harbor'), null));
test('limit accepts query string', () => assert.equal(pageLimit('10'), 10));
test('limit rejects zero and excess', () => { assert.throws(() => pageLimit(0), RangeError); assert.throws(() => pageLimit(101), RangeError); });
