import { test, expect, describe } from 'vitest';
import {
  viewsByDayRange, topPagesRange, topCountriesRange, deviceSplitRange, referrersRange,
  hoursOfDayRange, viewsByChannelRange, entryPagesRange, ticketsPerDayRange, issueFunnelRange,
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
