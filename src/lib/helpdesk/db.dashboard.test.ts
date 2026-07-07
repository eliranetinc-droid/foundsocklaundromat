import { test, expect, describe } from 'vitest';
import { medianFirstReplyHours, ticketsPerDay, needsAttention } from './db';

// Minimal fake D1: prepare().bind().all()/first() returning canned rows keyed by SQL fragments.
function fakeDb(handlers: { match: RegExp; rows?: any[]; first?: any }[]) {
  return {
    prepare(sql: string) {
      const h = handlers.find(x => x.match.test(sql));
      return {
        bind() { return this; },
        async all() { return { results: h?.rows ?? [] }; },
        async first() { return h?.first ?? null; },
      };
    },
  } as any;
}

describe('medianFirstReplyHours', () => {
  test('returns median hours across tickets with a reply', async () => {
    // three tickets: 1h, 3h, 5h → median 3
    const db = fakeDb([{ match: /firsts/, rows: [
      { fin: '2026-07-01T10:00:00.000Z', fout: '2026-07-01T11:00:00.000Z' }, // 1h
      { fin: '2026-07-01T10:00:00.000Z', fout: '2026-07-01T13:00:00.000Z' }, // 3h
      { fin: '2026-07-01T10:00:00.000Z', fout: '2026-07-01T15:00:00.000Z' }, // 5h
    ] }]);
    expect(await medianFirstReplyHours(db, 30)).toBe(3);
  });
  test('returns null when no replied tickets', async () => {
    expect(await medianFirstReplyHours(fakeDb([{ match: /firsts/, rows: [] }]), 30)).toBeNull();
  });
});

describe('ticketsPerDay', () => {
  test('returns day/count rows', async () => {
    const db = fakeDb([{ match: /GROUP BY day/, rows: [{ day: '2026-07-01', n: 2 }] }]);
    expect(await ticketsPerDay(db, 14)).toEqual([{ day: '2026-07-01', n: 2 }]);
  });
});

describe('needsAttention', () => {
  test('returns the open+stale rows the query yields', async () => {
    const db = fakeDb([{ match: /status = 'open'/, rows: [{ id: 't1', public_id: 'FS-AAAAA', subject: 's', customer_name: 'J', unread: 1, last_activity_at: '2026-07-01T00:00:00.000Z' }] }]);
    const r = await needsAttention(db);
    expect(r).toHaveLength(1);
    expect(r[0].public_id).toBe('FS-AAAAA');
  });
});
