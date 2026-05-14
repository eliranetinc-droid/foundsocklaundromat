export const prerender = false;

import type { APIRoute } from 'astro';
import { submitFreshdeskTicket } from '../../lib/freshdesk';

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export const POST: APIRoute = async ({ request, locals }) => {
  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400 });
  }

  const { name, email, message, type } = payload as Record<string, string>;
  if (!name || name.length < 1 || name.length > 100)           return errorJson('invalid_name');
  if (!email || !isEmail(email))                               return errorJson('invalid_email');
  if (!message || message.length < 1 || message.length > 5000) return errorJson('invalid_message');
  if (type !== 'issue' && type !== 'general')                   return errorJson('invalid_type');

  // Support both Cloudflare Workers runtime env and local .env
  const env = (locals as any).runtime?.env ?? import.meta.env;
  const subdomain = env.FRESHDESK_SUBDOMAIN as string | undefined;
  const apiKey = env.FRESHDESK_API_KEY as string | undefined;
  if (!subdomain || !apiKey) {
    return new Response(JSON.stringify({ error: 'server_misconfigured' }), { status: 500 });
  }

  try {
    const result = await submitFreshdeskTicket({
      subdomain, apiKey, name, email,
      subject: type === 'issue' ? `Issue from ${name}` : `Inquiry from ${name}`,
      description: message,
      type,
    });
    return new Response(JSON.stringify({ ok: true, ticketId: result.id }), { status: 200 });
  } catch (e) {
    console.error('Freshdesk submission failed', e);
    return new Response(JSON.stringify({ error: 'upstream_failed' }), { status: 502 });
  }
};

function errorJson(error: string): Response {
  return new Response(JSON.stringify({ error }), { status: 400 });
}
