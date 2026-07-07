import { test, expect, describe } from 'vitest';
import { listPushSubscriptions, upsertPushSubscription, removePushSubscription, disablePushSubscription } from './db';

function fakeDb(handlers: { match: RegExp; rows?: any[]; first?: any }[]) {
  const calls: string[] = [];
  const db = {
    prepare(sql: string) {
      calls.push(sql);
      const h = handlers.find(x => x.match.test(sql));
      return { bind() { return this; }, async all() { return { results: h?.rows ?? [] }; }, async first() { return h?.first ?? null; }, async run() { return {}; } };
    },
    _calls: calls,
  } as any;
  return db;
}

describe('listPushSubscriptions', () => {
  test('returns enabled subscription rows', async () => {
    const db = fakeDb([{ match: /disabled = 0/, rows: [{ endpoint: 'https://push.example/e1', p256dh: 'pk', auth: 'a' }] }]);
    const r = await listPushSubscriptions(db);
    expect(r).toHaveLength(1);
    expect(r[0].endpoint).toBe('https://push.example/e1');
  });
});

describe('upsertPushSubscription', () => {
  test('runs an upsert keyed on endpoint', async () => {
    const db = fakeDb([{ match: /ON CONFLICT\(endpoint\)/ }]);
    await upsertPushSubscription(db, { endpoint: 'e', p256dh: 'p', auth: 'a' });
    expect(db._calls.some((c: string) => /ON CONFLICT\(endpoint\)/.test(c))).toBe(true);
  });
});

describe('removePushSubscription / disablePushSubscription', () => {
  test('issue DELETE and UPDATE respectively', async () => {
    const db = fakeDb([{ match: /DELETE FROM push_subscriptions/ }, { match: /SET disabled = 1/ }]);
    await removePushSubscription(db, 'e');
    await disablePushSubscription(db, 'e');
    expect(db._calls.some((c: string) => /DELETE FROM push_subscriptions/.test(c))).toBe(true);
    expect(db._calls.some((c: string) => /SET disabled = 1/.test(c))).toBe(true);
  });
});
