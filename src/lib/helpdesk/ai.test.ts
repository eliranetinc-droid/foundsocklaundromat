import { test, expect, describe, vi, afterEach } from 'vitest';
import { draftReply } from './ai';

afterEach(() => vi.restoreAllMocks());

const KEY = { ANTHROPIC_API_KEY: 'sk-test' } as any;

describe('draftReply', () => {
  test('returns the model text on success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: 'Sorry about that!' }] }), { status: 200 })));
    expect(await draftReply(KEY, { system: 's', user: 'u' })).toBe('Sorry about that!');
  });
  test('returns null when the model says SKIP', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: 'SKIP' }] }), { status: 200 })));
    expect(await draftReply(KEY, { system: 's', user: 'u' })).toBeNull();
  });
  test('returns null on API error (never throws)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    expect(await draftReply(KEY, { system: 's', user: 'u' })).toBeNull();
  });
  test('returns null when no key configured', async () => {
    expect(await draftReply({} as any, { system: 's', user: 'u' })).toBeNull();
  });
});
