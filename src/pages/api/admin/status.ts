export const prerender = false;

import type { APIRoute } from 'astro';
import { getHelpdeskEnv } from '../../../lib/helpdesk/env';
import { getTicket, setStatus } from '../../../lib/helpdesk/db';

const json = (body: object, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  let payload: { ticketId?: string; status?: string };
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const ticketId = (payload.ticketId ?? '').trim();
  const status = payload.status;
  if (!ticketId) return json({ error: 'missing_ticket' }, 400);
  if (status !== 'open' && status !== 'closed') return json({ error: 'invalid_status' }, 400);

  const env = await getHelpdeskEnv();
  if (!(await getTicket(env.DB, ticketId))) return json({ error: 'not_found' }, 404);
  await setStatus(env.DB, ticketId, status);
  return json({ ok: true }, 200);
};
