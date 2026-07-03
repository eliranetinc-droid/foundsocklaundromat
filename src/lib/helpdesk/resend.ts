import { SUPPORT_DOMAIN, SUPPORT_FROM, type HelpdeskEnv } from './env';

export interface SendOpts {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** When set, customers replying will hit support+<token>@ — our thread key. */
  replyToken?: string;
  inReplyTo?: string;
}
export type SendResult = { ok: true; id: string } | { ok: false; error: string };

export async function sendEmail(env: Pick<HelpdeskEnv, 'RESEND_API_KEY'>, opts: SendOpts): Promise<SendResult> {
  const payload: Record<string, unknown> = {
    from: SUPPORT_FROM,
    to: [opts.to],
    subject: opts.subject,
    text: opts.text,
  };
  if (opts.html) payload.html = opts.html;
  if (opts.replyToken) payload.reply_to = `support+${opts.replyToken}@${SUPPORT_DOMAIN}`;
  if (opts.inReplyTo) payload.headers = { 'In-Reply-To': opts.inReplyTo, References: opts.inReplyTo };

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { ok: false, error: `resend ${res.status}: ${detail.slice(0, 300)}` };
    }
    const json = (await res.json()) as { id: string };
    return { ok: true, id: json.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
