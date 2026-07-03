export const prerender = false;

import type { APIRoute } from 'astro';
import { getHelpdeskEnv } from '../../lib/helpdesk/env';
import { intakeTicket, sanitizeFilename } from '../../lib/helpdesk/intake';

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function s(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v.trim() : '';
}

function jsonResponse(body: object, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
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

    // All fields required (unchanged contract)
    if (!firstName || firstName.length > 60)  return jsonResponse({ error: 'invalid_first_name' }, 400);
    if (!lastName  || lastName.length > 60)   return jsonResponse({ error: 'invalid_last_name' }, 400);
    if (!email || !isEmail(email))            return jsonResponse({ error: 'invalid_email' }, 400);
    if (!phone)                               return jsonResponse({ error: 'invalid_phone' }, 400);
    if (!machineType)                         return jsonResponse({ error: 'invalid_machine_type' }, 400);
    if (!issueDate)                           return jsonResponse({ error: 'invalid_issue_date' }, 400);
    if (!issueTime)                           return jsonResponse({ error: 'invalid_issue_time' }, 400);
    if (!cardType)                            return jsonResponse({ error: 'invalid_card_type' }, 400);
    if (!cost)                                return jsonResponse({ error: 'invalid_cost' }, 400);
    if (!message || message.length > 5000)    return jsonResponse({ error: 'invalid_message' }, 400);

    if (machineType === 'Washer' || machineType === 'Dryer') {
      if (!machineNumber) return jsonResponse({ error: 'invalid_machine_number' }, 400);
    }
    if (cardType === 'Credit Card') {
      if (!/^\d{4}$/.test(cardLast4)) return jsonResponse({ error: 'invalid_card_last4' }, 400);
    } else if (cardType === 'Loyalty Card') {
      if (!loyaltyCard) return jsonResponse({ error: 'invalid_loyalty_card' }, 400);
    }

    // Required photo
    const fileEntry = form.get('image');
    if (!fileEntry || !(fileEntry instanceof File) || fileEntry.size === 0) {
      return jsonResponse({ error: 'image_required' }, 400);
    }
    if (fileEntry.size > MAX_FILE_BYTES) return jsonResponse({ error: 'file_too_big' }, 400);
    if (!fileEntry.type.startsWith('image/')) return jsonResponse({ error: 'file_must_be_image' }, 400);

    const env = await getHelpdeskEnv();

    const fullName = `${firstName} ${lastName}`.trim();
    const subject = machineNumber ? `Issue: ${machineType} #${machineNumber}` : `Issue: ${machineType}`;

    // Store photo first so the ticket row can reference it.
    const preId = crypto.randomUUID();
    const photoKey = `form/${preId}/${sanitizeFilename(fileEntry.name || 'photo.jpg')}`;
    await env.PHOTOS.put(photoKey, await fileEntry.arrayBuffer(), {
      httpMetadata: { contentType: fileEntry.type },
    });

    const { publicId } = await intakeTicket(env, {
      source: 'issue-form',
      customerName: fullName,
      customerEmail: email,
      customerPhone: phone,
      subject,
      body: message,
      fields: {
        machineType, machineNumber: machineNumber || null,
        cardType, cardLast4: cardLast4 || null, loyaltyCard: loyaltyCard || null,
        issueDate, issueTime, cost, photoKey,
      },
    });

    return jsonResponse({ ok: true, ticketId: publicId }, 200);
  } catch (e) {
    console.error('[submit-issue] uncaught error:', e);
    // No detail echoed to the public: raw exception text can leak internals.
    return jsonResponse({ error: 'unexpected_error' }, 500);
  }
};
