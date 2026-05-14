import { test, expect, vi, beforeEach } from 'vitest';
import { submitFreshdeskTicket } from './freshdesk';

beforeEach(() => {
  global.fetch = vi.fn();
});

test('posts a ticket with correct payload', async () => {
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true, status: 201, json: async () => ({ id: 42 }),
  });

  const result = await submitFreshdeskTicket({
    subdomain: 'foundsock',
    apiKey: 'test_key',
    name: 'Jane',
    email: 'jane@example.com',
    subject: 'Washer #3',
    description: 'It stopped mid cycle.',
    type: 'issue',
  });

  expect(result.id).toBe(42);
  expect(global.fetch).toHaveBeenCalledWith(
    'https://foundsock.freshdesk.com/api/v2/tickets',
    expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
        Authorization: expect.stringContaining('Basic '),
      }),
    })
  );
});

test('throws on non-201 response', async () => {
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: false, status: 400, text: async () => 'bad request',
  });

  await expect(submitFreshdeskTicket({
    subdomain: 'foundsock', apiKey: 'k',
    name: 'a', email: 'a@b.com', subject: 's', description: 'd', type: 'issue',
  })).rejects.toThrow(/freshdesk error/i);
});
