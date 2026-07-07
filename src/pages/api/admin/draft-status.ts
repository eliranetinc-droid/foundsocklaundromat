export const prerender = false;

import type { APIRoute } from 'astro';
import { getHelpdeskEnv } from '../../../lib/helpdesk/env';
import { setDraftStatus } from '../../../lib/helpdesk/db';

const json = (body: object, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const ALLOWED = new Set(['used', 'sent_as_is', 'dismissed']);

// CSRF note: protected by Cloudflare Access (edge) + Access-JWT middleware.
export const POST: APIRoute = async ({ request }) => {
  let payload: { draftId?: number; status?: string };
  try { payload = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const id = Number(payload.draftId);
  const status = payload.status ?? '';
  if (!id || !ALLOWED.has(status)) return json({ error: 'invalid_params' }, 400);

  const env = await getHelpdeskEnv();
  await setDraftStatus(env.DB, id, status);
  return json({ ok: true }, 200);
};
