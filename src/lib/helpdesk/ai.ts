import type { HelpdeskEnv } from './env';
import { getSetting, recentOutboundPairs, getMessages, getTicket, supersedeDrafts, insertDraft } from './db';
import { selectExamples, buildPrompt, polishPrompt } from './ai-context';

export const AI_MODEL = 'claude-haiku-4-5-20251001';

/** Low-level Anthropic call. Returns the reply text, or null on SKIP / any error / no key. */
export async function draftReply(env: Pick<HelpdeskEnv, 'ANTHROPIC_API_KEY'>, p: { system: string; user: string }): Promise<string | null> {
  if (!env.ANTHROPIC_API_KEY) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: AI_MODEL, max_tokens: 500, system: p.system, messages: [{ role: 'user', content: p.user }] }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (json.content ?? []).filter(c => c.type === 'text').map(c => c.text ?? '').join('').trim();
    if (!text || text === 'SKIP') return null;
    return text;
  } catch {
    return null;
  }
}

/**
 * Generate + persist a suggested draft for a ticket. Fully failure-tolerant:
 * any problem (AI disabled, no key, API error) resolves to null and never throws.
 * Returns the draft body when one was created.
 */
export async function generateDraftForTicket(env: HelpdeskEnv, ticketId: string, triggerMessageId: number | null): Promise<string | null> {
  try {
    if ((await getSetting(env.DB, 'ai_enabled')) === '0') return null; // default (null) = enabled
    if (!env.ANTHROPIC_API_KEY) return null;

    const ticket = await getTicket(env.DB, ticketId);
    if (!ticket) return null;
    const messages = await getMessages(env.DB, ticketId);
    const inbound = messages.filter(m => m.direction === 'inbound');
    const trigger = inbound[inbound.length - 1]?.body ?? '';
    if (!trigger.trim()) return null;

    const threadText = messages.filter(m => m.direction !== 'note').slice(-10)
      .map(m => `${m.direction === 'inbound' ? 'Customer' : 'Owner'}: ${m.body}`).join('\n');
    const houseRules = (await getSetting(env.DB, 'house_rules')) ?? '';
    const pairs = await recentOutboundPairs(env.DB, 100);
    const examples = selectExamples(pairs, trigger, 12);

    const machine = ticket.machine_type
      ? `${ticket.machine_type}${ticket.machine_number ? ' #' + ticket.machine_number : ''}`
      : null;
    const { system, user } = buildPrompt({ houseRules, examples, ticketSubject: ticket.subject, threadText, source: ticket.source, machine });
    const text = await draftReply(env, { system, user });
    if (!text) return null;

    await supersedeDrafts(env.DB, ticketId);
    await insertDraft(env.DB, { ticketId, triggerMessageId, body: text, model: AI_MODEL });
    return text;
  } catch (e) {
    console.error('[ai] draft generation failed:', e);
    return null;
  }
}

/** Polish owner-typed text. Returns the polished text, or null on any failure. */
export async function polishText(env: Pick<HelpdeskEnv, 'ANTHROPIC_API_KEY'>, text: string): Promise<string | null> {
  const t = text.trim();
  if (!t) return null;
  return draftReply(env, polishPrompt(t));
}
