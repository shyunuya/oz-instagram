import test from 'node:test';
import assert from 'node:assert/strict';
import { isoWeek, slotTimes, weekIndex, weekMonday } from '../src/dates.ts';

test('ISO weeks follow the KST calendar, including year boundaries', () => {
  assert.equal(isoWeek(new Date('2026-10-12T00:00:00+09:00')), '2026-W42');
  assert.equal(isoWeek(new Date('2026-10-18T23:59:00+09:00')), '2026-W42');
  // UTC로는 일요일이지만 KST로는 월요일이라 다음 주입니다.
  assert.equal(isoWeek(new Date('2026-10-18T15:30:00Z')), '2026-W43');
  assert.equal(isoWeek(new Date('2027-01-01T12:00:00+09:00')), '2026-W53');
  assert.equal(weekMonday('2026-W43'), '2026-10-19');
  assert.equal(weekMonday('2026-W01'), '2025-12-29');
  assert.throws(() => weekMonday('2026-43'));
});

test('warm-up week index and slot times cover the whole week', () => {
  assert.equal(weekIndex('2026-10-19', '2026-10-19'), 0);
  assert.equal(weekIndex('2026-10-19', '2026-11-02'), 2);
  const slots = slotTimes('2026-10-19', ['12:00', '20:00']);
  assert.equal(slots.length, 14);
  assert.equal(slots[0], '2026-10-19T12:00:00+09:00');
  assert.equal(slots.at(-1), '2026-10-25T20:00:00+09:00');
});
