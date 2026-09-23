import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, isDateKey, longDate, rangeLabel, relativeDayTitle, shortWeekday } from '../src/lib/dates';

describe('dates', () => {
  it('formats like the design', () => {
    expect(longDate('2026-09-23')).toBe('Wednesday, 23 September');
    expect(shortWeekday('2026-09-23')).toBe('Wed');
    expect(rangeLabel('2026-09-17', '2026-09-23')).toBe('17 – 23 Sep');
    expect(rangeLabel('2026-09-28', '2026-10-04')).toBe('28 Sep – 4 Oct');
  });

  it('does calendar arithmetic across month and DST boundaries', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-10-24', 7)).toBe('2026-10-31');
    expect(daysBetween('2026-03-28', '2026-04-04')).toBe(7);
  });

  it('validates keys', () => {
    expect(isDateKey('2026-09-23')).toBe(true);
    expect(isDateKey('2026-02-30')).toBe(false);
    expect(isDateKey('23-09-2026')).toBe(false);
    expect(isDateKey(null)).toBe(false);
  });

  it('titles days relative to today', () => {
    expect(relativeDayTitle('2026-09-23', '2026-09-23')).toBe('Today');
    expect(relativeDayTitle('2026-09-22', '2026-09-23')).toBe('Yesterday');
    expect(relativeDayTitle('2026-09-20', '2026-09-23')).toBe('Sunday');
    expect(relativeDayTitle('2026-09-01', '2026-09-23')).toBe('1 Sep');
  });
});
