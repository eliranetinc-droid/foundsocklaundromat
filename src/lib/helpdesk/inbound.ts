import PostalMime, { type RawEmail } from 'postal-mime';
import type { ForwardableEmailMessage } from '@cloudflare/workers-types';
import type { HelpdeskEnv } from './env';
import { parsePlusToken, parseSubjectPublicId, isAutoEmail, stripQuotedReply, htmlToText } from './email-match';
import { findByReplyToken, findByPublicId, findOpenByEmail, addMessage, setStatus, touchActivity, type TicketRow } from './db';
import { intakeTicket, sanitizeFilename } from './intake';
import { notificationEmail } from './templates';
import { sendEmail } from './resend';
import { generateDraftForTicket } from './ai';
import { notifyPushAll } from './webpush';

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENTS = 5;

export async function handleInboundEmail(message: ForwardableEmailMessage, env: HelpdeskEnv): Promise<void> {
  const parsed = await PostalMime.parse(message.raw as unknown as RawEmail);

  const from = parsed.from?.address ?? message.from ?? '';
  const fromName = parsed.from?.name?.trim() || from.split('@')[0] || 'Customer';
  const subject = parsed.subject ?? '';
  const recipients = [
    message.to,
    ...(parsed.to?.map((a) => a.address ?? '') ?? []),
    ...(parsed.cc?.map((a) => a.address ?? '') ?? []),
  ].filter((r): r is string => !!r);

  // Match: plus-token → subject public id → sender's open ticket
  let ticket: TicketRow | null = null;
  const token = parsePlusToken(recipients);
  if (token) ticket = (await findByReplyToken(env.DB, token)) ?? null;
  if (!ticket) {
    const pid = parseSubjectPublicId(subject);
    if (pid) ticket = (await findByPublicId(env.DB, pid)) ?? null;
  }
  if (!ticket && from) ticket = (await findOpenByEmail(env.DB, from)) ?? null;

  // Bounce/auto guard
  const auto = isAutoEmail({ from, autoSubmitted: message.headers.get('auto-submitted') });
  if (auto) {
    if (ticket) {
      await addMessage(env.DB, { ticketId: ticket.id, direction: 'note', body: `[automated email or bounce received from ${from}]` });
    }
    return; // never auto-reply to automated mail
  }

  const rawText = parsed.text?.trim() || htmlToText(parsed.html ?? '');
  const body = stripQuotedReply(rawText);

  // Store image attachments (inbound) to R2
  const attachmentKeys: string[] = [];
  const owner = ticket?.id ?? crypto.randomUUID();
  let i = 0;
  for (const att of parsed.attachments ?? []) {
    if (attachmentKeys.length >= MAX_ATTACHMENTS) break;
    if (!att.mimeType?.startsWith('image/')) continue;
    const content = att.content instanceof ArrayBuffer ? att.content : null;
    if (!content || content.byteLength === 0 || content.byteLength > MAX_ATTACHMENT_BYTES) continue;
    const key = `inbound/${owner}/${i++}-${sanitizeFilename(att.filename ?? 'image')}`;
    await env.PHOTOS.put(key, content, { httpMetadata: { contentType: att.mimeType } });
    attachmentKeys.push(key);
  }

  if (!ticket) {
    if (!body && attachmentKeys.length === 0) return; // nothing usable — drop
    await intakeTicket(env, {
      source: 'email',
      customerName: fromName,
      customerEmail: from,
      subject: subject || '(no subject)',
      body: body || '[image attachment]',
      emailMessageId: parsed.messageId ?? null,
      attachments: attachmentKeys.length ? attachmentKeys : null,
    });
    return; // intakeTicket already confirmed + notified
  }

  await addMessage(env.DB, {
    ticketId: ticket.id,
    direction: 'inbound',
    body: body || '[image attachment]',
    fromEmail: from,
    emailMessageId: parsed.messageId ?? null,
    attachments: attachmentKeys.length ? attachmentKeys : null,
  });
  if (ticket.status === 'closed') await setStatus(env.DB, ticket.id, 'open');
  await touchActivity(env.DB, ticket.id, 1);

  const aiDraft = await generateDraftForTicket(env, ticket.id, null);

  const note = notificationEmail({
    publicId: ticket.public_id, ticketId: ticket.id, kind: 'message',
    subject: ticket.subject, customerName: ticket.customer_name, customerEmail: ticket.customer_email,
    snippet: body || '[image attachment]',
    machine: ticket.machine_type ? `${ticket.machine_type}${ticket.machine_number ? ' #' + ticket.machine_number : ''}` : null,
    source: ticket.source,
    aiDraft,
  });
  const sent = await sendEmail(env, { to: env.NOTIFY_EMAIL, subject: note.subject, text: note.text, html: note.html });
  if (!sent.ok) console.error('[helpdesk] inbound notification failed:', sent.error);

  await notifyPushAll(env, {
    title: `↩️ Reply on [${ticket.public_id}]`,
    body: `${ticket.customer_name}: ${(body || '[image attachment]')}`.slice(0, 120),
    url: `/admin/tickets/${ticket.id}/`,
  });
}
