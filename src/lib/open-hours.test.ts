import { test, expect, describe } from 'vitest';
import { getOpenStatus } from './open-hours';

// Business hours: 06:00 - 23:00 ET, daily

describe('getOpenStatus', () => {
  test('returns open during business hours', () => {
    // Tuesday 12:00 ET = 17:00 UTC (May 19, 2026 is in EDT = UTC-4)
    const status = getOpenStatus(new Date('2026-05-19T17:00:00Z'));
    expect(status.isOpen).toBe(true);
    expect(status.label).toBe('Open now');
    expect(status.detail).toBe('closes 11 PM');
  });

  test('returns closed before opening', () => {
    // Tuesday 04:00 ET = 09:00 UTC
    const status = getOpenStatus(new Date('2026-05-19T09:00:00Z'));
    expect(status.isOpen).toBe(false);
    expect(status.label).toBe('Closed');
    expect(status.detail).toBe('opens 6 AM');
  });

  test('returns closed after closing', () => {
    // Tuesday 23:30 ET = Wed 04:30 UTC
    const status = getOpenStatus(new Date('2026-05-20T04:30:00Z'));
    expect(status.isOpen).toBe(false);
    expect(status.detail).toBe('opens 6 AM');
  });

  test('exactly at opening time → open', () => {
    // Tuesday 06:00 ET = 10:00 UTC (note: ET is EDT in May = UTC-4)
    const status = getOpenStatus(new Date('2026-05-19T10:00:00Z'));
    expect(status.isOpen).toBe(true);
  });

  test('exactly at closing time → closed', () => {
    // Tuesday 23:00 ET = Wed 03:00 UTC
    const status = getOpenStatus(new Date('2026-05-20T03:00:00Z'));
    expect(status.isOpen).toBe(false);
  });
});
