export const prerender = false;

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { submitFreshdeskTicket } from '../../lib/freshdesk';

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export const POST: APIRoute = async ({ request }) => {
  try {
    let payload: Record<string, unknown>;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ error: 'invalid_json' }, 400);
    }

    const { name, email, message, type } = payload as Record<string, string>;
    if (!name || name.length < 1 || name.length > 100)           return jsonResponse({ error: 'invalid_name' }, 400);
    if (!email || !isEmail(email))                               return jsonResponse({ error: 'invalid_email' }, 400);
    if (!message || message.length < 1 || message.length > 5000) return jsonResponse({ error: 'invalid_message' }, 400);
    if (type !== 'issue' && type !== 'general')                   return jsonResponse({ error: 'invalid_type' }, 400);

    const subdomain = (env as any).FRESHDESK_SUBDOMAIN as string | undefined;
    const apiKey    = (env as any).FRESHDESK_API_KEY as string | undefined;

    if (!subdomain || !apiKey) {
      console.error('[submit-ticket] missing env vars', { hasSubdomain: !!subdomain, hasApiKey: !!apiKey });
      return jsonResponse({ error: 'server_misconfigured' }, 500);
    }

    try {
      const result = await submitFreshdeskTicket({
        subdomain, apiKey, name, email,
        subject: type === 'issue' ? `Issue from ${name}` : `Inquiry from ${name}`,
        description: message,
        type,
      });
      return jsonResponse({ ok: true, ticketId: result.id }, 200);
    } catch (e) {
      console.error('[submit-ticket] Freshdesk call failed:', e);
      return jsonResponse({
        error: 'upstream_failed',
        detail: e instanceof Error ? e.message : String(e),
      }, 502);
    }
  } catch (e) {
    console.error('[submit-ticket] uncaught error:', e);
    return jsonResponse({
      error: 'unexpected_error',
      detail: e instanceof Error ? e.message : String(e),
    }, 500);
  }
};

function jsonResponse(body: object, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorJson(error: string): Response {
  return new Response(JSON.stringify({ error }), { status: 400 });
}
