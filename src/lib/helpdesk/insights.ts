import { fmtDuration } from './fmt';

export interface Insight { emoji: string; text: string; }

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const label12 = (h: number) => (h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`);
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Deterministic, threshold-gated callouts (max 2). Quiet by default: sparse or
 * unremarkable data yields []. All inputs are plain aggregates the pages already
 * know how to fetch; no I/O here. */
export function computeInsights(input: {
  todayViews: number;
  currentHour: number;            // ET, 0-23
  weekday: number;                // ET, 0=Sunday
  yesterdayByHour: number[];      // 24 buckets
  sameWeekdayTotals: number[];    // full-day totals of the last few same weekdays
  weekTickets: number;
  priorWeeksTickets: number[];    // totals of prior full weeks
  medianReplyHours: number | null;
  prevMedianReplyHours: number | null;
}): Insight[] {
  const out: Insight[] = [];
  const { todayViews, currentHour } = input;

  if (currentHour < 18) {
    const pace = input.yesterdayByHour.slice(0, currentHour + 1).reduce((a, b) => a + b, 0);
    if (todayViews >= 5 && pace >= 5) {
      const r = todayViews / pace;
      if (r >= 1.5) out.push({ emoji: '🔥', text: `Today is ahead of yesterday's pace (${todayViews} vs ${pace} by ${label12(currentHour)})` });
      else if (r <= 0.5) out.push({ emoji: '🌙', text: `Quieter than yesterday so far (${todayViews} vs ${pace} by ${label12(currentHour)})` });
    }
  } else {
    const typical = median(input.sameWeekdayTotals);
    if (todayViews >= 5 && typical >= 5) {
      const r = todayViews / typical;
      if (r >= 1.5) out.push({ emoji: '🔥', text: `Today is ${(Math.round(r * 10) / 10)}× your typical ${WEEKDAYS[input.weekday]} (${todayViews} vs ~${Math.round(typical)})` });
      else if (r <= 0.5) out.push({ emoji: '🌙', text: `Quieter than a typical ${WEEKDAYS[input.weekday]} (${todayViews} vs ~${Math.round(typical)})` });
    }
  }

  const typicalTickets = median(input.priorWeeksTickets);
  if (input.weekTickets >= typicalTickets + 2) {
    out.push({ emoji: '⚠️', text: `${input.weekTickets} machine issues this week — typical is ${Math.round(typicalTickets)}` });
  }

  const { medianReplyHours: cur, prevMedianReplyHours: prev } = input;
  if (cur !== null && prev !== null && prev >= 0.5 && prev >= 2 * cur) {
    out.push({ emoji: '⚡', text: `Median reply ${fmtDuration(cur)} — down from ${fmtDuration(prev)}` });
  }

  return out.slice(0, 2);
}
