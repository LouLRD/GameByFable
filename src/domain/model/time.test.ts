import { describe, expect, it } from 'vitest';
import { formatClock, formatClockFr, interval, intersectIntervals, intervalContains, intervalContainsTime, intervalDuration, intervalsOverlap, parseClockToSeconds } from './time';

describe('temps simulé', () => {
  it('formate les horloges à partir de 20:49:00', () => {
    expect(formatClock('20:49:00', 0)).toBe('20:49:00');
    expect(formatClock('20:49:00', 500)).toBe('20:57:20');
    expect(formatClock('20:49:00', 1380, false)).toBe('21:12');
    expect(formatClockFr('20:49:00', 500)).toBe('20 h 57 min 20 s');
    expect(formatClockFr('20:49:00', 660)).toBe('21 h 00');
    expect(parseClockToSeconds('20:49:00', '21:12:00')).toBe(1380);
  });

  it('opérations sur intervalles', () => {
    const a = interval(0, 10);
    const b = interval(5, 15);
    expect(intervalsOverlap(a, b)).toBe(true);
    expect(intervalsOverlap(a, interval(10, 20))).toBe(false);
    expect(intervalContains(interval(0, 20), b)).toBe(true);
    expect(intervalContainsTime(a, 9)).toBe(true);
    expect(intervalContainsTime(a, 10)).toBe(false);
    expect(intervalDuration(b)).toBe(10);
    expect(intersectIntervals(a, b)).toEqual(interval(5, 10));
    expect(intersectIntervals(a, interval(20, 30))).toBeNull();
  });
});
