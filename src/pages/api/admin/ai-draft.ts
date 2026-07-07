export const prerender = false;

import type { APIRoute } from 'astro';
import { getHelpdeskEnv } from '../../../lib/helpdesk/env';
import { generateDraftForTicket } from '../../../lib/helpdesk/ai';

const json = (body: object, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// CSRF note: protected by Cloudflare Access (edge) + Access-JWT middleware —
// do NOT copy this pattern to a non-Access-gated endpoint.
export const POST: APIRoute = async ({ request }) => {
  let payload: { ticketId?: string };
  try { payload = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const ticketId = (payload.ticketId ?? '').trim();
  if (!ticketId) return json({ error: 'missing_ticket' }, 400);

  const env = await getHelpdeskEnv();
  const body = await generateDraftForTicket(env, ticketId, null);
  return json({ ok: true, body }, 200); // body may be null (no suggestion)
};
