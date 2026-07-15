import { test, expect, describe } from 'vitest';
import { linkify, replyEmail } from './templates';

describe('linkify', () => {
  test('wraps a bare URL in a styled anchor', () => {
    const out = linkify('See https://foundsocklaundromat.com/report-issue/ for details');
    expect(out).toContain('<a href="https://foundsocklaundromat.com/report-issue/"');
    expect(out).toContain('>https://foundsocklaundromat.com/report-issue/</a>');
    expect(out).toContain('style="color:#2f6f9f"');
  });
  test('keeps trailing punctuation outside the link', () => {
    const out = linkify('Use https://foundsocklaundromat.com/report-issue/.');
    expect(out).toContain('href="https://foundsocklaundromat.com/report-issue/"');
    expect(out).toContain('</a>.');
  });
  test('escapes HTML everywhere, including inside URLs', () => {
    const out = linkify('<b>hi</b> https://x.com/?a=1&b=2 <i>bye</i>');
    expect(out).not.toContain('<b>');
    expect(out).toContain('&lt;b&gt;');
    expect(out).toContain('href="https://x.com/?a=1&amp;b=2"');
  });
  test('converts newlines to <br> in non-URL text', () => {
    expect(linkify('line one\nline two')).toBe('line one<br>line two');
  });
  test('plain text passes through escaped, unchanged otherwise', () => {
    expect(linkify('no links here')).toBe('no links here');
  });
  test('applies custom style and extra attrs', () => {
    const out = linkify('https://x.com/', 'color:inherit;text-decoration:underline', ' target="_blank" rel="noopener"');
    expect(out).toContain('style="color:inherit;text-decoration:underline"');
    expect(out).toContain('target="_blank" rel="noopener"');
  });
});

describe('replyEmail linkifies', () => {
  test('html body contains an anchor for a typed URL', () => {
    const e = replyEmail({ subject: 'Washer', publicId: 'FS-TEST1', body: 'Please use https://foundsocklaundromat.com/report-issue/ thanks' });
    expect(e.html).toContain('<a href="https://foundsocklaundromat.com/report-issue/"');
    // text part stays plain
    expect(e.text).toContain('https://foundsocklaundromat.com/report-issue/');
    expect(e.text).not.toContain('<a ');
  });
});
