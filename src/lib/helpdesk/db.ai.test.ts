import { test, expect, describe } from 'vitest';
import { getSetting, recentOutboundPairs } from './db';

function fakeDb(handlers: { match: RegExp; rows?: any[]; first?: any }[]) {
  return {
    prepare(sql: string) {
      const h = handlers.find(x => x.match.test(sql));
      return { bind() { return this; }, async all() { return { results: h?.rows ?? [] }; }, async first() { return h?.first ?? null; } };
    },
  } as any;
}

describe('getSetting', () => {
  test('returns stored value', async () => {
    const db = fakeDb([{ match: /FROM settings/, first: { value: 'hello rules' } }]);
    expect(await getSetting(db, 'house_rules')).toBe('hello rules');
  });
  test('returns null when absent', async () => {
    expect(await getSetting(fakeDb([{ match: /FROM settings/, first: null }]), 'x')).toBeNull();
  });
});

describe('recentOutboundPairs', () => {
  test('maps rows to {inbound, outbound}', async () => {
    const db = fakeDb([{ match: /direction='outbound'/, rows: [
      { inbound: 'is it open?', outbound: 'Yes, 6am to 11pm daily.' },
    ] }]);
    const pairs = await recentOutboundPairs(db, 50);
    expect(pairs).toEqual([{ inbound: 'is it open?', outbound: 'Yes, 6am to 11pm daily.' }]);
  });
});
