export const prerender = false;

import type { APIRoute } from 'astro';
import { getHelpdeskEnv } from '../../../lib/helpdesk/env';
import { setSetting } from '../../../lib/helpdesk/db';

const json = (body: object, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// CSRF note: protected by Cloudflare Access (edge) + Access-JWT middleware.
export const POST: APIRoute = async ({ request }) => {
  let payload: { aiEnabled?: boolean; houseRules?: string };
  try { payload = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  const env = await getHelpdeskEnv();
  if (typeof payload.aiEnabled === 'boolean') await setSetting(env.DB, 'ai_enabled', payload.aiEnabled ? '1' : '0');
  if (typeof payload.houseRules === 'string') await setSetting(env.DB, 'house_rules', payload.houseRules.slice(0, 4000));
  return json({ ok: true }, 200);
};
