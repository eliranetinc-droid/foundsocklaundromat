import { SUPPORT_DOMAIN } from './env';

const PLUS_RE = new RegExp(`^support\\+(t[a-z2-9]{10})@${SUPPORT_DOMAIN.replace(/\./g, '\\.')}$`, 'i');

/** Layer 1: find our reply token in any recipient address. */
export function parsePlusToken(recipients: string[]): string | null {
  for (const r of recipients) {
    const m = (r ?? '').trim().match(PLUS_RE);
    if (m) return m[1].toLowerCase();
  }
  return null;
}

/** Layer 2: find [FS-XXXXX] in a subject line. */
export function parseSubjectPublicId(subject: string): string | null {
  const m = (subject ?? '').match(/\[(FS-[A-Z2-9]{5})\]/);
  return m ? m[1] : null;
}

/** Bounce / auto-responder guard. */
export function isAutoEmail(input: { from: string; autoSubmitted: string | null }): boolean {
  const auto = input.autoSubmitted?.trim().toLowerCase();
  if (auto && auto !== 'no') return true;
  return /(^|[.@_-])(mailer-daemon|postmaster|no-?reply|do-?not-?reply)([.@_-]|$)/i.test(input.from ?? '');
}

// Known false-positive tradeoff (accepted): a customer line starting with
// "From: ..." or a pasted ">"-prefixed snippet will truncate the body early.
// Rare for this audience; do not widen these patterns casually.
const QUOTE_MARKERS = [
  /^\s*>/,
  /^On .{0,300} wrote:\s*$/,
  /^-{2,}\s*Original Message\s*-{2,}/i,
  /^From:\s.+/,
  /^_{10,}\s*$/,
];

/** Keep only the new text above quoted history; fall back to full text if that removes everything. */
export function stripQuotedReply(text: string): string {
  const lines = (text ?? '').split(/\r?\n/);
  let cut = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (QUOTE_MARKERS.some((re) => re.test(lines[i]))) { cut = i; break; }
  }
  const stripped = lines.slice(0, cut).join('\n').trim();
  const full = (text ?? '').trim();
  // Short replies ("ok", "thanks") are real content — only fall back to the
  // full text when stripping removed EVERYTHING (all-quoted email).
  return stripped.length > 0 ? stripped : full;
}

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };

/** Minimal HTML → text for html-only emails. */
export function htmlToText(html: string): string {
  return (html ?? '')
    .replace(/<(br|\/p|\/div|\/tr|\/li)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    // Single-pass decode: replacements are never re-scanned, so escaped
    // entities like "&amp;lt;" correctly become the literal text "&lt;".
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (_m, e: string) => ENTITIES[e])
    .split('\n').map((l) => l.trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
