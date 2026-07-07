export const prerender = false;

import type { APIRoute } from 'astro';
import { getHelpdeskEnv } from '../../../lib/helpdesk/env';
import { removePushSubscription } from '../../../lib/helpdesk/db';

const json = (body: object, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// CSRF note: protected by Cloudflare Access (edge) + Access-JWT middleware.
export const POST: APIRoute = async ({ request }) => {
  let payload: { endpoint?: string };
  try { payload = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  if (!payload.endpoint) return json({ error: 'missing_endpoint' }, 400);

  const env = await getHelpdeskEnv();
  await removePushSubscription(env.DB, payload.endpoint);
  return json({ ok: true }, 200);
};
