import { test, expect, describe } from 'vitest';
import { viewsByChannel, entryPages, issueFunnel } from './db';

function fakeDb(handlers: { match: RegExp; rows?: any[]; first?: any }[]) {
  return {
    prepare(sql: string) {
      const h = handlers.find(x => x.match.test(sql));
      return { bind() { return this; }, async all() { return { results: h?.rows ?? [] }; }, async first() { return h?.first ?? null; } };
    },
  } as any;
}

describe('viewsByChannel', () => {
  test('classifies and aggregates', async () => {
    const db = fakeDb([{ match: /GROUP BY referrer_host/, rows: [
      { host: '', n: 10 }, { host: 'www.google.com', n: 5 }, { host: 'facebook.com', n: 2 }, { host: 'blog.example', n: 1 },
    ] }]);
    const r = await viewsByChannel(db, 30);
    expect(r).toEqual([
      { channel: 'Direct', views: 10 },
      { channel: 'Search', views: 5 },
      { channel: 'Social', views: 2 },
      { channel: 'Referral', views: 1 },
    ]);
  });
});

describe('entryPages', () => {
  test('returns external-referrer arrivals by path', async () => {
    const db = fakeDb([{ match: /referrer_host != ''/, rows: [{ path: '/', n: 6 }, { path: '/pricing/', n: 2 }] }]);
    expect(await entryPages(db, 30)).toEqual([{ path: '/', n: 6 }, { path: '/pricing/', n: 2 }]);
  });
});

describe('issueFunnel', () => {
  test('computes views→tickets rate', async () => {
    const db = fakeDb([
      { match: /path = '\/report-issue\/'/, first: { c: 40 } },
      { match: /source = 'issue-form'/, first: { c: 6 } },
    ]);
    const f = await issueFunnel(db, 30);
    expect(f).toEqual({ views: 40, tickets: 6, rate: 15 });
  });
  test('rate null when no views', async () => {
    const db = fakeDb([{ match: /report-issue/, first: { c: 0 } }, { match: /issue-form/, first: { c: 0 } }]);
    expect((await issueFunnel(db, 30)).rate).toBeNull();
  });
});
