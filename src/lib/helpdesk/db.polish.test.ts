import { test, expect, describe } from 'vitest';
import { recentPageviews, countRecentViewers } from './db';

function fakeDb(handlers: { match: RegExp; rows?: any[]; first?: any }[]) {
  return {
    prepare(sql: string) {
      const h = handlers.find(x => x.match.test(sql));
      return { bind() { return this; }, async all() { return { results: h?.rows ?? [] }; }, async first() { return h?.first ?? null; } };
    },
  } as any;
}

describe('recentPageviews', () => {
  test('returns the recent rows ordered as the query yields', async () => {
    const db = fakeDb([{ match: /ORDER BY id DESC/, rows: [
      { ts: '2026-07-07T14:00:00.000Z', path: '/', referrer_host: 'google.com', country: 'US', device: 'mobile' },
    ] }]);
    const r = await recentPageviews(db, 20);
    expect(r).toHaveLength(1);
    expect(r[0].path).toBe('/');
    expect(r[0].device).toBe('mobile');
  });
});

describe('countRecentViewers', () => {
  test('returns the count', async () => {
    expect(await countRecentViewers(fakeDb([{ match: /ts >= \?/, first: { c: 3 } }]), 5)).toBe(3);
  });
  test('returns 0 when null', async () => {
    expect(await countRecentViewers(fakeDb([{ match: /pageviews/, first: null }]))).toBe(0);
  });
});
