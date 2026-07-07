import { test, expect, describe } from 'vitest';
import { ticketsByMachine, aiDraftStats, resolutionStats, sourceSplit } from './db';

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

describe('ticketsByMachine', () => {
  test('returns machine/count rows', async () => {
    const db = fakeDb([{ match: /machine_type IS NOT NULL/, rows: [
      { machine: 'Washer #7', n: 4 }, { machine: 'Dryer #3', n: 2 },
    ] }]);
    const r = await ticketsByMachine(db, 90);
    expect(r[0]).toEqual({ machine: 'Washer #7', n: 4 });
  });
});

describe('aiDraftStats', () => {
  test('maps status counts with zero defaults', async () => {
    const db = fakeDb([{ match: /FROM ai_drafts/, rows: [
      { status: 'sent_as_is', n: 3 }, { status: 'used', n: 2 }, { status: 'dismissed', n: 1 },
    ] }]);
    const s = await aiDraftStats(db, 30);
    expect(s).toEqual({ suggested: 0, used: 2, sent_as_is: 3, dismissed: 1, superseded: 0 });
  });
});

describe('resolutionStats', () => {
  test('median close hours + pct within 24h from closed pairs', async () => {
    const db = fakeDb([
      { match: /closed_at IS NOT NULL/, rows: [
        { created_at: '2026-07-01T00:00:00.000Z', closed_at: '2026-07-01T02:00:00.000Z' },   // 2h
        { created_at: '2026-07-01T00:00:00.000Z', closed_at: '2026-07-01T10:00:00.000Z' },   // 10h
        { created_at: '2026-07-01T00:00:00.000Z', closed_at: '2026-07-03T00:00:00.000Z' },   // 48h
      ] },
      { match: /status = 'open' ORDER BY created_at ASC/, first: { created_at: '2026-07-05T00:00:00.000Z' } },
    ]);
    const r = await resolutionStats(db, 90);
    expect(r.medianCloseHours).toBe(10);
    expect(r.closedCount).toBe(3);
    expect(r.pctWithin24h).toBe(67); // 2 of 3
    expect(r.oldestOpenCreatedAt).toBe('2026-07-05T00:00:00.000Z');
  });
  test('nulls when nothing closed', async () => {
    const db = fakeDb([{ match: /closed_at IS NOT NULL/, rows: [] }, { match: /status = 'open'/, first: null }]);
    const r = await resolutionStats(db, 90);
    expect(r.medianCloseHours).toBeNull();
    expect(r.closedCount).toBe(0);
    expect(r.oldestOpenCreatedAt).toBeNull();
  });
});

describe('sourceSplit', () => {
  test('returns source/count rows', async () => {
    const db = fakeDb([{ match: /GROUP BY source/, rows: [{ source: 'issue-form', n: 5 }, { source: 'email', n: 2 }] }]);
    expect(await sourceSplit(db, 30)).toEqual([{ source: 'issue-form', n: 5 }, { source: 'email', n: 2 }]);
  });
});
