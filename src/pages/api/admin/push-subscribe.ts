export const prerender = false;

import type { APIRoute } from 'astro';
import { getHelpdeskEnv } from '../../../lib/helpdesk/env';
import { upsertPushSubscription } from '../../../lib/helpdesk/db';

const json = (body: object, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// CSRF note: protected by Cloudflare Access (edge) + Access-JWT middleware.
export const POST: APIRoute = async ({ request }) => {
  let payload: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  try { payload = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const endpoint = payload.endpoint ?? '';
  const p256dh = payload.keys?.p256dh ?? '';
  const auth = payload.keys?.auth ?? '';
  if (!endpoint.startsWith('https://') || endpoint.length > 1024 || !p256dh || !auth) return json({ error: 'invalid_subscription' }, 400);

  const env = await getHelpdeskEnv();
  await upsertPushSubscription(env.DB, { endpoint, p256dh, auth });
  return json({ ok: true }, 200);
};
