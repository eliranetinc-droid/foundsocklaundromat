import { test, expect, describe } from 'vitest';
import { referrers, hoursOfDay, viewsInRange } from './db';

function fakeDb(handlers: { match: RegExp; rows?: any[]; first?: any }[]) {
  return {
    prepare(sql: string) {
      const h = handlers.find(x => x.match.test(sql));
      return { bind() { return this; }, async all() { return { results: h?.rows ?? [] }; }, async first() { return h?.first ?? null; } };
    },
  } as any;
}

describe('referrers', () => {
  test('returns host/views rows', async () => {
    const db = fakeDb([{ match: /referrer_host/, rows: [{ host: 'google.com', views: 5 }, { host: '—', views: 3 }] }]);
    const r = await referrers(db, 30);
    expect(r).toEqual([{ host: 'google.com', views: 5 }, { host: '—', views: 3 }]);
  });
});

describe('hoursOfDay', () => {
  test('returns hour/views rows', async () => {
    const db = fakeDb([{ match: /GROUP BY hour/, rows: [{ hour: 9, views: 4 }, { hour: 20, views: 7 }] }]);
    expect(await hoursOfDay(db, 30)).toEqual([{ hour: 9, views: 4 }, { hour: 20, views: 7 }]);
  });
});

describe('viewsInRange', () => {
  test('returns the count', async () => {
    expect(await viewsInRange(fakeDb([{ match: /COUNT\(\*\) AS c FROM pageviews/, first: { c: 42 } }]), '2026-06-01', '2026-06-30')).toBe(42);
  });
  test('returns 0 when null', async () => {
    expect(await viewsInRange(fakeDb([{ match: /pageviews/, first: null }]), 'a', 'b')).toBe(0);
  });
});
