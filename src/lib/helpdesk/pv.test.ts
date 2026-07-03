import { test, expect, describe } from 'vitest';
import { isBotUA, classifyDevice, referrerHost, isValidPath } from './pv';

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
