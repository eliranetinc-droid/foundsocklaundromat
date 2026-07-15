import { etDay } from './pv';

/** All values are ET calendar-day strings (YYYY-MM-DD). Day math runs on
 * noon-UTC anchors so DST can never shift a calendar day. */
export interface DateRange {
  preset: string;
  start: string; end: string;
  prevStart: string; prevEnd: string;
  label: string; days: number; single: boolean;
}

const noon = (day: string) => new Date(day + 'T12:00:00Z');

export function shiftDay(day: string, n: number): string {
  return new Date(noon(day).getTime() + n * 86400000).toISOString().slice(0, 10);
}
export function daysBetween(a: string, b: string): number {
  return Math.round((noon(b).getTime() - noon(a).getTime()) / 86400000) + 1;
}
const weekdayOf = (day: string) => noon(day).getUTCDay(); // 0 = Sunday

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const fmtShort = (day: string) => noon(day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export const RANGE_PRESETS: { key: string; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last-7', label: 'Last 7 days' },
  { key: 'last-30', label: 'Last 30 days' },
  { key: 'this-week', label: 'This week' },
  { key: 'last-week', label: 'Last week' },
  { key: 'this-month', label: 'This month' },
  { key: 'last-month', label: 'Last month' },
];

function windows(preset: string, start: string, end: string, label: string): DateRange {
  const days = daysBetween(start, end);
  const prevEnd = shiftDay(start, -1);
  const prevStart = shiftDay(prevEnd, -(days - 1));
  return { preset, start, end, prevStart, prevEnd, label, days, single: start === end };
}

/** Resolve a preset (or custom from/to) into concrete ET windows. `today` is
 * injected for testability; callers pass `etDay(new Date())`. */
export function resolveRange(preset: string, today: string, custom?: { from?: string; to?: string }): DateRange {
  switch (preset) {
    case 'today': return windows(preset, today, today, 'Today');
    case 'yesterday': { const y = shiftDay(today, -1); return windows(preset, y, y, 'Yesterday'); }
    case 'last-7': return windows(preset, shiftDay(today, -6), today, 'Last 7 days');
    case 'last-30': return windows(preset, shiftDay(today, -29), today, 'Last 30 days');
    case 'this-week': return windows(preset, shiftDay(today, -weekdayOf(today)), today, 'This week');
    case 'last-week': { const end = shiftDay(today, -weekdayOf(today) - 1); return windows(preset, shiftDay(end, -6), end, 'Last week'); }
    case 'this-month': return windows(preset, today.slice(0, 7) + '-01', today, 'This month');
    case 'last-month': { const end = shiftDay(today.slice(0, 7) + '-01', -1); return windows(preset, end.slice(0, 7) + '-01', end, 'Last month'); }
    case 'custom': {
      const from = custom?.from, to = custom?.to;
      if (!from || !to || !DAY_RE.test(from) || !DAY_RE.test(to)) return resolveRange('last-7', today);
      let [s, e] = from <= to ? [from, to] : [to, from];
      if (e > today) e = today;
      if (s > today) s = today;
      return windows('custom', s, e, `${fmtShort(s)} – ${fmtShort(e)}`);
    }
    default: return resolveRange('last-7', today);
  }
}

/** Read ?period=&from=&to= (mapping the legacy pill values 7/30/90). */
export function resolveFromParams(params: URLSearchParams, today = etDay(new Date())): DateRange {
  const legacy: Record<string, string> = { '7': 'last-7', '30': 'last-30', '90': 'last-30' };
  const raw = params.get('period') ?? 'last-7';
  const preset = legacy[raw] ?? raw;
  return resolveRange(preset, today, { from: params.get('from') ?? undefined, to: params.get('to') ?? undefined });
}
