// Run with: node --experimental-strip-types --test src/components/chat/virtualMessageMath.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { firstMessageRowAfter, messageRowOffsets, virtualMessageRange } from './virtualMessageMath.ts';

test('empty list and row boundaries do not create phantom rows', () => {
  assert.deepEqual(virtualMessageRange([0], 0, 600, 550), { start: 0, end: 0 });
  assert.equal(firstMessageRowAfter([0, 120, 240], 120), 1);
  assert.equal(firstMessageRowAfter([0, 120, 240], 240), 2);
});

test('ten thousand messages mount only viewport plus overscan', () => {
  const ids = Array.from({ length: 10000 }, (_, index) => index + 1);
  const offsets = messageRowOffsets(ids, new Map(), 108, 12);
  assert.deepEqual(virtualMessageRange(offsets, 600_000, 700, 550), { start: 4995, end: 5011 });
  assert.ok(virtualMessageRange(offsets, 600_000, 700, 550).end - virtualMessageRange(offsets, 600_000, 700, 550).start < 25);
});

test('prepend preserves anchor index by message ID and old viewport offset', () => {
  const measured = new Map([[100, 300], [101, 90]]);
  const original = messageRowOffsets([100, 101, 102], measured, 108, 28);
  const prepended = messageRowOffsets([98, 99, 100, 101, 102], measured, 108, 28);
  const oldTop = original[1] + 24;
  const newTop = prepended[3] + 24;
  assert.equal(newTop - oldTop, 272);
  assert.equal(virtualMessageRange(prepended, newTop, 500, 0).start, 3);
});

test('async image height changes only subsequent offsets', () => {
  const ids = [1, 2, 3];
  const measured = new Map([[1, 80], [2, 100]]);
  const before = messageRowOffsets(ids, measured, 108, 12);
  measured.set(2, 280);
  const after = messageRowOffsets(ids, measured, 108, 12);
  assert.equal(before[1], after[1]);
  assert.equal(after[2] - before[2], 180);
  assert.equal(after[3] - before[3], 180);
});
