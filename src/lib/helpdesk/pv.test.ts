import { test, expect, describe } from 'vitest';
import { isBotUA, classifyDevice, referrerHost, isValidPath, etDay, etDayHour, channelOf } from './pv';

describe('isBotUA', () => {
  test('flags bots and empty UA', () => {
    expect(isBotUA('Mozilla/5.0 (compatible; Googlebot/2.1)')).toBe(true);
    expect(isBotUA('Chrome-Lighthouse')).toBe(true);
    expect(isBotUA('')).toBe(true);
    expect(isBotUA(null)).toBe(true);
  });
  test('passes real browsers', () => {
    expect(isBotUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1')).toBe(false);
  });
});

describe('classifyDevice', () => {
  test('mobile vs desktop', () => {
    expect(classifyDevice('Mozilla/5.0 (iPhone...) Mobile/15E148')).toBe('mobile');
    expect(classifyDevice('Mozilla/5.0 (Linux; Android 14)')).toBe('mobile');
    expect(classifyDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X)')).toBe('desktop');
  });
});

describe('referrerHost', () => {
  test('external host kept, self and junk dropped', () => {
    expect(referrerHost('https://www.google.com/search?q=x', 'www.foundsocklaundromat.com')).toBe('www.google.com');
    expect(referrerHost('https://www.foundsocklaundromat.com/pricing/', 'www.foundsocklaundromat.com')).toBe('');
    expect(referrerHost('not a url', 'www.foundsocklaundromat.com')).toBe('');
    expect(referrerHost('', 'www.foundsocklaundromat.com')).toBe('');
  });
});

describe('isValidPath', () => {
  test('accepts normal site paths', () => {
    expect(isValidPath('/')).toBe(true);
    expect(isValidPath('/blog/how-to-wash-a-comforter/')).toBe(true);
  });
  test('rejects admin, api, junk', () => {
    expect(isValidPath('/admin')).toBe(false);
    expect(isValidPath('/admin/tickets')).toBe(false);
    expect(isValidPath('/api/pv')).toBe(false);
    expect(isValidPath('nope')).toBe(false);
    expect(isValidPath('/' + 'x'.repeat(200))).toBe(false);
  });
});

describe('etDay / etDayHour', () => {
  test('late-evening ET stays on the ET calendar day, not UTC', () => {
    // 2026-07-07T02:30:00Z is 2026-07-06 22:30 EDT
    expect(etDay(new Date('2026-07-07T02:30:00.000Z'))).toBe('2026-07-06');
    const r = etDayHour(new Date('2026-07-07T02:30:00.000Z'));
    expect(r.day).toBe('2026-07-06');
    expect(r.hour).toBe(22);
  });
  test('midday UTC → same ET day, noon hour', () => {
    const r = etDayHour(new Date('2026-07-01T16:00:00.000Z')); // 12:00 EDT
    expect(r.day).toBe('2026-07-01');
    expect(r.hour).toBe(12);
  });
});

describe('channelOf', () => {
  test('classifies referrer hosts', () => {
    expect(channelOf('')).toBe('Direct');
    expect(channelOf('—')).toBe('Direct');
    expect(channelOf('www.google.com')).toBe('Search');
    expect(channelOf('bing.com')).toBe('Search');
    expect(channelOf('duckduckgo.com')).toBe('Search');
    expect(channelOf('m.facebook.com')).toBe('Social');
    expect(channelOf('instagram.com')).toBe('Social');
    expect(channelOf('t.co')).toBe('Social');
    expect(channelOf('www.reddit.com')).toBe('Social');
    expect(channelOf('somelocalblog.com')).toBe('Referral');
  });
});
