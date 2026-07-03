import { test, expect, describe, vi, beforeEach, afterEach } from 'vitest';
import { sendEmail } from './resend';

const env = { RESEND_API_KEY: 'rk_test' } as never;

describe('sendEmail', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  test('posts correct payload; reply token becomes plus-address Reply-To', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response(JSON.stringify({ id: 'msg_1' }), { status: 200 }));
    const res = await sendEmail(env, {
      to: 'jane@gmail.com', subject: 'Hi', text: 'body',
      replyToken: 'tabc23defgh', inReplyTo: '<x@mail.gmail.com>',
    });
    expect(res).toEqual({ ok: true, id: 'msg_1' });
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.Authorization).toBe('Bearer rk_test');
    const payload = JSON.parse(init.body);
    expect(payload.from).toBe('The Found Sock Laundromat <support@foundsocklaundromat.com>');
    expect(payload.to).toEqual(['jane@gmail.com']);
    expect(payload.reply_to).toBe('support+tabc23defgh@foundsocklaundromat.com');
    expect(payload.headers['In-Reply-To']).toBe('<x@mail.gmail.com>');
    expect(payload.headers.References).toBe('<x@mail.gmail.com>');
  });

  test('no token → no reply_to; no inReplyTo → no headers key', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response(JSON.stringify({ id: 'msg_2' }), { status: 200 }));
    await sendEmail(env, { to: 'a@b.com', subject: 's', text: 't' });
    const payload = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(payload.reply_to).toBeUndefined();
    expect(payload.headers).toBeUndefined();
  });

  test('non-200 → ok:false with error text', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response('{"message":"invalid"}', { status: 422 }));
    const res = await sendEmail(env, { to: 'a@b.com', subject: 's', text: 't' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('422');
  });

  test('fetch throw → ok:false', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network'));
    const res = await sendEmail(env, { to: 'a@b.com', subject: 's', text: 't' });
    expect(res.ok).toBe(false);
  });
});
