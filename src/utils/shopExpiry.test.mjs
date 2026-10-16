// Run with: node --experimental-strip-types --test src/utils/shopExpiry.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { daysLeft, durationDaysOf, durationLabel, expiryLabel, formatExpiryDate, isExpired, isExpiringSoon, renewedUntil } from './shopExpiry.ts';

const DAY = 86_400_000;
const now = Date.parse('2026-10-14T04:00:00Z');
const at = (ms) => new Date(now + ms).toISOString();

test('duration_days is a positive integer or the item is permanent', () => {
  assert.equal(durationDaysOf(30), 30);
  for (const bad of [null, undefined, 0, -3, 1.5, '30', Number.NaN]) {
    assert.equal(durationDaysOf(bad), null);
  }
  assert.equal(durationLabel(30), '30 天');
  assert.equal(durationLabel(null), null);
});

test('days left rounds up and bottoms out at 0', () => {
  assert.equal(daysLeft(at(2 * DAY + 3_600_000), now), 3);
  assert.equal(daysLeft(at(2 * DAY), now), 2);
  assert.equal(daysLeft(at(60_000), now), 1);
  assert.equal(daysLeft(at(-1), now), 0);
  assert.equal(daysLeft(null, now), null);
  assert.equal(daysLeft('not a date', now), null);
});

test('naive timestamps from the API are read as UTC', () => {
  assert.equal(daysLeft('2026-10-16T04:00:00', now), 2);
  assert.equal(daysLeft('2026-10-16T04:00:00.123456', now), 3);
});

test('expiring soon means 3 days or less, including already expired', () => {
  assert.equal(isExpiringSoon(at(3 * DAY), now), true);
  assert.equal(isExpiringSoon(at(3 * DAY + 1000), now), false);
  assert.equal(isExpiringSoon(at(-1000), now), true);
  assert.equal(isExpiringSoon(null, now), false);
  assert.equal(isExpired(at(-1), now), true);
  assert.equal(isExpired(at(1), now), false);
  assert.equal(isExpired(null, now), false);
});

test('labels read "还剩 N 天", "今天到期" on the last day, "已到期" afterwards', () => {
  assert.equal(expiryLabel(at(5 * DAY - 1000), now), '还剩 5 天');
  assert.equal(expiryLabel(at(DAY + 1000), now), '还剩 2 天');
  assert.equal(expiryLabel(at(DAY), now), '今天到期');
  assert.equal(expiryLabel(at(1000), now), '今天到期');
  assert.equal(expiryLabel(at(0), now), '已到期');
  assert.equal(expiryLabel(null, now), null);
});

test('renewing adds N days on top of an unexpired date, otherwise counts from now', () => {
  assert.equal(renewedUntil(at(2 * DAY), 30, now)?.getTime(), now + 32 * DAY);
  assert.equal(renewedUntil(null, 30, now)?.getTime(), now + 30 * DAY);
  assert.equal(renewedUntil(at(-5 * DAY), 30, now)?.getTime(), now + 30 * DAY);
  assert.equal(renewedUntil(at(2 * DAY), null, now), null);
});

test('expiry dates are written in UTC+8 and drop the current year', () => {
  // 2026-11-13 20:00 UTC 是北京时间 11 月 14 日 04:00
  assert.equal(formatExpiryDate(new Date('2026-11-13T20:00:00Z'), now), '11 月 14 日');
  assert.equal(formatExpiryDate(new Date('2027-01-02T03:00:00Z'), now), '2027 年 1 月 2 日');
  // 北京时间已经跨年、UTC 还没有
  assert.equal(formatExpiryDate(new Date('2026-12-31T18:00:00Z'), now), '2027 年 1 月 1 日');
});
