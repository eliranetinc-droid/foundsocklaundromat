import { test, expect, describe } from 'vitest';
import { shiftDay, daysBetween, resolveRange, resolveFromParams } from './ranges';

// 2026-07-15 is a Wednesday (getUTCDay=3 at noon UTC).
const T = '2026-07-15';

describe('day math', () => {
  test('shiftDay moves across month boundaries', () => {
    expect(shiftDay('2026-07-01', -1)).toBe('2026-06-30');
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDay(T, 0)).toBe(T);
  });
  test('daysBetween is inclusive', () => {
    expect(daysBetween('2026-07-01', '2026-07-01')).toBe(1);
    expect(daysBetween('2026-07-01', '2026-07-15')).toBe(15);
  });
});

describe('resolveRange presets (today = Wed 2026-07-15)', () => {
  test('today / yesterday are single days with day-before comparison', () => {
    const r = resolveRange('today', T);
    expect(r).toMatchObject({ start: T, end: T, prevStart: '2026-07-14', prevEnd: '2026-07-14', single: true, days: 1 });
    const y = resolveRange('yesterday', T);
    expect(y).toMatchObject({ start: '2026-07-14', end: '2026-07-14', prevStart: '2026-07-13', prevEnd: '2026-07-13', single: true });
  });
  test('last-7 / last-30 are rolling windows ending today', () => {
    const r = resolveRange('last-7', T);
    expect(r).toMatchObject({ start: '2026-07-09', end: T, prevStart: '2026-07-02', prevEnd: '2026-07-08', days: 7 });
    expect(resolveRange('last-30', T).start).toBe('2026-06-16');
  });
  test('this-week starts Sunday; last-week is the previous full Sun..Sat', () => {
    const r = resolveRange('this-week', T);
    expect(r).toMatchObject({ start: '2026-07-12', end: T, days: 4 });
    expect(r.prevEnd).toBe('2026-07-11');
    expect(r.prevStart).toBe('2026-07-08'); // same length (4 days) immediately before
    const lw = resolveRange('last-week', T);
    expect(lw).toMatchObject({ start: '2026-07-05', end: '2026-07-11', days: 7, prevStart: '2026-06-28', prevEnd: '2026-07-04' });
  });
  test('this-month starts on the 1st; last-month is the full previous month', () => {
    expect(resolveRange('this-month', T)).toMatchObject({ start: '2026-07-01', end: T, days: 15, prevStart: '2026-06-16', prevEnd: '2026-06-30' });
    expect(resolveRange('last-month', T)).toMatchObject({ start: '2026-06-01', end: '2026-06-30', days: 30 });
  });
  test('unknown preset falls back to last-7', () => {
    expect(resolveRange('bogus', T).preset).toBe('last-7');
  });
  test('labels are human', () => {
    expect(resolveRange('today', T).label).toBe('Today');
    expect(resolveRange('last-week', T).label).toBe('Last week');
  });
});

describe('custom + params', () => {
  const params = (q: string) => new URLSearchParams(q);
  test('custom range parses, clamps future end to today, swaps reversed bounds', () => {
    const r = resolveRange('custom', T, { from: '2026-07-03', to: '2026-07-05' });
    expect(r).toMatchObject({ start: '2026-07-03', end: '2026-07-05', days: 3, prevStart: '2026-06-30', prevEnd: '2026-07-02' });
    expect(resolveRange('custom', T, { from: '2026-07-10', to: '2027-01-01' }).end).toBe(T);
    expect(resolveRange('custom', T, { from: '2026-07-05', to: '2026-07-03' }).start).toBe('2026-07-03');
  });
  test('custom with invalid dates falls back to last-7', () => {
    expect(resolveRange('custom', T, { from: 'nope', to: '2026-07-05' }).preset).toBe('last-7');
    expect(resolveRange('custom', T).preset).toBe('last-7');
  });
  test('custom label shows the dates', () => {
    expect(resolveRange('custom', T, { from: '2026-07-03', to: '2026-07-05' }).label).toBe('Jul 3 – Jul 5');
  });
  test('resolveFromParams reads period/from/to and maps legacy values', () => {
    expect(resolveFromParams(params('period=this-week'), T).preset).toBe('this-week');
    expect(resolveFromParams(params('period=custom&from=2026-07-03&to=2026-07-05').entries() && params('period=custom&from=2026-07-03&to=2026-07-05'), T).days).toBe(3);
    expect(resolveFromParams(params('period=7'), T).preset).toBe('last-7');   // legacy pills
    expect(resolveFromParams(params('period=30'), T).preset).toBe('last-30');
    expect(resolveFromParams(params('period=today'), T).preset).toBe('today');
    expect(resolveFromParams(params(''), T).preset).toBe('last-7');           // default
  });
});
