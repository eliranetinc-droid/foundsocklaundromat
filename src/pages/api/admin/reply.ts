export const prerender = false;

import type { APIRoute } from 'astro';
import { getHelpdeskEnv } from '../../../lib/helpdesk/env';
import { getTicket, addMessage, markRead, touchActivity, lastInboundMessageId } from '../../../lib/helpdesk/db';
import { replyEmail } from '../../../lib/helpdesk/templates';
import { sendEmail } from '../../../lib/helpdesk/resend';

const json = (body: object, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// CSRF note: Astro's checkOrigin only guards form-like content types; these
// JSON routes are protected by Cloudflare Access (edge) + the Access-JWT
// middleware — do NOT copy this pattern to a non-Access-gated endpoint.
export const POST: APIRoute = async ({ request }) => {
  let payload: { ticketId?: string; body?: string };
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const ticketId = (payload.ticketId ?? '').trim();
  const body = (payload.body ?? '').trim();
  if (!ticketId) return json({ error: 'missing_ticket' }, 400);
  if (!body || body.length > 10000) return json({ error: 'invalid_body' }, 400);

  const env = await getHelpdeskEnv();
  const ticket = await getTicket(env.DB, ticketId);
  if (!ticket) return json({ error: 'not_found' }, 404);

  const tpl = replyEmail({ subject: ticket.subject, publicId: ticket.public_id, body });
  const inReplyTo = await lastInboundMessageId(env.DB, ticket.id);
  const sent = await sendEmail(env, {
    to: ticket.customer_email,
    subject: tpl.subject,
    text: tpl.text,
    html: tpl.html,
    replyToken: ticket.reply_token,
    inReplyTo: inReplyTo ?? undefined,
  });
  if (!sent.ok) return json({ error: 'send_failed', detail: sent.error }, 502);

  await addMessage(env.DB, { ticketId: ticket.id, direction: 'outbound', body, fromEmail: null, emailMessageId: sent.id });
  await touchActivity(env.DB, ticket.id, 0);
  await markRead(env.DB, ticket.id);
  return json({ ok: true }, 200);
};
