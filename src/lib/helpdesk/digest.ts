import type { HelpdeskEnv } from './env';
import { viewsInRange, sourceSplit, aiDraftStats, resolutionStats, ticketsByMachine, countOpenTickets } from './db';
import { etDay } from './pv';
import { digestEmail } from './templates';
import { sendEmail } from './resend';

/** Build + send the Monday digest. Failure-tolerant: logs and returns on any error. */
export async function sendWeeklyDigest(env: HelpdeskEnv): Promise<void> {
  try {
    const dayAgo = (n: number) => etDay(new Date(Date.now() - n * 86400000));
    const weekStart = dayAgo(7), weekEnd = dayAgo(1);
    const prevStart = dayAgo(14), prevEnd = dayAgo(8);
    const [visitors, visitorsPrev, ai, res, machines, openNow, sources] = await Promise.all([
      viewsInRange(env.DB, weekStart, weekEnd),
      viewsInRange(env.DB, prevStart, prevEnd),
      aiDraftStats(env.DB, 7),
      resolutionStats(env.DB, 7),
      ticketsByMachine(env.DB, 7, 5),
      countOpenTickets(env.DB),
      sourceSplit(env.DB, 7),
    ]);
    const tickets = sources.reduce((s, r) => s + r.n, 0);
    const prevSources = await sourceSplit(env.DB, 14);
    const ticketsPrev = Math.max(0, prevSources.reduce((s, r) => s + r.n, 0) - tickets);
    const fmt = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const e = digestEmail({
      weekLabel: `${fmt(weekStart)} – ${fmt(weekEnd)}`,
      visitors, visitorsPrev,
      tickets, ticketsPrev,
      aiHandled: ai.sent_as_is + ai.used,
      aiSuggested: ai.sent_as_is + ai.used + ai.dismissed + ai.suggested + ai.superseded,
      medianCloseHours: res.medianCloseHours,
      openNow,
      machines,
    });
    const sent = await sendEmail(env, { to: env.NOTIFY_EMAIL, subject: e.subject, text: e.text, html: e.html });
    if (!sent.ok) console.error('[digest] send failed:', sent.error);
  } catch (err) {
    console.error('[digest] failed:', err);
  }
}
