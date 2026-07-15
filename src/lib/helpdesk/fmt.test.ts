import { test, expect, describe } from 'vitest';
import { fmtDuration } from './fmt';

describe('fmtDuration', () => {
  test('null/invalid/negative → em dash', () => {
    expect(fmtDuration(null)).toBe('—');
    expect(fmtDuration(NaN)).toBe('—');
    expect(fmtDuration(-1)).toBe('—');
  });
  test('under a minute', () => { expect(fmtDuration(0)).toBe('<1m'); expect(fmtDuration(0.004)).toBe('<1m'); });
  test('minutes only under an hour', () => {
    expect(fmtDuration(0.2)).toBe('12m');
    expect(fmtDuration(0.99)).toBe('59m');
  });
  test('hours and minutes', () => {
    expect(fmtDuration(1)).toBe('1h');
    expect(fmtDuration(2.1)).toBe('2h 6m');
    expect(fmtDuration(5.5)).toBe('5h 30m');
    expect(fmtDuration(26.5)).toBe('26h 30m');
  });
});
