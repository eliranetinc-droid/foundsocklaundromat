import { test, expect, describe } from 'vitest';
import { confirmationEmail, notificationEmail, replyEmail } from './templates';

describe('confirmationEmail', () => {
  test('form variant references report + public id, no personal identity', () => {
    const e = confirmationEmail({ publicId: 'FS-7K2QX', source: 'issue-form', customerName: 'Jane' });
    expect(e.subject).toBe('We got your report [FS-7K2QX]');
    expect(e.text).toContain('Jane');
    expect(e.text).toContain('FS-7K2QX');
    expect(e.text).toContain('reply to this email');
    expect(e.text.toLowerCase()).not.toContain('eliran');
    expect(e.text.toLowerCase()).not.toContain('gmail');
  });
  test('email/contact variant says message', () => {
    expect(confirmationEmail({ publicId: 'FS-AAAAA', source: 'email', customerName: 'Bob' }).subject)
      .toBe('We got your message [FS-AAAAA]');
    expect(confirmationEmail({ publicId: 'FS-AAAAA', source: 'contact-form', customerName: 'Bob' }).subject)
      .toBe('We got your message [FS-AAAAA]');
  });
});

describe('notificationEmail', () => {
  test('links to the admin thread', () => {
    const e = notificationEmail({ publicId: 'FS-7K2QX', ticketId: 'abcabcabcabc', kind: 'ticket', subject: 'Issue: Washer #7', customerName: 'Jane', snippet: 'It ate my money' });
    expect(e.subject).toBe('[FS-7K2QX] New ticket: Issue: Washer #7');
    expect(e.text).toContain('https://www.foundsocklaundromat.com/admin/tickets/abcabcabcabc');
    expect(e.text).toContain('Jane');
    expect(e.text).toContain('It ate my money');
  });
  test('message kind', () => {
    const e = notificationEmail({ publicId: 'FS-7K2QX', ticketId: 'x', kind: 'message', subject: 's', customerName: 'J', snippet: 'hi' });
    expect(e.subject).toBe('[FS-7K2QX] New message: s');
  });
});

describe('replyEmail', () => {
  test('subject threads with Re: and [id]; body has footer with ref', () => {
    const e = replyEmail({ subject: 'Issue: Washer #7', publicId: 'FS-7K2QX', body: 'Refund sent to your card.' });
    expect(e.subject).toBe('Re: Issue: Washer #7 [FS-7K2QX]');
    expect(e.text).toContain('Refund sent to your card.');
    expect(e.text).toContain('The Found Sock Laundromat');
    expect(e.text).toContain('Ref: [FS-7K2QX]');
    expect(e.html).toContain('Refund sent to your card.');
  });
  test('does not double the Re: or the [id]', () => {
    const e = replyEmail({ subject: 'Re: Issue [FS-7K2QX]', publicId: 'FS-7K2QX', body: 'x' });
    expect(e.subject).toBe('Re: Issue [FS-7K2QX]');
  });
});
