import { SITE_URL } from './env';

export type TicketSource = 'issue-form' | 'contact-form' | 'email';

const ADDRESS = '76 Washington St, Brighton MA · Open daily 6 AM–11 PM';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const br = (s: string) => escapeHtml(s).replace(/\n/g, '<br>');

/** 600px branded shell. `inner` is trusted HTML (already escaped by caller). */
function shell(heading: string, inner: string, publicId: string): string {
  return [
    `<div style="background:#f4efe6;padding:24px 0;font-family:Inter,Arial,sans-serif">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">`,
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">`,
    `<tr><td style="background:#0F2A4A;padding:18px 28px;border-radius:14px 14px 0 0">`,
    `<span style="color:#fff;font-size:18px;font-weight:700">The Found Sock Laundromat</span></td></tr>`,
    `<tr><td style="background:#fff;padding:28px;border:1px solid #e7e0d4;border-top:0;border-radius:0 0 14px 14px">`,
    heading ? `<h1 style="margin:0 0 14px;font-size:19px;color:#0F2A4A">${escapeHtml(heading)}</h1>` : '',
    inner,
    `<p style="margin:22px 0 0;color:#8a8378;font-size:12px;line-height:1.6">${escapeHtml(ADDRESS)}<br>`,
    `<a href="${SITE_URL}" style="color:#2f6f9f">foundsocklaundromat.com</a> · Ref: [${escapeHtml(publicId)}]</p>`,
    `</td></tr></table></td></tr></table></div>`,
  ].join('');
}

export function confirmationEmail(t: { publicId: string; source: TicketSource; customerName: string }) {
  const noun = t.source === 'issue-form' ? 'report' : 'message';
  const subject = `We got your ${noun} [${t.publicId}]`;
  const text = [
    `Hi ${t.customerName},`, '',
    `Thanks — we received your ${noun} and will get back to you as soon as we can, usually within a few hours during open hours (6 AM–11 PM daily).`, '',
    `Your reference number is ${t.publicId}. You can reply to this email any time to add details or photos.`, '',
    '—', 'The Found Sock Laundromat', ADDRESS, 'foundsocklaundromat.com',
  ].join('\n');
  const inner = [
    `<p style="margin:0 0 12px;font-size:15px;color:#333;line-height:1.6">Hi ${escapeHtml(t.customerName)},</p>`,
    `<p style="margin:0 0 12px;font-size:15px;color:#333;line-height:1.6">Thanks — we received your ${noun} and will get back to you as soon as we can, usually within a few hours during open hours (6&nbsp;AM–11&nbsp;PM daily).</p>`,
    `<p style="margin:0;font-size:15px;color:#333;line-height:1.6">Your reference number is <b>${escapeHtml(t.publicId)}</b>. Just reply to this email any time to add details or photos.</p>`,
  ].join('');
  return { subject, text, html: shell(`Thanks, ${t.customerName}!`, inner, t.publicId) };
}

export function notificationEmail(n: {
  publicId: string; ticketId: string; kind: 'ticket' | 'message';
  subject: string; customerName: string; customerEmail: string; snippet: string;
  machine?: string | null; source?: TicketSource; aiDraft?: string | null;
}) {
  const emoji = n.kind === 'ticket' ? '🧺' : '↩️';
  const subject = `${emoji} ${n.kind === 'ticket' ? 'New ticket' : 'Reply'} [${n.publicId}]: ${n.subject}`;
  const url = `${SITE_URL}/admin/tickets/${n.ticketId}/`;
  const text = [
    `New ${n.kind} from ${n.customerName} <${n.customerEmail}>.`, '',
    n.snippet.slice(0, 500), '',
    n.aiDraft ? `Suggested reply:\n${n.aiDraft}\n` : '',
    `Open in admin: ${url}`,
  ].filter(Boolean).join('\n');
  const rows: [string, string][] = [
    ['From', `${n.customerName} · ${n.customerEmail}`],
    ...(n.machine ? [['Machine', n.machine] as [string, string]] : []),
    ...(n.source ? [['Source', n.source] as [string, string]] : []),
  ];
  const inner = [
    `<table role="presentation" width="100%" style="font-size:13px;color:#333;margin-bottom:14px">`,
    rows.map(([k, v]) => `<tr><td style="padding:2px 0;color:#8a8378;width:80px">${escapeHtml(k)}</td><td style="padding:2px 0">${escapeHtml(v)}</td></tr>`).join(''),
    `</table>`,
    `<div style="background:#f4efe6;border-radius:10px;padding:14px;font-size:14px;color:#333;line-height:1.6;margin-bottom:16px">${br(n.snippet.slice(0, 800))}</div>`,
    n.aiDraft
      ? `<div style="border:1px solid #fde68a;background:#fffbeb;border-radius:10px;padding:14px;margin-bottom:16px"><p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:.05em">🤖 Suggested reply — review in admin</p><p style="margin:0;font-size:14px;color:#333;line-height:1.6">${br(n.aiDraft)}</p></div>`
      : '',
    `<a href="${url}" style="display:inline-block;background:#e2231a;color:#fff;font-weight:700;font-size:14px;text-decoration:none;padding:11px 24px;border-radius:999px">Open in admin →</a>`,
  ].join('');
  return { subject, text, html: shell(`${emoji} ${n.kind === 'ticket' ? 'New ticket' : 'New reply'} — ${escapeHtml(n.subject)}`.replace(/<[^>]*>/g, ''), inner, n.publicId) };
}

export function replyEmail(r: { subject: string; publicId: string; body: string }) {
  let subject = r.subject;
  if (!subject.includes(`[${r.publicId}]`)) subject = `${subject} [${r.publicId}]`;
  if (!/^re:/i.test(subject)) subject = `Re: ${subject}`;
  const text = [r.body.trim(), '', '—', 'The Found Sock Laundromat', ADDRESS, 'foundsocklaundromat.com', `Ref: [${r.publicId}]`].join('\n');
  const inner = `<p style="margin:0;font-size:15px;color:#333;line-height:1.6">${br(r.body.trim())}</p>`;
  return { subject, text, html: shell('', inner, r.publicId) };
}
