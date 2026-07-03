import { test, expect, describe } from 'vitest';
import { parsePlusToken, parseSubjectPublicId, isAutoEmail, stripQuotedReply, htmlToText } from './email-match';

describe('parsePlusToken', () => {
  test('finds token in any recipient, case-insensitive', () => {
    expect(parsePlusToken(['support+tabc23defgh@foundsocklaundromat.com'])).toBe('tabc23defgh');
    expect(parsePlusToken(['x@y.com', 'Support+Tabc23defgh@FoundSockLaundromat.com'])).toBe('tabc23defgh');
  });
  test('null when absent or malformed', () => {
    expect(parsePlusToken(['support@foundsocklaundromat.com'])).toBeNull();
    expect(parsePlusToken(['support+bad token@foundsocklaundromat.com'])).toBeNull();
    expect(parsePlusToken([])).toBeNull();
  });
});

describe('parseSubjectPublicId', () => {
  test('extracts [FS-XXXXX]', () => {
    expect(parseSubjectPublicId('Re: We got your report [FS-7K2QX]')).toBe('FS-7K2QX');
  });
  test('null when absent', () => {
    expect(parseSubjectPublicId('hello there')).toBeNull();
    expect(parseSubjectPublicId('')).toBeNull();
  });
});

describe('isAutoEmail', () => {
  test('flags auto-submitted and daemon senders', () => {
    expect(isAutoEmail({ from: 'a@b.com', autoSubmitted: 'auto-replied' })).toBe(true);
    expect(isAutoEmail({ from: 'MAILER-DAEMON@mx.example.com', autoSubmitted: null })).toBe(true);
    expect(isAutoEmail({ from: 'no-reply@shop.com', autoSubmitted: null })).toBe(true);
    expect(isAutoEmail({ from: 'postmaster@x.com', autoSubmitted: null })).toBe(true);
  });
  test('normal mail passes', () => {
    expect(isAutoEmail({ from: 'jane@gmail.com', autoSubmitted: null })).toBe(false);
    expect(isAutoEmail({ from: 'jane@gmail.com', autoSubmitted: 'no' })).toBe(false);
    // "reply" as a bare substring must not blackhole legitimate senders
    expect(isAutoEmail({ from: 'newsletter-reply@brand.com', autoSubmitted: null })).toBe(false);
    expect(isAutoEmail({ from: 'replyto@brand.com', autoSubmitted: null })).toBe(false);
  });
});

describe('stripQuotedReply', () => {
  test('cuts at "On ... wrote:"', () => {
    const t = 'Thanks, that works!\n\nOn Thu, Jul 3, 2026 at 9:00 AM The Found Sock <support@foundsocklaundromat.com> wrote:\n> old text';
    expect(stripQuotedReply(t)).toBe('Thanks, that works!');
  });
  test('cuts at quoted lines and Original Message', () => {
    expect(stripQuotedReply('ok\n> quoted')).toBe('ok');
    expect(stripQuotedReply('ok\n-----Original Message-----\nold')).toBe('ok');
  });
  test('returns full text when stripping leaves almost nothing', () => {
    const t = '> all quoted\n> more';
    expect(stripQuotedReply(t)).toBe(t.trim());
  });
});

describe('htmlToText', () => {
  test('strips tags, keeps text, collapses whitespace', () => {
    expect(htmlToText('<div>Hello <b>world</b><br>bye</div>')).toBe('Hello world\nbye');
  });
  test('does not double-decode escaped entities', () => {
    expect(htmlToText('&amp;lt;')).toBe('&lt;');
    expect(htmlToText('a &amp; b &lt; c')).toBe('a & b < c');
  });
});
