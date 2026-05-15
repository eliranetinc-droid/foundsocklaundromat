export const prerender = false;

import type { APIRoute } from 'astro';
import { submitFreshdeskTicket } from '../../lib/freshdesk';

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export const POST: APIRoute = async ({ request, locals }) => {
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

    // Cloudflare Workers expose env via locals.runtime.env; local dev via import.meta.env
    const runtimeEnv = (locals as any)?.runtime?.env;
    const subdomain = runtimeEnv?.FRESHDESK_SUBDOMAIN ?? import.meta.env.FRESHDESK_SUBDOMAIN;
    const apiKey    = runtimeEnv?.FRESHDESK_API_KEY    ?? import.meta.env.FRESHDESK_API_KEY;

    if (!subdomain || !apiKey) {
      console.error('[submit-ticket] missing env vars', {
        hasRuntimeEnv: !!runtimeEnv,
        runtimeEnvKeys: runtimeEnv ? Object.keys(runtimeEnv) : null,
        hasSubdomain: !!subdomain,
        hasApiKey: !!apiKey,
      });
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
