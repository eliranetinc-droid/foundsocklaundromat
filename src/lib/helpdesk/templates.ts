import { SITE_URL } from './env';

export type TicketSource = 'issue-form' | 'contact-form' | 'email';

const FOOTER = [
  '—',
  'The Found Sock Laundromat',
  '76 Washington St, Brighton MA · Open daily 6 AM–11 PM',
  'foundsocklaundromat.com',
].join('\n');

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function confirmationEmail(t: { publicId: string; source: TicketSource; customerName: string }) {
  const noun = t.source === 'issue-form' ? 'report' : 'message';
  const subject = `We got your ${noun} [${t.publicId}]`;
  const text = [
    `Hi ${t.customerName},`,
    '',
    `Thanks — we received your ${noun} and will get back to you as soon as we can, usually within a few hours during open hours (6 AM–11 PM daily).`,
    '',
    `Your reference number is ${t.publicId}. You can reply to this email any time to add details or photos.`,
    '',
    FOOTER,
  ].join('\n');
  return { subject, text };
}

export function notificationEmail(n: { publicId: string; ticketId: string; kind: 'ticket' | 'message'; subject: string; customerName: string; snippet: string }) {
  const subject = `[${n.publicId}] New ${n.kind}: ${n.subject}`;
  const text = [
    `New ${n.kind} from ${n.customerName}.`,
    '',
    n.snippet.slice(0, 300),
    '',
    `Open in admin: ${SITE_URL}/admin/tickets/${n.ticketId}`,
  ].join('\n');
  return { subject, text };
}

export function replyEmail(r: { subject: string; publicId: string; body: string }) {
  let subject = r.subject;
  if (!subject.includes(`[${r.publicId}]`)) subject = `${subject} [${r.publicId}]`;
  if (!/^re:/i.test(subject)) subject = `Re: ${subject}`;
  const text = [r.body.trim(), '', FOOTER, `Ref: [${r.publicId}]`].join('\n');
  const html = [
    `<div style="font-family:sans-serif;font-size:15px;color:#0F2A4A;line-height:1.6">`,
    `<p>${escapeHtml(r.body.trim()).replace(/\n/g, '<br>')}</p>`,
    `<p style="color:#666;font-size:13px">—<br>The Found Sock Laundromat<br>76 Washington St, Brighton MA · Open daily 6 AM–11 PM<br><a href="${SITE_URL}">foundsocklaundromat.com</a><br>Ref: [${r.publicId}]</p>`,
    `</div>`,
  ].join('');
  return { subject, text, html };
}
