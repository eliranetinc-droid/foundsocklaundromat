export const prerender = false;

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { submitFreshdeskIssueTicket } from '../../lib/freshdesk';

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function s(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v.trim() : '';
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function jsonResponse(body: object, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  try {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return jsonResponse({ error: 'invalid_form' }, 400);
    }

    const firstName     = s(form.get('firstName'));
    const lastName      = s(form.get('lastName'));
    const email         = s(form.get('email'));
    const phone         = s(form.get('phone'));
    const machineType   = s(form.get('machineType'));
    const machineNumber = s(form.get('machineNumber'));
    const cardType      = s(form.get('cardType'));
    const cardLast4     = s(form.get('cardLast4'));
    const loyaltyCard   = s(form.get('loyaltyCard'));
    const issueDate     = s(form.get('issueDate'));
    const issueTime     = s(form.get('issueTime'));
    const cost          = s(form.get('cost'));
    const message       = s(form.get('message'));

    // Validate required (only name + email + message — match Wix where rest are optional)
    if (!firstName || firstName.length > 60)  return jsonResponse({ error: 'invalid_first_name' }, 400);
    if (!lastName  || lastName.length > 60)   return jsonResponse({ error: 'invalid_last_name' }, 400);
    if (!email || !isEmail(email))            return jsonResponse({ error: 'invalid_email' }, 400);
    if (!message || message.length > 5000)    return jsonResponse({ error: 'invalid_message' }, 400);

    // Optional file
    const fileEntry = form.get('image');
    let attachment: { filename: string; type: string; data: ArrayBuffer } | null = null;
    if (fileEntry && fileEntry instanceof File && fileEntry.size > 0) {
      if (fileEntry.size > MAX_FILE_BYTES) return jsonResponse({ error: 'file_too_big' }, 400);
      if (!fileEntry.type.startsWith('image/')) return jsonResponse({ error: 'file_must_be_image' }, 400);
      attachment = {
        filename: fileEntry.name || 'photo.jpg',
        type: fileEntry.type,
        data: await fileEntry.arrayBuffer(),
      };
    }

    const subdomain = (env as any).FRESHDESK_SUBDOMAIN as string | undefined;
    const apiKey    = (env as any).FRESHDESK_API_KEY as string | undefined;
    if (!subdomain || !apiKey) {
      return jsonResponse({ error: 'server_misconfigured' }, 500);
    }

    // Build a rich HTML description with all the structured fields
    const fullName = `${firstName} ${lastName}`.trim();
    const subject = machineType && machineNumber
      ? `Issue: ${machineType} #${machineNumber} — from ${fullName}`
      : `Issue from ${fullName}`;

    const rows: [string, string][] = [];
    if (machineType)   rows.push(['Machine type',   machineType]);
    if (machineNumber) rows.push(['Machine number', `#${machineNumber}`]);
    if (issueDate)     rows.push(['Date of issue',  issueDate]);
    if (issueTime)     rows.push(['Time of issue',  issueTime]);
    if (cost)          rows.push(['Cost',           `$${cost}`]);
    if (cardType)      rows.push(['Card type',      cardType]);
    if (cardLast4)     rows.push(['Card last 4',    cardLast4]);
    if (loyaltyCard)   rows.push(['Loyalty card #', loyaltyCard]);
    if (phone)         rows.push(['Phone',          phone]);

    const detailsTable = rows.length > 0
      ? `<table style="border-collapse:collapse;font-size:14px;margin-top:16px">${rows.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#666"><strong>${escapeHtml(k)}</strong></td><td style="padding:4px 0">${escapeHtml(v)}</td></tr>`).join('')}</table>`
      : '';

    const description = `<p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>${detailsTable}${attachment ? `<p style="margin-top:12px;color:#666;font-size:12px">📎 Photo attached: ${escapeHtml(attachment.filename)}</p>` : ''}`;

    try {
      const result = await submitFreshdeskIssueTicket({
        subdomain, apiKey,
        name: fullName,
        email,
        subject,
        description,
        attachment,
      });
      return jsonResponse({ ok: true, ticketId: result.id }, 200);
    } catch (e) {
      console.error('[submit-issue] Freshdesk call failed:', e);
      return jsonResponse({
        error: 'upstream_failed',
        detail: e instanceof Error ? e.message : String(e),
      }, 502);
    }
  } catch (e) {
    console.error('[submit-issue] uncaught error:', e);
    return jsonResponse({
      error: 'unexpected_error',
      detail: e instanceof Error ? e.message : String(e),
    }, 500);
  }
};
