import { test, expect, describe } from 'vitest';
import { ticketsByEmail, ticketCountsByEmail } from './db';

function fakeDb(handlers: { match: RegExp; rows?: any[]; first?: any }[]) {
  return {
    prepare(sql: string) {
      const h = handlers.find(x => x.match.test(sql));
      return { bind() { return this; }, async all() { return { results: h?.rows ?? [] }; }, async first() { return h?.first ?? null; } };
    },
  } as any;
}

describe('ticketsByEmail', () => {
  test('returns the other tickets for the email', async () => {
    const db = fakeDb([{ match: /customer_email = \? COLLATE NOCASE AND id != \?/, rows: [
      { id: 't2', public_id: 'FS-BBBBB', subject: 'Dryer #3', status: 'closed', created_at: '2026-07-01T00:00:00.000Z' },
    ] }]);
    const r = await ticketsByEmail(db, 'a@b.com', 't1');
    expect(r).toHaveLength(1);
    expect(r[0].public_id).toBe('FS-BBBBB');
    expect(r[0].status).toBe('closed');
  });
});

describe('ticketCountsByEmail', () => {
  test('maps lowercased email to count', async () => {
    const db = fakeDb([{ match: /GROUP BY LOWER\(customer_email\)/, rows: [
      { email: 'a@b.com', n: 3 }, { email: 'c@d.com', n: 1 },
    ] }]);
    const m = await ticketCountsByEmail(db);
    expect(m.get('a@b.com')).toBe(3);
    expect(m.get('c@d.com')).toBe(1);
    expect(m.get('missing@x.com')).toBeUndefined();
  });
});
