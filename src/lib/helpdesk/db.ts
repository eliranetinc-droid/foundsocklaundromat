import type { D1Database } from '@cloudflare/workers-types';
import type { TicketSource } from './templates';
import { etDay, etDayHour } from './pv';

export interface TicketRow {
  id: string; public_id: string; reply_token: string;
  status: 'open' | 'closed'; source: TicketSource;
  customer_name: string; customer_email: string; customer_phone: string | null;
  machine_type: string | null; machine_number: string | null;
  card_type: string | null; card_last4: string | null; loyalty_card: string | null;
  issue_date: string | null; issue_time: string | null; cost: string | null;
  photo_key: string | null; subject: string;
  created_at: string; last_activity_at: string; unread: number;
}
export interface TicketListRow extends TicketRow { snippet: string | null; }
export interface MessageRow {
  id: number; ticket_id: string; direction: 'inbound' | 'outbound' | 'note';
  body: string; from_email: string | null; email_message_id: string | null;
  attachments: string | null; created_at: string;
}

const now = () => new Date().toISOString();

export interface NewTicket {
  id: string; publicId: string; replyToken: string; source: TicketSource;
  customerName: string; customerEmail: string; customerPhone?: string | null;
  machineType?: string | null; machineNumber?: string | null;
  cardType?: string | null; cardLast4?: string | null; loyaltyCard?: string | null;
  issueDate?: string | null; issueTime?: string | null; cost?: string | null;
  photoKey?: string | null; subject: string;
}

export async function createTicket(db: D1Database, t: NewTicket): Promise<void> {
  const ts = now();
  await db.prepare(
    `INSERT INTO tickets (id, public_id, reply_token, status, source, customer_name, customer_email, customer_phone,
       machine_type, machine_number, card_type, card_last4, loyalty_card, issue_date, issue_time, cost,
       photo_key, subject, created_at, last_activity_at, unread)
     VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
  ).bind(
    t.id, t.publicId, t.replyToken, t.source, t.customerName, t.customerEmail, t.customerPhone ?? null,
    t.machineType ?? null, t.machineNumber ?? null, t.cardType ?? null, t.cardLast4 ?? null, t.loyaltyCard ?? null,
    t.issueDate ?? null, t.issueTime ?? null, t.cost ?? null, t.photoKey ?? null, t.subject, ts, ts,
  ).run();
}

export async function addMessage(db: D1Database, m: {
  ticketId: string; direction: MessageRow['direction']; body: string;
  fromEmail?: string | null; emailMessageId?: string | null; attachments?: string[] | null;
}): Promise<void> {
  await db.prepare(
    `INSERT INTO messages (ticket_id, direction, body, from_email, email_message_id, attachments, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    m.ticketId, m.direction, m.body, m.fromEmail ?? null, m.emailMessageId ?? null,
    m.attachments?.length ? JSON.stringify(m.attachments) : null, now(),
  ).run();
}

export const getTicket = (db: D1Database, id: string) =>
  db.prepare(`SELECT * FROM tickets WHERE id = ?`).bind(id).first<TicketRow>();
export const findByReplyToken = (db: D1Database, token: string) =>
  db.prepare(`SELECT * FROM tickets WHERE reply_token = ?`).bind(token).first<TicketRow>();
export const findByPublicId = (db: D1Database, pid: string) =>
  db.prepare(`SELECT * FROM tickets WHERE public_id = ?`).bind(pid).first<TicketRow>();
export const findOpenByEmail = (db: D1Database, email: string) =>
  db.prepare(`SELECT * FROM tickets WHERE customer_email = ? COLLATE NOCASE AND status = 'open'
              ORDER BY last_activity_at DESC LIMIT 1`).bind(email).first<TicketRow>();

export async function getMessages(db: D1Database, ticketId: string): Promise<MessageRow[]> {
  const { results } = await db.prepare(
    `SELECT * FROM messages WHERE ticket_id = ? ORDER BY created_at ASC, id ASC`
  ).bind(ticketId).all<MessageRow>();
  return results;
}

export async function lastInboundMessageId(db: D1Database, ticketId: string): Promise<string | null> {
  const row = await db.prepare(
    `SELECT email_message_id FROM messages
     WHERE ticket_id = ? AND direction = 'inbound' AND email_message_id IS NOT NULL
     ORDER BY created_at DESC, id DESC LIMIT 1`
  ).bind(ticketId).first<{ email_message_id: string }>();
  return row?.email_message_id ?? null;
}

export async function listTickets(db: D1Database, status: 'open' | 'closed'): Promise<TicketListRow[]> {
  const { results } = await db.prepare(
    `SELECT t.*, (SELECT body FROM messages m WHERE m.ticket_id = t.id AND m.direction != 'note'
                  ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS snippet
     FROM tickets t WHERE t.status = ? ORDER BY t.last_activity_at DESC LIMIT 200`
  ).bind(status).all<TicketListRow>();
  return results;
}

export const setStatus = (db: D1Database, id: string, status: 'open' | 'closed') =>
  db.prepare(`UPDATE tickets SET status = ? WHERE id = ?`).bind(status, id).run();
export const markRead = (db: D1Database, id: string) =>
  db.prepare(`UPDATE tickets SET unread = 0 WHERE id = ?`).bind(id).run();
export const touchActivity = (db: D1Database, id: string, unread: 0 | 1) =>
  db.prepare(`UPDATE tickets SET last_activity_at = ?, unread = ? WHERE id = ?`).bind(now(), unread, id).run();

// ---- analytics ----
// Days/hours are bucketed in America/New_York (the laundromat's zone) so the
// admin charts line up with the owner's clock. `sinceDay` is likewise ET.
export const insertPageview = (db: D1Database, pv: { path: string; referrerHost: string; country: string; device: string }) => {
  const d = new Date();
  const { day, hour } = etDayHour(d);
  return db.prepare(
    `INSERT INTO pageviews (ts, day, hour, path, referrer_host, country, device) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(d.toISOString(), day, hour, pv.path, pv.referrerHost, pv.country, pv.device).run();
};

// First ET day of a "last N days" window: N-1 days back so the inclusive
// `day >= sinceDay(N)` filter spans exactly N days (today + N-1 prior), aligning
// with the dashboard/analytics `days` arrays (which start at dayAgo(N-1)).
const sinceDay = (days: number) => etDay(new Date(Date.now() - (days - 1) * 86400000));

export async function viewsByDay(db: D1Database, days: number) {
  const { results } = await db.prepare(
    `SELECT day, COUNT(*) AS views FROM pageviews WHERE day >= ? GROUP BY day ORDER BY day ASC`
  ).bind(sinceDay(days)).all<{ day: string; views: number }>();
  return results;
}
export async function topPages(db: D1Database, days: number, limit = 10) {
  const { results } = await db.prepare(
    `SELECT path, COUNT(*) AS views FROM pageviews WHERE day >= ? GROUP BY path ORDER BY views DESC LIMIT ?`
  ).bind(sinceDay(days), limit).all<{ path: string; views: number }>();
  return results;
}
export async function topCountries(db: D1Database, days: number, limit = 8) {
  const { results } = await db.prepare(
    `SELECT COALESCE(country,'?') AS country, COUNT(*) AS views FROM pageviews WHERE day >= ?
     GROUP BY country ORDER BY views DESC LIMIT ?`
  ).bind(sinceDay(days), limit).all<{ country: string; views: number }>();
  return results;
}
export async function deviceSplit(db: D1Database, days: number) {
  const { results } = await db.prepare(
    `SELECT COALESCE(device,'?') AS device, COUNT(*) AS views FROM pageviews WHERE day >= ? GROUP BY device`
  ).bind(sinceDay(days)).all<{ device: string; views: number }>();
  return results;
}
export async function referrers(db: D1Database, days: number, limit = 8) {
  const { results } = await db.prepare(
    `SELECT COALESCE(NULLIF(referrer_host,''),'—') AS host, COUNT(*) AS views FROM pageviews WHERE day >= ?
     GROUP BY host ORDER BY views DESC LIMIT ?`
  ).bind(sinceDay(days), limit).all<{ host: string; views: number }>();
  return results;
}
export async function hoursOfDay(db: D1Database, days: number) {
  const { results } = await db.prepare(
    `SELECT hour, COUNT(*) AS views FROM pageviews WHERE day >= ? AND hour IS NOT NULL GROUP BY hour`
  ).bind(sinceDay(days)).all<{ hour: number; views: number }>();
  return results;
}
/** Total pageviews between two ET day strings, inclusive. */
export async function viewsInRange(db: D1Database, startDay: string, endDay: string): Promise<number> {
  const r = await db.prepare(
    `SELECT COUNT(*) AS c FROM pageviews WHERE day >= ? AND day <= ?`
  ).bind(startDay, endDay).first<{ c: number }>();
  return r?.c ?? 0;
}
/** Most recent individual pageviews (for the live recent-visits table). */
export async function recentPageviews(db: D1Database, limit = 20) {
  const { results } = await db.prepare(
    `SELECT ts, path, referrer_host, country, device FROM pageviews ORDER BY id DESC LIMIT ?`
  ).bind(limit).all<{ ts: string; path: string; referrer_host: string | null; country: string | null; device: string | null }>();
  return results;
}
/** Pageviews in the last N minutes — an approximate "viewing recently" count (cookie-free, no sessions). */
export async function countRecentViewers(db: D1Database, minutes = 5): Promise<number> {
  const since = new Date(Date.now() - minutes * 60000).toISOString();
  const r = await db.prepare(`SELECT COUNT(*) AS c FROM pageviews WHERE ts >= ?`).bind(since).first<{ c: number }>();
  return r?.c ?? 0;
}
export const countOpenTickets = async (db: D1Database) =>
  (await db.prepare(`SELECT COUNT(*) AS c FROM tickets WHERE status = 'open'`).first<{ c: number }>())?.c ?? 0;
export const countUnreadTickets = async (db: D1Database) =>
  (await db.prepare(`SELECT COUNT(*) AS c FROM tickets WHERE unread = 1`).first<{ c: number }>())?.c ?? 0;

export async function recentMessages(db: D1Database, limit = 8) {
  const { results } = await db.prepare(
    `SELECT m.ticket_id, m.direction, m.body, m.created_at, t.public_id, t.customer_name, t.subject
     FROM messages m JOIN tickets t ON t.id = m.ticket_id
     WHERE m.direction != 'note' ORDER BY m.created_at DESC, m.id DESC LIMIT ?`
  ).bind(limit).all<{ ticket_id: string; direction: string; body: string; created_at: string; public_id: string; customer_name: string; subject: string }>();
  return results;
}

/**
 * New tickets per ET calendar day. Bucketing is done in JS (not SQL) because
 * created_at is stored UTC and SQLite has no timezone support — grouping by
 * substr() would mis-bucket tickets created 8pm–midnight ET onto the next day.
 */
export async function ticketsPerDay(db: D1Database, days: number): Promise<{ day: string; n: number }[]> {
  const { results } = await db.prepare(
    `SELECT created_at FROM tickets WHERE created_at >= ?`
  ).bind(new Date(Date.now() - days * 86400000).toISOString()).all<{ created_at: string }>();
  const counts = new Map<string, number>();
  for (const r of results) {
    const day = etDay(new Date(r.created_at));
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return [...counts.entries()].map(([day, n]) => ({ day, n })).sort((a, b) => a.day.localeCompare(b.day));
}

export async function medianFirstReplyHours(db: D1Database, days: number): Promise<number | null> {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { results } = await db.prepare(
    `WITH firsts AS (
       SELECT t.id,
         (SELECT MIN(created_at) FROM messages m WHERE m.ticket_id=t.id AND m.direction='inbound')  AS fin,
         (SELECT MIN(created_at) FROM messages m WHERE m.ticket_id=t.id AND m.direction='outbound') AS fout
       FROM tickets t WHERE t.created_at >= ?
     )
     SELECT fin, fout FROM firsts WHERE fin IS NOT NULL AND fout IS NOT NULL AND fout > fin`
  ).bind(since).all<{ fin: string; fout: string }>();
  if (results.length === 0) return null;
  const hours = results
    .map(r => (Date.parse(r.fout) - Date.parse(r.fin)) / 3_600_000)
    .sort((a, b) => a - b);
  const mid = Math.floor(hours.length / 2);
  const med = hours.length % 2 ? hours[mid] : (hours[mid - 1] + hours[mid]) / 2;
  return Math.round(med * 10) / 10;
}

/** Open tickets that are unread OR stale (no activity in 48h), oldest first. */
export async function needsAttention(db: D1Database, staleHours = 48, limit = 20): Promise<TicketRow[]> {
  const cutoff = new Date(Date.now() - staleHours * 3_600_000).toISOString();
  const { results } = await db.prepare(
    `SELECT * FROM tickets WHERE status = 'open' AND (unread = 1 OR last_activity_at <= ?)
     ORDER BY last_activity_at ASC LIMIT ?`
  ).bind(cutoff, limit).all<TicketRow>();
  return results;
}

// ---- AI drafts + settings ----
export async function getSetting(db: D1Database, key: string): Promise<string | null> {
  const r = await db.prepare(`SELECT value FROM settings WHERE key = ?`).bind(key).first<{ value: string }>();
  return r?.value ?? null;
}
export const setSetting = (db: D1Database, key: string, value: string) =>
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(key, value).run();

/** Admin display timezone (IANA). Defaults to the laundromat's Eastern zone. */
export async function getTimezone(db: D1Database): Promise<string> {
  return (await getSetting(db, 'timezone')) ?? 'America/New_York';
}

// ---- customer history ----
/** Other tickets from the same customer email (case-insensitive), newest first. */
export async function ticketsByEmail(db: D1Database, email: string, excludeId = '', limit = 10) {
  const { results } = await db.prepare(
    `SELECT id, public_id, subject, status, created_at FROM tickets
     WHERE customer_email = ? COLLATE NOCASE AND id != ?
     ORDER BY created_at DESC LIMIT ?`
  ).bind(email, excludeId, limit).all<{ id: string; public_id: string; subject: string; status: 'open' | 'closed'; created_at: string }>();
  return results;
}
/** Total tickets per customer email (lowercased), for repeat-customer markers. */
export async function ticketCountsByEmail(db: D1Database): Promise<Map<string, number>> {
  const { results } = await db.prepare(
    `SELECT LOWER(customer_email) AS email, COUNT(*) AS n FROM tickets GROUP BY LOWER(customer_email)`
  ).all<{ email: string; n: number }>();
  return new Map(results.map(r => [r.email, r.n]));
}

export async function insertDraft(db: D1Database, d: { ticketId: string; triggerMessageId: number | null; body: string; model: string }): Promise<number> {
  const r = await db.prepare(
    `INSERT INTO ai_drafts (ticket_id, trigger_message_id, body, status, model, created_at) VALUES (?, ?, ?, 'suggested', ?, ?) RETURNING id`
  ).bind(d.ticketId, d.triggerMessageId, d.body, d.model, now()).first<{ id: number }>();
  return r?.id ?? 0;
}
export const supersedeDrafts = (db: D1Database, ticketId: string) =>
  db.prepare(`UPDATE ai_drafts SET status = 'superseded' WHERE ticket_id = ? AND status = 'suggested'`).bind(ticketId).run();
export const setDraftStatus = (db: D1Database, id: number, status: string) =>
  db.prepare(`UPDATE ai_drafts SET status = ? WHERE id = ?`).bind(status, id).run();
export const latestSuggestedDraft = (db: D1Database, ticketId: string) =>
  db.prepare(`SELECT id, body FROM ai_drafts WHERE ticket_id = ? AND status = 'suggested' ORDER BY created_at DESC, id DESC LIMIT 1`)
    .bind(ticketId).first<{ id: number; body: string }>();

/** Adjacent inbound→outbound reply pairs across recent tickets, newest first. */
export async function recentOutboundPairs(db: D1Database, limit = 60): Promise<{ inbound: string; outbound: string }[]> {
  const { results } = await db.prepare(
    `SELECT
       (SELECT body FROM messages p WHERE p.ticket_id = o.ticket_id AND p.direction='inbound' AND p.created_at <= o.created_at
        ORDER BY p.created_at DESC, p.id DESC LIMIT 1) AS inbound,
       o.body AS outbound
     FROM messages o WHERE o.direction='outbound'
     ORDER BY o.created_at DESC, o.id DESC LIMIT ?`
  ).bind(limit).all<{ inbound: string | null; outbound: string }>();
  return results.filter((r): r is { inbound: string; outbound: string } => !!r.inbound);
}
