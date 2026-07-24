import { test, expect, describe } from 'vitest';
import { computeInsights } from './insights';

describe('computeInsights — pace rule, before 18:00 (vs yesterday-to-hour)', () => {
  test('fires 🔥 when ratio >= 1.5 and both sides >= 5, with a by-Npm label', () => {
    const result = computeInsights({
      todayViews: 15,
      currentHour: 15, // 3pm ET
      weekday: 3,
      yesterdayByHour: [10, ...Array(23).fill(0)], // sum(hours 0..15) = 10
      sameWeekdayTotals: [],
      weekTickets: 0,
      priorWeeksTickets: [],
      medianReplyHours: null,
      prevMedianReplyHours: null,
    });
    expect(result).toEqual([
      { emoji: '🔥', text: "Today is ahead of yesterday's pace (15 vs 10 by 3pm)" },
    ]);
  });

  test('fires 🌙 when ratio <= 0.5 and both sides >= 5', () => {
    const result = computeInsights({
      todayViews: 5,
      currentHour: 15,
      weekday: 3,
      yesterdayByHour: [10, ...Array(23).fill(0)],
      sameWeekdayTotals: [],
      weekTickets: 0,
      priorWeeksTickets: [],
      medianReplyHours: null,
      prevMedianReplyHours: null,
    });
    expect(result).toEqual([
      { emoji: '🌙', text: 'Quieter than yesterday so far (5 vs 10 by 3pm)' },
    ]);
  });

  test('suppressed when yesterday-to-hour pace is under 5, even at an extreme ratio', () => {
    const result = computeInsights({
      todayViews: 100,
      currentHour: 15,
      weekday: 3,
      yesterdayByHour: [3, ...Array(23).fill(0)], // pace = 3 < 5
      sameWeekdayTotals: [],
      weekTickets: 0,
      priorWeeksTickets: [],
      medianReplyHours: null,
      prevMedianReplyHours: null,
    });
    expect(result).toEqual([]);
  });

  test('suppressed when today views are under 5, even at an extreme ratio', () => {
    const result = computeInsights({
      todayViews: 2,
      currentHour: 15,
      weekday: 3,
      yesterdayByHour: [100, ...Array(23).fill(0)], // pace = 100 >= 5
      sameWeekdayTotals: [],
      weekTickets: 0,
      priorWeeksTickets: [],
      medianReplyHours: null,
      prevMedianReplyHours: null,
    });
    expect(result).toEqual([]);
  });
});

describe('computeInsights — pace rule, at/after 18:00 (vs median same-weekday total)', () => {
  test('fires 🔥 with the weekday name and one-decimal × rounding (2.4×)', () => {
    const result = computeInsights({
      todayViews: 24,
      currentHour: 18, // exactly 6pm ET — the "at" boundary
      weekday: 3, // Wednesday
      yesterdayByHour: Array(24).fill(0), // unused in this branch
      sameWeekdayTotals: [8, 10, 12], // median = 10
      weekTickets: 0,
      priorWeeksTickets: [],
      medianReplyHours: null,
      prevMedianReplyHours: null,
    });
    expect(result).toEqual([
      { emoji: '🔥', text: 'Today is 2.4× your typical Wednesday (24 vs ~10)' },
    ]);
  });

  test('fires 🌙 when ratio <= 0.5, with the weekday name', () => {
    const result = computeInsights({
      todayViews: 5,
      currentHour: 19,
      weekday: 3,
      yesterdayByHour: Array(24).fill(0),
      sameWeekdayTotals: [8, 10, 12], // median = 10
      weekTickets: 0,
      priorWeeksTickets: [],
      medianReplyHours: null,
      prevMedianReplyHours: null,
    });
    expect(result).toEqual([
      { emoji: '🌙', text: 'Quieter than a typical Wednesday (5 vs ~10)' },
    ]);
  });

  test('suppressed when the typical-weekday median is under 5, even at an extreme ratio', () => {
    const result = computeInsights({
      todayViews: 100,
      currentHour: 19,
      weekday: 3,
      yesterdayByHour: Array(24).fill(0),
      sameWeekdayTotals: [1, 2, 3], // median = 2 < 5
      weekTickets: 0,
      priorWeeksTickets: [],
      medianReplyHours: null,
      prevMedianReplyHours: null,
    });
    expect(result).toEqual([]);
  });

  test('suppressed when today views are under 5, even against a strong typical median', () => {
    const result = computeInsights({
      todayViews: 4,
      currentHour: 19,
      weekday: 3,
      yesterdayByHour: Array(24).fill(0),
      sameWeekdayTotals: [50, 60, 70], // median = 60 >= 5, ratio extreme low
      weekTickets: 0,
      priorWeeksTickets: [],
      medianReplyHours: null,
      prevMedianReplyHours: null,
    });
    expect(result).toEqual([]);
  });
});

describe('computeInsights — tickets rule (issue spikes)', () => {
  test('fires ⚠️ exactly at threshold: weekTickets >= median(priorWeeksTickets) + 2', () => {
    const result = computeInsights({
      todayViews: 0,
      currentHour: 15,
      weekday: 3,
      yesterdayByHour: Array(24).fill(0),
      sameWeekdayTotals: [],
      weekTickets: 7,
      priorWeeksTickets: [3, 5, 7], // median = 5; threshold = 7
      medianReplyHours: null,
      prevMedianReplyHours: null,
    });
    expect(result).toEqual([
      { emoji: '⚠️', text: '7 machine issues this week — typical is 5' },
    ]);
  });

  test('suppressed one ticket below threshold', () => {
    const result = computeInsights({
      todayViews: 0,
      currentHour: 15,
      weekday: 3,
      yesterdayByHour: Array(24).fill(0),
      sameWeekdayTotals: [],
      weekTickets: 6,
      priorWeeksTickets: [3, 5, 7], // median = 5; threshold = 7
      medianReplyHours: null,
      prevMedianReplyHours: null,
    });
    expect(result).toEqual([]);
  });

  test('median of an empty priorWeeksTickets array is 0, so 2 tickets fires (pinned intentional behavior)', () => {
    const result = computeInsights({
      todayViews: 0,
      currentHour: 15,
      weekday: 3,
      yesterdayByHour: Array(24).fill(0),
      sameWeekdayTotals: [],
      weekTickets: 2,
      priorWeeksTickets: [],
      medianReplyHours: null,
      prevMedianReplyHours: null,
    });
    expect(result).toEqual([
      { emoji: '⚠️', text: '2 machine issues this week — typical is 0' },
    ]);
  });
});

describe('computeInsights — reply rule (median first-reply time)', () => {
  test('fires ⚡ when prev >= 0.5h and prev >= 2x current; text uses fmtDuration', () => {
    const result = computeInsights({
      todayViews: 0,
      currentHour: 15,
      weekday: 3,
      yesterdayByHour: Array(24).fill(0),
      sameWeekdayTotals: [],
      weekTickets: 0,
      priorWeeksTickets: [],
      medianReplyHours: 0.2, // fmtDuration -> '12m'
      prevMedianReplyHours: 2.1, // fmtDuration -> '2h 6m'
    });
    expect(result).toEqual([
      { emoji: '⚡', text: 'Median reply 12m — down from 2h 6m' },
    ]);
  });

  test('suppressed when prev is under 0.5h, even with a huge ratio', () => {
    const result = computeInsights({
      todayViews: 0,
      currentHour: 15,
      weekday: 3,
      yesterdayByHour: Array(24).fill(0),
      sameWeekdayTotals: [],
      weekTickets: 0,
      priorWeeksTickets: [],
      medianReplyHours: 0.05,
      prevMedianReplyHours: 0.4, // < 0.5h
    });
    expect(result).toEqual([]);
  });

  test('suppressed when the improvement is under 2x', () => {
    const result = computeInsights({
      todayViews: 0,
      currentHour: 15,
      weekday: 3,
      yesterdayByHour: Array(24).fill(0),
      sameWeekdayTotals: [],
      weekTickets: 0,
      priorWeeksTickets: [],
      medianReplyHours: 1,
      prevMedianReplyHours: 1.5, // 1.5 < 2 * 1
    });
    expect(result).toEqual([]);
  });

  test('suppressed when either median is null', () => {
    const base = {
      todayViews: 0,
      currentHour: 15,
      weekday: 3,
      yesterdayByHour: Array(24).fill(0),
      sameWeekdayTotals: [] as number[],
      weekTickets: 0,
      priorWeeksTickets: [] as number[],
    };
    expect(computeInsights({ ...base, medianReplyHours: null, prevMedianReplyHours: 5 })).toEqual([]);
    expect(computeInsights({ ...base, medianReplyHours: 1, prevMedianReplyHours: null })).toEqual([]);
  });
});

describe('computeInsights — cap and priority', () => {
  test('all three rules firing yields exactly 2: pace first, tickets second, reply dropped', () => {
    const result = computeInsights({
      todayViews: 20,
      currentHour: 15,
      weekday: 3,
      yesterdayByHour: [10, ...Array(23).fill(0)], // pace = 10, ratio 2.0 -> fires 🔥
      sameWeekdayTotals: [],
      weekTickets: 7,
      priorWeeksTickets: [3, 5, 7], // median 5, threshold 7 -> fires ⚠️
      medianReplyHours: 0.2,
      prevMedianReplyHours: 2.1, // would fire ⚡ on its own
    });
    expect(result).toEqual([
      { emoji: '🔥', text: "Today is ahead of yesterday's pace (20 vs 10 by 3pm)" },
      { emoji: '⚠️', text: '7 machine issues this week — typical is 5' },
    ]);
    expect(result).toHaveLength(2);
    expect(result.some((i) => i.emoji === '⚡')).toBe(false);
  });
});

describe('computeInsights — quiet default', () => {
  test('sparse/unremarkable input produces no noise', () => {
    const result = computeInsights({
      todayViews: 3, // under 5 -> pace suppressed
      currentHour: 15,
      weekday: 3,
      yesterdayByHour: [4, ...Array(23).fill(0)], // pace = 4, also under 5
      sameWeekdayTotals: [6, 7, 8],
      weekTickets: 2,
      priorWeeksTickets: [2, 3, 1], // median 2, threshold 4 -> 2 < 4, suppressed
      medianReplyHours: null,
      prevMedianReplyHours: null,
    });
    expect(result).toEqual([]);
  });
});
