// Run: node --experimental-strip-types --test src/components/chat/instantMessageScroll.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setInstantMessageScrollTop } from './instantMessageScroll.ts';

test('immediately positions virtual row despite smooth CSS and restores after frame', () => {
  const callbacks = [];
  const element = { style: { scrollBehavior: '' }, scrollTop: 0 };
  setInstantMessageScrollTop(element, 8400, (callback) => callbacks.push(callback));
  assert.equal(element.scrollTop, 8400);
  assert.equal(element.style.scrollBehavior, 'auto');
  callbacks.shift()();
  assert.equal(element.style.scrollBehavior, '');
});

test('overlapping jump/calibration preserves original inline style', () => {
  const callbacks = [];
  const schedule = (callback) => callbacks.push(callback);
  const element = { style: { scrollBehavior: 'smooth' }, scrollTop: 0 };
  setInstantMessageScrollTop(element, 4200, schedule);
  setInstantMessageScrollTop(element, 4350, schedule);
  callbacks.shift()();
  assert.equal(element.style.scrollBehavior, 'auto');
  assert.equal(element.scrollTop, 4350);
  callbacks.shift()();
  assert.equal(element.style.scrollBehavior, 'smooth');
});
