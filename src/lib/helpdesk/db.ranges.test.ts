import { test, expect, describe } from 'vitest';
import {
  viewsByDayRange, topPagesRange, topCountriesRange, deviceSplitRange, referrersRange,
  hoursOfDayRange, viewsByChannelRange, entryPagesRange, ticketsPerDayRange, issueFunnelRange,
  campaignsRange, heatmapRange, channelsByDayRange, ticketHeatRange, medianFirstReplyHoursRange,
} from './db';

// Fake D1 in the repo's established style (see db.traffic.test.ts): prepare()
// finds a canned handler by matching a SQL fragment. Extended here to also
// capture each bind() call (sql + args) so the Range-variant tests below can
// assert that BOTH day bounds actually reach the query, not just that the
// query happens to return the right shape.
function fakeDb(handlers: { match: RegExp; rows?: any[]; first?: any }[]) {
  const calls: { sql: string; args: any[] }[] = [];
  const db = {
    prepare(sql: string) {
      const h = handlers.find(x => x.match.test(sql));
      return {
        bind(...args: any[]) { calls.push({ sql, args }); return this; },
        async all() { return { results: h?.rows ?? [] }; },
        async first() { return h?.first ?? null; },
      };
    },
    _calls: calls,
  } as any;
  return db;
}
const lastCall = (db: any) => db._calls[db._calls.length - 1];
const BOTH_BOUNDS = /day >= \? AND day <= \?/;

describe('viewsByDayRange', () => {
  test('binds both day bounds and returns rows', async () => {
    const db = fakeDb([{ match: /GROUP BY day/, rows: [{ day: '2026-07-03', views: 5 }] }]);
    const r = await viewsByDayRange(db, '2026-07-01', '2026-07-05');
    expect(r).toEqual([{ day: '2026-07-03', views: 5 }]);
    expect(lastCall(db).sql).toMatch(BOTH_BOUNDS);
    expect(lastCall(db).args).toEqual(['2026-07-01', '2026-07-05']);
  });
});

describe('topPagesRange', () => {
  test('binds both day bounds (+ limit) and returns rows', async () => {
    const db = fakeDb([{ match: /GROUP BY path/, rows: [{ path: '/', views: 9 }] }]);
    const r = await topPagesRange(db, '2026-07-01', '2026-07-05', 5);
    expect(r).toEqual([{ path: '/', views: 9 }]);
    expect(lastCall(db).sql).toMatch(BOTH_BOUNDS);
    expect(lastCall(db).args).toEqual(['2026-07-01', '2026-07-05', 5]);
  });
});

describe('topCountriesRange', () => {
  test('binds both day bounds and returns rows', async () => {
    const db = fakeDb([{ match: /GROUP BY country/, rows: [{ country: 'US', views: 12 }] }]);
    const r = await topCountriesRange(db, '2026-07-01', '2026-07-05');
    expect(r).toEqual([{ country: 'US', views: 12 }]);
    expect(lastCall(db).sql).toMatch(BOTH_BOUNDS);
    expect(lastCall(db).args).toEqual(['2026-07-01', '2026-07-05', 8]); // default limit
  });
});

describe('deviceSplitRange', () => {
  test('binds both day bounds and returns rows', async () => {
    const db = fakeDb([{ match: /GROUP BY device/, rows: [{ device: 'mobile', views: 7 }] }]);
    const r = await deviceSplitRange(db, '2026-07-01', '2026-07-05');
    expect(r).toEqual([{ device: 'mobile', views: 7 }]);
    expect(lastCall(db).sql).toMatch(BOTH_BOUNDS);
    expect(lastCall(db).args).toEqual(['2026-07-01', '2026-07-05']);
  });
});

describe('referrersRange', () => {
  test('binds both day bounds and returns rows', async () => {
    const db = fakeDb([{ match: /GROUP BY host/, rows: [{ host: 'google.com', views: 4 }] }]);
    const r = await referrersRange(db, '2026-07-01', '2026-07-05');
    expect(r).toEqual([{ host: 'google.com', views: 4 }]);
    expect(lastCall(db).sql).toMatch(BOTH_BOUNDS);
    expect(lastCall(db).args).toEqual(['2026-07-01', '2026-07-05', 8]); // default limit
  });
});

describe('hoursOfDayRange', () => {
  test('binds both day bounds and returns rows', async () => {
    const db = fakeDb([{ match: /GROUP BY hour/, rows: [{ hour: 14, views: 3 }] }]);
    const r = await hoursOfDayRange(db, '2026-07-01', '2026-07-05');
    expect(r).toEqual([{ hour: 14, views: 3 }]);
    expect(lastCall(db).sql).toMatch(BOTH_BOUNDS);
    expect(lastCall(db).args).toEqual(['2026-07-01', '2026-07-05']);
  });
});

describe('viewsByChannelRange', () => {
  test('binds both day bounds and classifies channels', async () => {
    const db = fakeDb([{ match: /GROUP BY referrer_host/, rows: [
      { host: '', n: 10 }, { host: 'www.google.com', n: 5 },
    ] }]);
    const r = await viewsByChannelRange(db, '2026-07-01', '2026-07-05');
    expect(r).toEqual([{ channel: 'Direct', views: 10 }, { channel: 'Search', views: 5 }]);
    expect(lastCall(db).sql).toMatch(BOTH_BOUNDS);
    expect(lastCall(db).args).toEqual(['2026-07-01', '2026-07-05']);
  });
});

describe('entryPagesRange', () => {
  test('binds both day bounds and returns external-referrer arrivals', async () => {
    const db = fakeDb([{ match: /referrer_host != ''/, rows: [{ path: '/', n: 3 }] }]);
    const r = await entryPagesRange(db, '2026-07-01', '2026-07-05');
    expect(r).toEqual([{ path: '/', n: 3 }]);
    expect(lastCall(db).sql).toMatch(BOTH_BOUNDS);
    expect(lastCall(db).args).toEqual(['2026-07-01', '2026-07-05', 8]); // default limit
  });
});

describe('ticketsPerDayRange', () => {
  test('buckets by ET day in JS and excludes tickets outside the window', async () => {
    const db = fakeDb([{ match: /SELECT created_at FROM tickets/, rows: [
      { created_at: '2026-07-04T15:00:00.000Z' }, // Jul 4 ET — inside window
      { created_at: '2026-07-04T18:00:00.000Z' }, // Jul 4 ET — inside window
      { created_at: '2026-07-06T02:30:00.000Z' }, // 10:30pm Jul 5 ET — inside window (edge case)
      { created_at: '2026-07-02T12:00:00.000Z' }, // Jul 2 ET — before window, excluded
      { created_at: '2026-07-07T12:00:00.000Z' }, // Jul 7 ET — after window, excluded
    ] }]);
    const r = await ticketsPerDayRange(db, '2026-07-03', '2026-07-05');
    expect(r).toEqual([
      { day: '2026-07-04', n: 2 },
      { day: '2026-07-05', n: 1 },
    ]);
  });
});

describe('issueFunnelRange', () => {
  test('computes views/tickets/rate over the window', async () => {
    const db = fakeDb([
      { match: /path = '\/report-issue\/'/, first: { c: 40 } },
      { match: /source = 'issue-form'/, rows: [
        { created_at: '2026-07-04T15:00:00.000Z' }, // inside
        { created_at: '2026-07-06T02:30:00.000Z' }, // inside (Jul 5 ET edge)
        { created_at: '2026-07-08T12:00:00.000Z' }, // outside
      ] },
    ]);
    const f = await issueFunnelRange(db, '2026-07-03', '2026-07-05');
    expect(f).toEqual({ views: 40, tickets: 2, rate: 5 });
  });
  test('rate null when views = 0', async () => {
    const db = fakeDb([
      { match: /report-issue/, first: { c: 0 } },
      { match: /issue-form/, rows: [] },
    ]);
    expect((await issueFunnelRange(db, '2026-07-03', '2026-07-05')).rate).toBeNull();
  });
});

describe('campaignsRange', () => {
  test('binds both day bounds + default limit, filters non-empty campaigns', async () => {
    const db = fakeDb([{ match: /GROUP BY campaign/, rows: [{ campaign: 'qr-sign', n: 6 }] }]);
    const r = await campaignsRange(db, '2026-07-01', '2026-07-05');
    expect(r).toEqual([{ campaign: 'qr-sign', n: 6 }]);
    expect(lastCall(db).sql).toMatch(BOTH_BOUNDS);
    expect(lastCall(db).sql).toMatch(/campaign IS NOT NULL AND campaign != ''/);
    expect(lastCall(db).args).toEqual(['2026-07-01', '2026-07-05', 8]); // default limit
  });
});

describe('heatmapRange', () => {
  test('binds both day bounds and returns day/hour/views rows', async () => {
    const db = fakeDb([{ match: /GROUP BY day, hour/, rows: [{ day: '2026-07-03', hour: 14, views: 5 }] }]);
    const r = await heatmapRange(db, '2026-07-01', '2026-07-05');
    expect(r).toEqual([{ day: '2026-07-03', hour: 14, views: 5 }]);
    expect(lastCall(db).sql).toMatch(BOTH_BOUNDS);
    expect(lastCall(db).args).toEqual(['2026-07-01', '2026-07-05']);
  });
});

describe('channelsByDayRange', () => {
  test('folds per-day referrer hosts into channel totals', async () => {
    const db = fakeDb([{ match: /GROUP BY day, referrer_host/, rows: [
      { day: '2026-07-01', referrer_host: 'www.google.com', views: 3 },
      { day: '2026-07-01', referrer_host: '', views: 7 },
      { day: '2026-07-02', referrer_host: 'www.google.com', views: 2 },
      { day: '2026-07-02', referrer_host: 'm.facebook.com', views: 4 },
    ] }]);
    const r = await channelsByDayRange(db, '2026-07-01', '2026-07-02');
    expect(r).toEqual([
      { day: '2026-07-01', Direct: 7, Search: 3, Social: 0, Referral: 0 },
      { day: '2026-07-02', Direct: 0, Search: 2, Social: 4, Referral: 0 },
    ]);
  });
});

describe('ticketHeatRange', () => {
  test('buckets tickets into ET {day, hour} and excludes rows outside the window', async () => {
    const db = fakeDb([{ match: /SELECT created_at FROM tickets/, rows: [
      { created_at: '2026-07-04T15:00:00.000Z' }, // Jul 4 ET, 11am — inside
      { created_at: '2026-07-04T15:00:00.000Z' }, // same bucket again → n=2
      { created_at: '2026-07-06T02:30:00.000Z' }, // 10:30pm Jul 5 ET — inside (edge case)
      { created_at: '2026-07-02T12:00:00.000Z' }, // Jul 2 ET — before window, excluded
      { created_at: '2026-07-07T12:00:00.000Z' }, // Jul 7 ET — after window, excluded
    ] }]);
    const r = await ticketHeatRange(db, '2026-07-03', '2026-07-05');
    expect(r).toEqual([
      { day: '2026-07-04', hour: 11, n: 2 },
      { day: '2026-07-05', hour: 22, n: 1 },
    ]);
  });
});

describe('medianFirstReplyHoursRange', () => {
  test('returns median hours across tickets replied within the window', async () => {
    const db = fakeDb([{ match: /firsts/, rows: [
      { created_at: '2026-07-04T10:00:00.000Z', fin: '2026-07-04T10:00:00.000Z', fout: '2026-07-04T11:00:00.000Z' }, // 1h — inside
      { created_at: '2026-07-04T10:00:00.000Z', fin: '2026-07-04T10:00:00.000Z', fout: '2026-07-04T13:00:00.000Z' }, // 3h — inside
      { created_at: '2026-07-06T02:30:00.000Z', fin: '2026-07-06T02:30:00.000Z', fout: '2026-07-06T07:30:00.000Z' }, // 5h, Jul 5 ET edge — inside
      { created_at: '2026-07-02T10:00:00.000Z', fin: '2026-07-02T10:00:00.000Z', fout: '2026-07-02T11:00:00.000Z' }, // before window, excluded (would drag median to 2h if wrongly included)
    ] }]);
    expect(await medianFirstReplyHoursRange(db, '2026-07-03', '2026-07-05')).toBe(3);
  });
  test('returns null when no replied tickets in window', async () => {
    const db = fakeDb([{ match: /firsts/, rows: [] }]);
    expect(await medianFirstReplyHoursRange(db, '2026-07-03', '2026-07-05')).toBeNull();
  });
});
