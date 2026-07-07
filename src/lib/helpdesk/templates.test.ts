import { test, expect, describe } from 'vitest';
import { confirmationEmail, notificationEmail, replyEmail } from './templates';

describe('confirmationEmail', () => {
  test('form variant: subject, greeting, ref; no personal identity; has html', () => {
    const e = confirmationEmail({ publicId: 'FS-7K2QX', source: 'issue-form', customerName: 'Jane' });
    expect(e.subject).toBe('We got your report [FS-7K2QX]');
    expect(e.text).toContain('Jane');
    expect(e.text).toContain('FS-7K2QX');
    expect(e.html).toContain('FS-7K2QX');
    expect(e.html).toContain('<');           // it is HTML
    expect(e.text.toLowerCase()).not.toContain('eliran');
    expect(e.html.toLowerCase()).not.toContain('eliran');
    expect(e.html.toLowerCase()).not.toContain('gmail');
  });
  test('email/contact variant says message', () => {
    expect(confirmationEmail({ publicId: 'FS-AAAAA', source: 'email', customerName: 'Bob' }).subject)
      .toBe('We got your message [FS-AAAAA]');
  });
  test('escapes html in customer name', () => {
    const e = confirmationEmail({ publicId: 'FS-1', source: 'email', customerName: '<script>x' });
    expect(e.html).not.toContain('<script>x');
    expect(e.html).toContain('&lt;script&gt;x');
  });
});

describe('notificationEmail', () => {
  test('has admin link, details, and html; optional aiDraft renders', () => {
    const e = notificationEmail({
      publicId: 'FS-7K2QX', ticketId: 'abcabcabcabc', kind: 'ticket',
      subject: 'Issue: Washer #7', customerName: 'Jane', customerEmail: 'j@x.com',
      snippet: 'It ate my money', machine: 'Washer #7', source: 'issue-form',
      aiDraft: 'Sorry about that — refund sent.',
    });
    expect(e.subject).toContain('FS-7K2QX');
    expect(e.subject).toContain('Washer #7');
    expect(e.html).toContain('https://www.foundsocklaundromat.com/admin/tickets/abcabcabcabc/');
    expect(e.html).toContain('Jane');
    expect(e.html).toContain('It ate my money');
    expect(e.html).toContain('Sorry about that');   // AI draft embedded
    expect(e.text).toContain('It ate my money');
  });
  test('omits AI block when no draft', () => {
    const e = notificationEmail({ publicId: 'FS-1', ticketId: 't', kind: 'message', subject: 's', customerName: 'J', customerEmail: 'j@x.com', snippet: 'hi' });
    expect(e.html).not.toContain('Suggested reply');
  });
});

describe('replyEmail', () => {
  test('threads subject; body in text + html; footer ref', () => {
    const e = replyEmail({ subject: 'Issue: Washer #7', publicId: 'FS-7K2QX', body: 'Refund sent to your card.' });
    expect(e.subject).toBe('Re: Issue: Washer #7 [FS-7K2QX]');
    expect(e.text).toContain('Refund sent to your card.');
    expect(e.html).toContain('Refund sent to your card.');
    expect(e.text).toContain('Ref: [FS-7K2QX]');
  });
  test('does not double Re: or [id]', () => {
    expect(replyEmail({ subject: 'Re: Issue [FS-7K2QX]', publicId: 'FS-7K2QX', body: 'x' }).subject)
      .toBe('Re: Issue [FS-7K2QX]');
  });
  test('escapes html in body', () => {
    const e = replyEmail({ subject: 's', publicId: 'FS-1', body: '<b>hi</b>' });
    expect(e.html).not.toContain('<b>hi</b>');
    expect(e.html).toContain('&lt;b&gt;hi&lt;/b&gt;');
  });
});
