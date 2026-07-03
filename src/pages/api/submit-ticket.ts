export const prerender = false;

import type { APIRoute } from 'astro';
import { getHelpdeskEnv } from '../../lib/helpdesk/env';
import { intakeTicket } from '../../lib/helpdesk/intake';

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

function jsonResponse(body: object, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export const POST: APIRoute = async ({ request }) => {
  try {
    let payload: Record<string, unknown>;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ error: 'invalid_json' }, 400);
    }

    const { name, email, message, type } = payload as Record<string, string>;
    if (!name || name.length < 1 || name.length > 100)            return jsonResponse({ error: 'invalid_name' }, 400);
    if (!email || !isEmail(email))                                return jsonResponse({ error: 'invalid_email' }, 400);
    if (!message || message.length < 1 || message.length > 5000)  return jsonResponse({ error: 'invalid_message' }, 400);
    if (type !== 'issue' && type !== 'general')                    return jsonResponse({ error: 'invalid_type' }, 400);

    const env = await getHelpdeskEnv();
    const { publicId } = await intakeTicket(env, {
      source: 'contact-form',
      customerName: name,
      customerEmail: email,
      subject: type === 'issue' ? `Issue from ${name}` : `Contact form message`,
      body: message,
    });

    return jsonResponse({ ok: true, ticketId: publicId }, 200);
  } catch (e) {
    console.error('[submit-ticket] uncaught error:', e);
    return jsonResponse({ error: 'unexpected_error', detail: e instanceof Error ? e.message : String(e) }, 500);
  }
};
