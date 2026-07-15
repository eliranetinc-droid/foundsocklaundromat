export const prerender = false;

import type { APIRoute } from 'astro';
import { getHelpdeskEnv } from '../../../lib/helpdesk/env';
import { polishText } from '../../../lib/helpdesk/ai';

const json = (body: object, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// CSRF note: Astro's checkOrigin only guards form-like content types; these
// JSON routes are protected by Cloudflare Access (edge) + the Access-JWT
// middleware — do NOT copy this pattern to a non-Access-gated endpoint.
export const POST: APIRoute = async ({ request }) => {
  let payload: { text?: string };
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const text = (payload.text ?? '').trim();
  if (!text) return json({ error: 'empty' }, 400);

  const env = await getHelpdeskEnv();
  const polished = await polishText(env, text.slice(0, 10000));
  if (!polished) return json({ error: 'unavailable' }, 503);
  return json({ text: polished }, 200);
};
