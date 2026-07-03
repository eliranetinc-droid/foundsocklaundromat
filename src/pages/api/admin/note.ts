export const prerender = false;

import type { APIRoute } from 'astro';
import { getHelpdeskEnv } from '../../../lib/helpdesk/env';
import { getTicket, addMessage } from '../../../lib/helpdesk/db';

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
  if (!(await getTicket(env.DB, ticketId))) return json({ error: 'not_found' }, 404);
  await addMessage(env.DB, { ticketId, direction: 'note', body });
  return json({ ok: true }, 200);
};
