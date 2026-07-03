import { test, expect, describe } from 'vitest';
import { newTicketId, newPublicId, newReplyToken } from './ids';

describe('helpdesk ids', () => {
  test('ticket id: 12 chars, url-safe alphabet', () => {
    const id = newTicketId();
    expect(id).toMatch(/^[a-z2-9]{12}$/);
    expect(newTicketId()).not.toBe(id); // random
  });

  test('public id: FS- + 5 uppercase chars', () => {
    expect(newPublicId()).toMatch(/^FS-[A-Z2-9]{5}$/);
  });

  test('reply token: t + 10 lowercase chars', () => {
    expect(newReplyToken()).toMatch(/^t[a-z2-9]{10}$/);
  });

  test('no confusing chars (0,1,i,l,o) ever appear', () => {
    for (let i = 0; i < 50; i++) {
      expect(newTicketId() + newReplyToken() + newPublicId().toLowerCase()).not.toMatch(/[01ilo]/);
    }
  });
});
