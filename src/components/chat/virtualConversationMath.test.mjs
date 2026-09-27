// Run with: node --experimental-strip-types --test src/components/chat/virtualConversationMath.test.mjs
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { test } from 'node:test';
import { conversationWindow } from './virtualConversationMath.ts';

test('large list mounts only viewport rows plus bounded overscan', () => {
  for (let offset = 0; offset < 100_000; offset += 173) {
    const { first, last } = conversationWindow(10_000, offset, 122, 720, 68, 5);
    assert.ok(first >= 0 && last <= 10_000 && last >= first);
    assert.ok(last - first <= Math.ceil(720 / 68) + 12);
  }
});

test('small lists and empty searches remain visible', () => {
  assert.deepEqual(conversationWindow(0, 0, 150, 700, 64, 5), { first: 0, last: 0 });
  assert.deepEqual(conversationWindow(3, 0, 150, 700, 64, 5), { first: 0, last: 3 });
  assert.deepEqual(conversationWindow(1000, 0, 150, 700, 64, 5), { first: 0, last: 14 });
});

test('deep scrolling keeps row indices and spacer total correct', () => {
  const count = 1000;
  const stride = 72;
  const { first, last } = conversationWindow(count, 42_500, 180, 640, stride, 5);
  assert.equal(first, Math.floor((42_500 - 180) / stride) - 5);
  assert.equal(first * stride + (last - first) * stride + (count - last) * stride, count * stride);
});

test('100k calculations over 1000 rows remain inexpensive', () => {
  const started = performance.now();
  for (let i = 0; i < 100_000; i++) conversationWindow(1000, i % 65_000, 120, 720, 68, 5);
  const duration = performance.now() - started;
  console.log(`100k viewport calculations: ${duration.toFixed(1)}ms`);
  assert.ok(duration < 3000);
});
