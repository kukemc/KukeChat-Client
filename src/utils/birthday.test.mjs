// Run with: node --experimental-strip-types --test src/utils/birthday.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { birthdayYears, chinaToday, clampBirthdayDay, daysInMonth, formatBirthday, isBirthdayOn, isLeapYear, isValidBirthday, normalizeBirthday } from './birthday.ts';

const at = (iso) => Date.parse(iso);

test('"today" is the UTC+8 calendar day', () => {
  assert.deepEqual(chinaToday(at('2026-05-06T15:59:59Z')), { year: 2026, month: 5, day: 6 });
  assert.deepEqual(chinaToday(at('2026-05-06T16:00:00Z')), { year: 2026, month: 5, day: 7 });
  assert.deepEqual(chinaToday(at('2026-12-31T16:00:00Z')), { year: 2027, month: 1, day: 1 });
});

test('a birthday matches on its day in UTC+8, whatever the birth year', () => {
  const birthday = { month: 5, day: 7, year: 2008 };
  assert.equal(isBirthdayOn(birthday, at('2026-05-06T16:00:00Z')), true);
  assert.equal(isBirthdayOn(birthday, at('2026-05-07T15:59:59Z')), true);
  assert.equal(isBirthdayOn(birthday, at('2026-05-07T16:00:00Z')), false);
  assert.equal(isBirthdayOn(birthday, at('2026-05-06T15:59:59Z')), false);
  assert.equal(isBirthdayOn(null, at('2026-05-07T04:00:00Z')), false);
  assert.equal(isBirthdayOn(undefined, at('2026-05-07T04:00:00Z')), false);
});

test('a Feb 29 birthday is celebrated on Feb 28 in common years and Feb 29 in leap years', () => {
  const leapling = { month: 2, day: 29 };
  assert.equal(isBirthdayOn(leapling, at('2026-02-28T04:00:00Z')), true);
  assert.equal(isBirthdayOn(leapling, at('2026-03-01T04:00:00Z')), false);
  assert.equal(isBirthdayOn(leapling, at('2028-02-29T04:00:00Z')), true);
  assert.equal(isBirthdayOn(leapling, at('2028-02-28T04:00:00Z')), false);
  // 2 月 28 日生日的人在闰年不会多过一天
  assert.equal(isBirthdayOn({ month: 2, day: 28 }, at('2028-02-29T04:00:00Z')), false);
});

test('leap years and month lengths', () => {
  assert.equal(isLeapYear(2000), true);
  assert.equal(isLeapYear(1900), false);
  assert.equal(isLeapYear(2024), true);
  assert.equal(isLeapYear(2026), false);
  assert.equal(daysInMonth(2024, 2), 29);
  assert.equal(daysInMonth(2026, 2), 28);
  assert.equal(daysInMonth(2026, 4), 30);
  assert.equal(daysInMonth(2026, 12), 31);
});

test('the public birthday is validated and the year is optional', () => {
  assert.deepEqual(normalizeBirthday({ month: 5, day: 7 }), { month: 5, day: 7, year: null });
  assert.deepEqual(normalizeBirthday({ month: 5, day: 7, year: 2008 }), { month: 5, day: 7, year: 2008 });
  assert.deepEqual(normalizeBirthday({ month: 2, day: 29, year: null }), { month: 2, day: 29, year: null });
  assert.deepEqual(normalizeBirthday({ month: 5, day: 7, year: 1800 }), { month: 5, day: 7, year: null });
  for (const bad of [null, undefined, 'x', {}, { month: 13, day: 1 }, { month: 2, day: 30 }, { month: 4, day: 31 }, { month: 0, day: 5 }, { month: 5.5, day: 7 }, { month: '5', day: 7 }]) {
    assert.equal(normalizeBirthday(bad), null);
  }
});

test('birthdays are written "5 月 7 日", with the year only when it is public', () => {
  assert.equal(formatBirthday({ month: 5, day: 7, year: null }), '5 月 7 日');
  assert.equal(formatBirthday({ month: 5, day: 7, year: 2008 }), '2008 年 5 月 7 日');
  assert.equal(formatBirthday(null), '');
});

test('a birthday must be a real date, not before 1900 and not in the future (UTC+8)', () => {
  const now = at('2026-10-14T04:00:00Z');
  assert.equal(isValidBirthday(2008, 5, 7, now), true);
  assert.equal(isValidBirthday(2026, 10, 14, now), true);
  assert.equal(isValidBirthday(2026, 10, 15, now), false);
  assert.equal(isValidBirthday(2027, 1, 1, now), false);
  assert.equal(isValidBirthday(1899, 12, 31, now), false);
  assert.equal(isValidBirthday(1900, 1, 1, now), true);
  assert.equal(isValidBirthday(2023, 2, 29, now), false);
  assert.equal(isValidBirthday(2024, 2, 29, now), true);
  assert.equal(isValidBirthday(2008, 13, 1, now), false);
  // 北京时间已经是 15 日、UTC 还是 14 日
  assert.equal(isValidBirthday(2026, 10, 15, at('2026-10-14T16:30:00Z')), true);
});

test('changing year or month pulls the day back into range; years run from this year down to 1900', () => {
  assert.equal(clampBirthdayDay(2023, 2, 31), 28);
  assert.equal(clampBirthdayDay(2024, 2, 31), 29);
  assert.equal(clampBirthdayDay(2024, 4, 31), 30);
  assert.equal(clampBirthdayDay(2024, 5, 0), 1);
  const years = birthdayYears(at('2026-10-14T04:00:00Z'));
  assert.equal(years[0], 2026);
  assert.equal(years[years.length - 1], 1900);
  assert.equal(years.length, 127);
});
