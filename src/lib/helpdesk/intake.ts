import type { HelpdeskEnv } from './env';
import { newTicketId, newPublicId, newReplyToken } from './ids';
import { createTicket, addMessage, type NewTicket } from './db';
import { confirmationEmail, notificationEmail, type TicketSource } from './templates';
import { sendEmail } from './resend';

export interface IntakeInput {
  source: TicketSource;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  subject: string;
  body: string;
  fields?: Partial<Pick<NewTicket, 'machineType' | 'machineNumber' | 'cardType' | 'cardLast4' | 'loyaltyCard' | 'issueDate' | 'issueTime' | 'cost' | 'photoKey'>>;
  /** inbound-email metadata */
  emailMessageId?: string | null;
  attachments?: string[] | null;
  /** set false to skip the customer confirmation (never used today, future-proofing bounce cases) */
  sendConfirmation?: boolean;
}

/** Creates ticket + first message, sends confirmation + owner notification (both failure-tolerant). */
export async function intakeTicket(env: HelpdeskEnv, input: IntakeInput): Promise<{ id: string; publicId: string }> {
  const id = newTicketId();
  const publicId = newPublicId();
  const replyToken = newReplyToken();

  await createTicket(env.DB, {
    id, publicId, replyToken,
    source: input.source,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    customerPhone: input.customerPhone ?? null,
    subject: input.subject,
    ...input.fields,
  });
  await addMessage(env.DB, {
    ticketId: id, direction: 'inbound', body: input.body,
    fromEmail: input.customerEmail, emailMessageId: input.emailMessageId ?? null,
    attachments: input.attachments ?? null,
  });

  if (input.sendConfirmation !== false) {
    const conf = confirmationEmail({ publicId, source: input.source, customerName: input.customerName });
    const sent = await sendEmail(env, { to: input.customerEmail, subject: conf.subject, text: conf.text, replyToken });
    if (!sent.ok) console.error('[helpdesk] confirmation send failed:', sent.error);
  }
  const note = notificationEmail({ publicId, ticketId: id, kind: 'ticket', subject: input.subject, customerName: input.customerName, snippet: input.body });
  const notified = await sendEmail(env, { to: env.NOTIFY_EMAIL, subject: note.subject, text: note.text });
  if (!notified.ok) console.error('[helpdesk] owner notification failed:', notified.error);

  return { id, publicId };
}

export function sanitizeFilename(name: string): string {
  const clean = (name || 'file').replace(/[^\w.\-]+/g, '_');
  return clean.slice(-80);
}
