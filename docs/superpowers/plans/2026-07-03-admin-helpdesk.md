# Admin + Helpdesk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Freshdesk with a self-hosted helpdesk: form submissions + two-way support email stored in D1/R2, a Google-login admin at `/admin` with a chat-style thread UI, and first-party analytics — all on the existing `foundsocklaundromat` Cloudflare Worker.

**Architecture:** The existing Astro 6 SSR Worker gains a D1 database (`DB`), an R2 bucket (`PHOTOS`), a custom worker entrypoint exporting an `email` handler (Cloudflare Email Routing catch-all), and outbound mail via Resend's HTTPS API as `support@foundsocklaundromat.com`. Cloudflare Access guards `/admin*` + `/api/admin*` at the edge; Astro middleware re-validates the Access JWT. Pure logic lives in `src/lib/helpdesk/*` with Vitest coverage.

**Tech Stack:** Astro 6 (SSR, Cloudflare adapter v13.5 — custom `main` entry file wrapping the adapter's `entrypoints/server` default export; NOTE: v13 has NO `workerEntryPoint` adapter option), Cloudflare D1 + R2 + Access + Email Routing, Resend API, `postal-mime` (MIME parse), `jose` (JWT verify), Tailwind v4, Vitest.

**How the custom entry works (verified against installed v13.5.1):** `@astrojs/cloudflare/entrypoints/server` exports `default { fetch: handle }`. `wrangler.jsonc`'s `main` must point to a SOURCE file that exists pre-build — `@cloudflare/vite-plugin` validates it eagerly during `astro sync` and then builds it as the worker entry, writing a deploy-redirect config (`.wrangler/deploy/config.json` → `dist/server/wrangler.json`) that `wrangler deploy` consumes. So `src/worker.ts` simply re-exports the adapter's `fetch` and adds our `email` handler.

**Spec:** `docs/superpowers/specs/2026-07-03-admin-helpdesk-design.md`

**Ground rules for every task:**
- Deploys happen ONLY via `git push` (Cloudflare Builds). NEVER `npx wrangler deploy` from this folder.
- Push with: `TOKEN=$(gh auth token --user eliranetinc-droid) && git push "https://x-access-token:${TOKEN}@github.com/eliranetinc-droid/foundsocklaundromat.git" main` — plain `git push` fails (wrong keychain account). Only push when a task says so.
- Run tests with `npm test` (vitest run). Build check with `npm run build`.
- The owner's personal email must never appear in customer-facing code, templates, or headers.

---

## File structure (end state)

```
db/schema.sql                          -- D1 schema (source of truth)
src/worker.ts                          -- custom entrypoint: fetch (Astro) + email handler
src/middleware.ts                      -- Access JWT gate for /admin*, /api/admin*
src/lib/helpdesk/env.ts                -- HelpdeskEnv types + getHelpdeskEnv()
src/lib/helpdesk/ids.ts (+.test.ts)    -- ticket id / public id / reply token generators
src/lib/helpdesk/email-match.ts (+.test.ts) -- plus-token, subject-id, auto-mail, quote-strip
src/lib/helpdesk/pv.ts (+.test.ts)     -- pageview beacon validators/classifiers
src/lib/helpdesk/templates.ts (+.test.ts) -- confirmation / notification / reply email builders
src/lib/helpdesk/resend.ts (+.test.ts) -- sendEmail() via Resend HTTPS API
src/lib/helpdesk/db.ts                 -- all D1 queries (thin, typed)
src/lib/helpdesk/inbound.ts            -- email-handler pipeline (parse→match→store→notify)
src/pages/api/pv.ts                    -- pageview beacon endpoint (public)
src/pages/api/submit-issue.ts          -- REWRITE: D1+R2+emails (was Freshdesk)
src/pages/api/submit-ticket.ts         -- REWRITE: D1+emails (was Freshdesk)
src/pages/api/admin/reply.ts           -- send reply
src/pages/api/admin/note.ts            -- private note
src/pages/api/admin/status.ts          -- open/close
src/pages/api/admin/photo/[...key].ts  -- auth-gated R2 streaming
src/components/admin/AdminLayout.astro -- admin shell (noindex, own header)
src/pages/admin/index.astro            -- dashboard
src/pages/admin/tickets/index.astro    -- inbox
src/pages/admin/tickets/[id].astro     -- thread view
src/pages/admin/analytics.astro        -- analytics
DELETED: src/lib/freshdesk.ts, src/lib/freshdesk.test.ts
MODIFIED: astro.config.mjs, wrangler.jsonc, package.json, public/robots.txt,
          src/components/Layout.astro (beacon)
```

---

### Task 1: Dependencies, schema, env plumbing, config wiring

**Files:**
- Modify: `package.json` (via npm install)
- Create: `db/schema.sql`
- Create: `src/lib/helpdesk/env.ts`
- Create: `src/worker.ts` (minimal wrapper)
- Modify: `wrangler.jsonc`
- (astro.config.mjs is NOT modified — v13 adapter has no workerEntryPoint option)

- [ ] **Step 1: Install dependencies**

```bash
cd "/Users/eliranderei/Found Sock Laundromat"
npm install postal-mime jose
npm install -D @cloudflare/workers-types
```
Expected: package.json gains `postal-mime`, `jose` (dependencies) and `@cloudflare/workers-types` (devDependencies); install exits 0.

- [ ] **Step 2: Create `db/schema.sql`** (exact content)

```sql
-- Found Sock helpdesk schema. Applied manually:
--   local dev:  npx wrangler d1 execute foundsock-helpdesk --local --file=db/schema.sql
--   production: paste into Cloudflare dashboard -> D1 -> foundsock-helpdesk -> Console
CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  reply_token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'open',
  source TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  machine_type TEXT, machine_number TEXT,
  card_type TEXT, card_last4 TEXT, loyalty_card TEXT,
  issue_date TEXT, issue_time TEXT, cost TEXT,
  photo_key TEXT,
  subject TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_activity_at TEXT NOT NULL,
  unread INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_tickets_status_activity ON tickets(status, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_email ON tickets(customer_email);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  direction TEXT NOT NULL,
  body TEXT NOT NULL,
  from_email TEXT,
  email_message_id TEXT,
  attachments TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_ticket ON messages(ticket_id, created_at);

CREATE TABLE IF NOT EXISTS pageviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  day TEXT NOT NULL,
  path TEXT NOT NULL,
  referrer_host TEXT,
  country TEXT,
  device TEXT
);
CREATE INDEX IF NOT EXISTS idx_pageviews_day ON pageviews(day);
```

- [ ] **Step 3: Create `src/lib/helpdesk/env.ts`**

```ts
import type { D1Database, R2Bucket } from '@cloudflare/workers-types';

export interface HelpdeskEnv {
  DB: D1Database;
  PHOTOS: R2Bucket;
  RESEND_API_KEY: string;
  NOTIFY_EMAIL: string;
  CF_ACCESS_TEAM_DOMAIN: string;
  CF_ACCESS_AUD: string;
}

/** Cast the Cloudflare runtime env to our typed shape (same pattern the API routes already use). */
export async function getHelpdeskEnv(): Promise<HelpdeskEnv> {
  const { env } = await import('cloudflare:workers');
  return env as unknown as HelpdeskEnv;
}

export const SITE_URL = 'https://www.foundsocklaundromat.com';
export const SUPPORT_DOMAIN = 'foundsocklaundromat.com';
export const SUPPORT_FROM = `The Found Sock Laundromat <support@${SUPPORT_DOMAIN}>`;
```
(Dynamic `import('cloudflare:workers')` so this module is safe to load during build-time prerendering.)

- [ ] **Step 4: Update `wrangler.jsonc`** — replace the whole file with:

```jsonc
{
	"compatibility_date": "2026-05-14",
	"compatibility_flags": ["global_fetch_strictly_public"],
	"name": "foundsocklaundromat",
	"account_id": "448277032c83b1f97b73d3ebeddd0712",
	"main": "./src/worker.ts",
	"assets": {
		"directory": "./dist/client",
		"binding": "ASSETS"
	},
	"observability": {
		"enabled": true
	},
	"d1_databases": [
		{ "binding": "DB", "database_name": "foundsock-helpdesk", "database_id": "REPLACE_AT_CUTOVER" }
	],
	"r2_buckets": [
		{ "binding": "PHOTOS", "bucket_name": "foundsock-photos" }
	],
	"vars": {
		"FRESHDESK_SUBDOMAIN": "eliranetinc",
		"CF_ACCESS_TEAM_DOMAIN": "REPLACE_AT_CUTOVER.cloudflareaccess.com",
		"CF_ACCESS_AUD": "REPLACE_AT_CUTOVER"
	}
}
```
`REPLACE_AT_CUTOVER` values are intentionally invalid-but-explicit; Task 18 (cutover) swaps in real values from the dashboard BEFORE the deploy push. Local dev ignores `database_id`. `main` now points at our SOURCE entry `src/worker.ts` (must exist before any build — the Cloudflare vite plugin validates it during `astro sync`); the plugin's deploy-redirect config makes `wrangler deploy` use the built artifact.

- [ ] **Step 5: Create minimal `src/worker.ts`** (astro.config.mjs stays UNCHANGED — the v13 adapter has no `workerEntryPoint` option; the custom entry is wired purely via wrangler `main`):

```ts
// Custom worker entry: wraps the Astro adapter's fetch handler so we can
// also export an email() handler (Cloudflare Email Routing) in Task 11.
// wrangler.jsonc `main` points here; @cloudflare/vite-plugin builds it.
import server from '@astrojs/cloudflare/entrypoints/server';

export default {
  fetch: server.fetch,
};
```
(TS fallback ONLY if `npm run build` fails to resolve types for that import: add `// @ts-expect-error adapter entry ships no explicit types condition` on the import line. Do not otherwise alter it.)

- [ ] **Step 6: Apply schema to LOCAL D1 + verify build**

```bash
npx wrangler d1 execute foundsock-helpdesk --local --file=db/schema.sql
npm run build
```
Expected: schema command prints executed statements (local only — no auth needed); build completes ("[build] Complete!"); the deploy-redirect artifacts exist: `test -f .wrangler/deploy/config.json && test -f dist/server/wrangler.json && echo redirect-ok` prints `redirect-ok`, and `dist/server/wrangler.json`'s `main` points at a built server file inside `dist/`.

- [ ] **Step 7: Run existing tests still pass**

```bash
npm test
```
Expected: all existing tests pass (28 at time of writing).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json db/schema.sql src/lib/helpdesk/env.ts src/worker.ts wrangler.jsonc
git commit -m "feat(helpdesk): deps, D1 schema, env plumbing, worker entrypoint scaffold"
```

---

### Task 2: ID + token generators (TDD)

**Files:**
- Create: `src/lib/helpdesk/ids.ts`
- Test: `src/lib/helpdesk/ids.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/helpdesk/ids.test.ts`:

```ts
import { test, expect, describe } from 'vitest';
import { newTicketId, newPublicId, newReplyToken } from './ids';

describe('helpdesk ids', () => {
  test('ticket id: 12 chars, url-safe alphabet', () => {
    const id = newTicketId();
    expect(id).toMatch(/^[a-z2-9]{12}$/);
    expect(newTicketId()).not.toBe(id); // random
  });

  test('public id: FS- + 5 uppercase chars', () => {
    expect(newPublicId()).toMatch(/^FS-[A-Z2-9]{5}$/);
  });

  test('reply token: t + 10 lowercase chars', () => {
    expect(newReplyToken()).toMatch(/^t[a-z2-9]{10}$/);
  });

  test('no confusing chars (0,1,i,l,o) ever appear', () => {
    for (let i = 0; i < 50; i++) {
      expect(newTicketId() + newReplyToken() + newPublicId().toLowerCase()).not.toMatch(/[01ilo]/);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- ids
```
Expected: FAIL — cannot resolve `./ids`.

- [ ] **Step 3: Implement** — `src/lib/helpdesk/ids.ts`:

```ts
// Unambiguous base32-ish alphabet: no 0/1/i/l/o.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

function randomChars(n: number): string {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

/** Internal ticket id (URL path segment in the admin). */
export const newTicketId = () => randomChars(12);
/** Customer-facing reference, e.g. FS-7K2QX. */
export const newPublicId = () => 'FS-' + randomChars(5).toUpperCase();
/** Plus-address token: support+<token>@... */
export const newReplyToken = () => 't' + randomChars(10);
```

- [ ] **Step 4: Run to verify pass**

```bash
npm test -- ids
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/helpdesk/ids.ts src/lib/helpdesk/ids.test.ts
git commit -m "feat(helpdesk): id/token generators"
```

---

### Task 3: Email matching helpers (TDD)

**Files:**
- Create: `src/lib/helpdesk/email-match.ts`
- Test: `src/lib/helpdesk/email-match.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/helpdesk/email-match.test.ts`:

```ts
import { test, expect, describe } from 'vitest';
import { parsePlusToken, parseSubjectPublicId, isAutoEmail, stripQuotedReply, htmlToText } from './email-match';

describe('parsePlusToken', () => {
  test('finds token in any recipient, case-insensitive', () => {
    expect(parsePlusToken(['support+tabc23defgh@foundsocklaundromat.com'])).toBe('tabc23defgh');
    expect(parsePlusToken(['x@y.com', 'Support+Tabc23defgh@FoundSockLaundromat.com'])).toBe('tabc23defgh');
  });
  test('null when absent or malformed', () => {
    expect(parsePlusToken(['support@foundsocklaundromat.com'])).toBeNull();
    expect(parsePlusToken(['support+bad token@foundsocklaundromat.com'])).toBeNull();
    expect(parsePlusToken([])).toBeNull();
  });
});

describe('parseSubjectPublicId', () => {
  test('extracts [FS-XXXXX]', () => {
    expect(parseSubjectPublicId('Re: We got your report [FS-7K2QX]')).toBe('FS-7K2QX');
  });
  test('null when absent', () => {
    expect(parseSubjectPublicId('hello there')).toBeNull();
    expect(parseSubjectPublicId('')).toBeNull();
  });
});

describe('isAutoEmail', () => {
  test('flags auto-submitted and daemon senders', () => {
    expect(isAutoEmail({ from: 'a@b.com', autoSubmitted: 'auto-replied' })).toBe(true);
    expect(isAutoEmail({ from: 'MAILER-DAEMON@mx.example.com', autoSubmitted: null })).toBe(true);
    expect(isAutoEmail({ from: 'no-reply@shop.com', autoSubmitted: null })).toBe(true);
    expect(isAutoEmail({ from: 'postmaster@x.com', autoSubmitted: null })).toBe(true);
  });
  test('normal mail passes', () => {
    expect(isAutoEmail({ from: 'jane@gmail.com', autoSubmitted: null })).toBe(false);
    expect(isAutoEmail({ from: 'jane@gmail.com', autoSubmitted: 'no' })).toBe(false);
    // "reply" as a bare substring must not blackhole legitimate senders
    expect(isAutoEmail({ from: 'newsletter-reply@brand.com', autoSubmitted: null })).toBe(false);
    expect(isAutoEmail({ from: 'replyto@brand.com', autoSubmitted: null })).toBe(false);
  });
});

describe('stripQuotedReply', () => {
  test('cuts at "On ... wrote:"', () => {
    const t = 'Thanks, that works!\n\nOn Thu, Jul 3, 2026 at 9:00 AM The Found Sock <support@foundsocklaundromat.com> wrote:\n> old text';
    expect(stripQuotedReply(t)).toBe('Thanks, that works!');
  });
  test('cuts at quoted lines and Original Message', () => {
    expect(stripQuotedReply('ok\n> quoted')).toBe('ok');
    expect(stripQuotedReply('ok\n-----Original Message-----\nold')).toBe('ok');
  });
  test('returns full text when stripping leaves almost nothing', () => {
    const t = '> all quoted\n> more';
    expect(stripQuotedReply(t)).toBe(t.trim());
  });
});

describe('htmlToText', () => {
  test('strips tags, keeps text, collapses whitespace', () => {
    expect(htmlToText('<div>Hello <b>world</b><br>bye</div>')).toBe('Hello world\nbye');
  });
  test('does not double-decode escaped entities', () => {
    expect(htmlToText('&amp;lt;')).toBe('&lt;');
    expect(htmlToText('a &amp; b &lt; c')).toBe('a & b < c');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- email-match
```
Expected: FAIL — cannot resolve `./email-match`.

- [ ] **Step 3: Implement** — `src/lib/helpdesk/email-match.ts`:

```ts
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
```

- [ ] **Step 4: Run to verify pass**

```bash
npm test -- email-match
```
Expected: PASS (11 tests; full suite 43).

- [ ] **Step 5: Commit**

```bash
git add src/lib/helpdesk/email-match.ts src/lib/helpdesk/email-match.test.ts
git commit -m "feat(helpdesk): inbound email matching + sanitizing helpers"
```

---

### Task 4: Pageview helpers (TDD)

**Files:**
- Create: `src/lib/helpdesk/pv.ts`
- Test: `src/lib/helpdesk/pv.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/helpdesk/pv.test.ts`:

```ts
import { test, expect, describe } from 'vitest';
import { isBotUA, classifyDevice, referrerHost, isValidPath } from './pv';

describe('isBotUA', () => {
  test('flags bots and empty UA', () => {
    expect(isBotUA('Mozilla/5.0 (compatible; Googlebot/2.1)')).toBe(true);
    expect(isBotUA('Chrome-Lighthouse')).toBe(true);
    expect(isBotUA('')).toBe(true);
    expect(isBotUA(null)).toBe(true);
  });
  test('passes real browsers', () => {
    expect(isBotUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1')).toBe(false);
  });
});

describe('classifyDevice', () => {
  test('mobile vs desktop', () => {
    expect(classifyDevice('Mozilla/5.0 (iPhone...) Mobile/15E148')).toBe('mobile');
    expect(classifyDevice('Mozilla/5.0 (Linux; Android 14)')).toBe('mobile');
    expect(classifyDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X)')).toBe('desktop');
  });
});

describe('referrerHost', () => {
  test('external host kept, self and junk dropped', () => {
    expect(referrerHost('https://www.google.com/search?q=x', 'www.foundsocklaundromat.com')).toBe('www.google.com');
    expect(referrerHost('https://www.foundsocklaundromat.com/pricing/', 'www.foundsocklaundromat.com')).toBe('');
    expect(referrerHost('not a url', 'www.foundsocklaundromat.com')).toBe('');
    expect(referrerHost('', 'www.foundsocklaundromat.com')).toBe('');
  });
});

describe('isValidPath', () => {
  test('accepts normal site paths', () => {
    expect(isValidPath('/')).toBe(true);
    expect(isValidPath('/blog/how-to-wash-a-comforter/')).toBe(true);
  });
  test('rejects admin, api, junk', () => {
    expect(isValidPath('/admin')).toBe(false);
    expect(isValidPath('/admin/tickets')).toBe(false);
    expect(isValidPath('/api/pv')).toBe(false);
    expect(isValidPath('nope')).toBe(false);
    expect(isValidPath('/' + 'x'.repeat(200))).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- pv
```
Expected: FAIL — cannot resolve `./pv`.

- [ ] **Step 3: Implement** — `src/lib/helpdesk/pv.ts`:

```ts
export function isBotUA(ua: string | null): boolean {
  if (!ua) return true;
  return /bot|crawl|spider|slurp|lighthouse|pagespeed|headless|preview|monitor|fetch|curl|python/i.test(ua);
}

export function classifyDevice(ua: string | null): 'mobile' | 'desktop' {
  return /Mobi|Android|iPhone|iPad/i.test(ua ?? '') ? 'mobile' : 'desktop';
}

export function referrerHost(referrer: string, selfHost: string): string {
  try {
    const host = new URL(referrer).host;
    return host === selfHost ? '' : host;
  } catch {
    return '';
  }
}

export function isValidPath(p: unknown): p is string {
  return typeof p === 'string'
    && p.startsWith('/')
    && p.length <= 200
    && !p.startsWith('/api')
    && !p.startsWith('/admin');
}
```

- [ ] **Step 4: Run to verify pass**

```bash
npm test -- pv
```
Expected: PASS (6 tests; full suite 49).

- [ ] **Step 5: Commit**

```bash
git add src/lib/helpdesk/pv.ts src/lib/helpdesk/pv.test.ts
git commit -m "feat(helpdesk): pageview validation/classification helpers"
```

---

### Task 5: Email templates (TDD)

**Files:**
- Create: `src/lib/helpdesk/templates.ts`
- Test: `src/lib/helpdesk/templates.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/helpdesk/templates.test.ts`:

```ts
import { test, expect, describe } from 'vitest';
import { confirmationEmail, notificationEmail, replyEmail } from './templates';

describe('confirmationEmail', () => {
  test('form variant references report + public id, no personal identity', () => {
    const e = confirmationEmail({ publicId: 'FS-7K2QX', source: 'issue-form', customerName: 'Jane' });
    expect(e.subject).toBe('We got your report [FS-7K2QX]');
    expect(e.text).toContain('Jane');
    expect(e.text).toContain('FS-7K2QX');
    expect(e.text).toContain('reply to this email');
    expect(e.text.toLowerCase()).not.toContain('eliran');
    expect(e.text.toLowerCase()).not.toContain('gmail');
  });
  test('email/contact variant says message', () => {
    expect(confirmationEmail({ publicId: 'FS-AAAAA', source: 'email', customerName: 'Bob' }).subject)
      .toBe('We got your message [FS-AAAAA]');
    expect(confirmationEmail({ publicId: 'FS-AAAAA', source: 'contact-form', customerName: 'Bob' }).subject)
      .toBe('We got your message [FS-AAAAA]');
  });
});

describe('notificationEmail', () => {
  test('links to the admin thread', () => {
    const e = notificationEmail({ publicId: 'FS-7K2QX', ticketId: 'abcabcabcabc', kind: 'ticket', subject: 'Issue: Washer #7', customerName: 'Jane', snippet: 'It ate my money' });
    expect(e.subject).toBe('[FS-7K2QX] New ticket: Issue: Washer #7');
    expect(e.text).toContain('https://www.foundsocklaundromat.com/admin/tickets/abcabcabcabc');
    expect(e.text).toContain('Jane');
    expect(e.text).toContain('It ate my money');
  });
  test('message kind', () => {
    const e = notificationEmail({ publicId: 'FS-7K2QX', ticketId: 'x', kind: 'message', subject: 's', customerName: 'J', snippet: 'hi' });
    expect(e.subject).toBe('[FS-7K2QX] New message: s');
  });
});

describe('replyEmail', () => {
  test('subject threads with Re: and [id]; body has footer with ref', () => {
    const e = replyEmail({ subject: 'Issue: Washer #7', publicId: 'FS-7K2QX', body: 'Refund sent to your card.' });
    expect(e.subject).toBe('Re: Issue: Washer #7 [FS-7K2QX]');
    expect(e.text).toContain('Refund sent to your card.');
    expect(e.text).toContain('The Found Sock Laundromat');
    expect(e.text).toContain('Ref: [FS-7K2QX]');
    expect(e.html).toContain('Refund sent to your card.');
  });
  test('does not double the Re: or the [id]', () => {
    const e = replyEmail({ subject: 'Re: Issue [FS-7K2QX]', publicId: 'FS-7K2QX', body: 'x' });
    expect(e.subject).toBe('Re: Issue [FS-7K2QX]');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- templates
```
Expected: FAIL — cannot resolve `./templates`.

- [ ] **Step 3: Implement** — `src/lib/helpdesk/templates.ts`:

```ts
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
```

- [ ] **Step 4: Run to verify pass**

```bash
npm test -- templates
```
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/helpdesk/templates.ts src/lib/helpdesk/templates.test.ts
git commit -m "feat(helpdesk): email templates (confirmation, owner notification, reply)"
```

---

### Task 6: Resend sender (TDD with mocked fetch)

**Files:**
- Create: `src/lib/helpdesk/resend.ts`
- Test: `src/lib/helpdesk/resend.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/helpdesk/resend.test.ts`:

```ts
import { test, expect, describe, vi, beforeEach, afterEach } from 'vitest';
import { sendEmail } from './resend';

const env = { RESEND_API_KEY: 'rk_test' } as never;

describe('sendEmail', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  test('posts correct payload; reply token becomes plus-address Reply-To', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response(JSON.stringify({ id: 'msg_1' }), { status: 200 }));
    const res = await sendEmail(env, {
      to: 'jane@gmail.com', subject: 'Hi', text: 'body',
      replyToken: 'tabc23defgh', inReplyTo: '<x@mail.gmail.com>',
    });
    expect(res).toEqual({ ok: true, id: 'msg_1' });
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.Authorization).toBe('Bearer rk_test');
    const payload = JSON.parse(init.body);
    expect(payload.from).toBe('The Found Sock Laundromat <support@foundsocklaundromat.com>');
    expect(payload.to).toEqual(['jane@gmail.com']);
    expect(payload.reply_to).toBe('support+tabc23defgh@foundsocklaundromat.com');
    expect(payload.headers['In-Reply-To']).toBe('<x@mail.gmail.com>');
    expect(payload.headers.References).toBe('<x@mail.gmail.com>');
  });

  test('no token → no reply_to; no inReplyTo → no headers key', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response(JSON.stringify({ id: 'msg_2' }), { status: 200 }));
    await sendEmail(env, { to: 'a@b.com', subject: 's', text: 't' });
    const payload = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(payload.reply_to).toBeUndefined();
    expect(payload.headers).toBeUndefined();
  });

  test('non-200 → ok:false with error text', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response('{"message":"invalid"}', { status: 422 }));
    const res = await sendEmail(env, { to: 'a@b.com', subject: 's', text: 't' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('422');
  });

  test('fetch throw → ok:false', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network'));
    const res = await sendEmail(env, { to: 'a@b.com', subject: 's', text: 't' });
    expect(res.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test -- resend
```
Expected: FAIL — cannot resolve `./resend`.

- [ ] **Step 3: Implement** — `src/lib/helpdesk/resend.ts`:

```ts
import { SUPPORT_DOMAIN, SUPPORT_FROM, type HelpdeskEnv } from './env';

export interface SendOpts {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** When set, customers replying will hit support+<token>@ — our thread key. */
  replyToken?: string;
  inReplyTo?: string;
}
export type SendResult = { ok: true; id: string } | { ok: false; error: string };

export async function sendEmail(env: Pick<HelpdeskEnv, 'RESEND_API_KEY'>, opts: SendOpts): Promise<SendResult> {
  const payload: Record<string, unknown> = {
    from: SUPPORT_FROM,
    to: [opts.to],
    subject: opts.subject,
    text: opts.text,
  };
  if (opts.html) payload.html = opts.html;
  if (opts.replyToken) payload.reply_to = `support+${opts.replyToken}@${SUPPORT_DOMAIN}`;
  if (opts.inReplyTo) payload.headers = { 'In-Reply-To': opts.inReplyTo, References: opts.inReplyTo };

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { ok: false, error: `resend ${res.status}: ${detail.slice(0, 300)}` };
    }
    const json = (await res.json()) as { id: string };
    return { ok: true, id: json.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
```

- [ ] **Step 4: Run to verify pass**

```bash
npm test -- resend
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/helpdesk/resend.ts src/lib/helpdesk/resend.test.ts
git commit -m "feat(helpdesk): Resend sender with identity-safe From/Reply-To"
```

---

### Task 7: D1 data layer

**Files:**
- Create: `src/lib/helpdesk/db.ts`

No unit tests (thin SQL wrappers over D1; covered by build + E2E). Keep every function tiny.

- [ ] **Step 1: Create `src/lib/helpdesk/db.ts`**

```ts
import type { D1Database } from '@cloudflare/workers-types';
import type { TicketSource } from './templates';

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
export const insertPageview = (db: D1Database, pv: { path: string; referrerHost: string; country: string; device: string }) => {
  const ts = now();
  return db.prepare(
    `INSERT INTO pageviews (ts, day, path, referrer_host, country, device) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(ts, ts.slice(0, 10), pv.path, pv.referrerHost, pv.country, pv.device).run();
};

const sinceDay = (days: number) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

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
```

- [ ] **Step 2: Type-check via build**

```bash
npm run build
```
Expected: Complete! (No route uses db.ts yet — this is a compile check.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/helpdesk/db.ts
git commit -m "feat(helpdesk): D1 data layer"
```

---

### Task 8: Rewrite both submission endpoints → helpdesk pipeline

**Files:**
- Modify: `src/pages/api/submit-issue.ts` (full replacement)
- Modify: `src/pages/api/submit-ticket.ts` (full replacement)
- Create: `src/lib/helpdesk/intake.ts` (shared create-ticket pipeline)

- [ ] **Step 1: Create `src/lib/helpdesk/intake.ts`** (shared by both endpoints + inbound email):

```ts
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
```

- [ ] **Step 2: Replace `src/pages/api/submit-issue.ts`** with:

```ts
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
    return jsonResponse({ error: 'unexpected_error', detail: e instanceof Error ? e.message : String(e) }, 500);
  }
};
```

- [ ] **Step 3: Replace `src/pages/api/submit-ticket.ts`** with:

```ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { getHelpdeskEnv } from '../../lib/helpdesk/env';
import { intakeTicket } from '../../lib/helpdesk/intake';

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

function jsonResponse(body: object, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export const POST: APIRoute = async ({ request }) => {
  try {
    let payload: Record<string, unknown>;
    try {
      payload = await request.json();
    } catch {
      return jsonResponse({ error: 'invalid_json' }, 400);
    }

    const { name, email, message, type } = payload as Record<string, string>;
    if (!name || name.length < 1 || name.length > 100)            return jsonResponse({ error: 'invalid_name' }, 400);
    if (!email || !isEmail(email))                                return jsonResponse({ error: 'invalid_email' }, 400);
    if (!message || message.length < 1 || message.length > 5000)  return jsonResponse({ error: 'invalid_message' }, 400);
    if (type !== 'issue' && type !== 'general')                    return jsonResponse({ error: 'invalid_type' }, 400);

    const env = await getHelpdeskEnv();
    const { publicId } = await intakeTicket(env, {
      source: 'contact-form',
      customerName: name,
      customerEmail: email,
      subject: type === 'issue' ? `Issue from ${name}` : `Contact form message`,
      body: message,
    });

    return jsonResponse({ ok: true, ticketId: publicId }, 200);
  } catch (e) {
    console.error('[submit-ticket] uncaught error:', e);
    return jsonResponse({ error: 'unexpected_error', detail: e instanceof Error ? e.message : String(e) }, 500);
  }
};
```

- [ ] **Step 4: Build + tests**

```bash
npm run build && npm test
```
Expected: build Complete!; all tests pass. (Freshdesk lib still present but now unimported by routes — removed in Task 16.)

- [ ] **Step 5: Local smoke test** (dev server has local D1/R2 via platform proxy):

```bash
npm run dev &
sleep 6
curl -s -X POST http://localhost:4321/api/submit-ticket -H 'Content-Type: application/json' \
  -d '{"name":"Test","email":"t@example.com","message":"local pipeline check","type":"general"}'
kill %1
```
Expected: `{"ok":true,"ticketId":"FS-....."}`. (Confirmation/notification sends will log errors locally — RESEND_API_KEY/NOTIFY_EMAIL are unset in dev; that is the designed failure-tolerant path.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/helpdesk/intake.ts src/pages/api/submit-issue.ts src/pages/api/submit-ticket.ts
git commit -m "feat(helpdesk): forms write to D1/R2 with confirmation + notification emails"
```

---

### Task 9: Pageview endpoint + beacon + robots

**Files:**
- Create: `src/pages/api/pv.ts`
- Modify: `src/components/Layout.astro` (add beacon before `</body>`)
- Modify: `public/robots.txt` (Disallow /admin/)

- [ ] **Step 1: Create `src/pages/api/pv.ts`**

```ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { getHelpdeskEnv } from '../../lib/helpdesk/env';
import { insertPageview } from '../../lib/helpdesk/db';
import { isBotUA, classifyDevice, referrerHost, isValidPath } from '../../lib/helpdesk/pv';

const NO_CONTENT = () => new Response(null, { status: 204 });

export const POST: APIRoute = async ({ request }) => {
  try {
    const ua = request.headers.get('user-agent');
    if (isBotUA(ua)) return NO_CONTENT();

    let data: { p?: unknown; r?: unknown };
    try {
      data = JSON.parse(await request.text());
    } catch {
      return NO_CONTENT();
    }
    if (!isValidPath(data.p)) return NO_CONTENT();

    const env = await getHelpdeskEnv();
    const selfHost = new URL(request.url).host;
    // request.cf is present on Cloudflare; absent in local dev.
    const country = ((request as unknown as { cf?: { country?: string } }).cf?.country) ?? '';

    await insertPageview(env.DB, {
      path: data.p,
      referrerHost: referrerHost(typeof data.r === 'string' ? data.r : '', selfHost),
      country,
      device: classifyDevice(ua),
    });
    return NO_CONTENT();
  } catch {
    return NO_CONTENT(); // never fail the page over analytics
  }
};
```

- [ ] **Step 2: Add the beacon to `src/components/Layout.astro`** — change the body block to:

```astro
  <body class="bg-white text-brand-blue-darker antialiased">
    <Header />
    <main>
      <slot />
    </main>
    <Footer />
    <script is:inline>
      // First-party pageview ping. No cookies, no identifiers. ~200 bytes.
      if (!location.pathname.startsWith('/admin')) {
        addEventListener('load', function () {
          try {
            navigator.sendBeacon('/api/pv', JSON.stringify({ p: location.pathname, r: document.referrer }));
          } catch (e) {}
        });
      }
    </script>
  </body>
```

- [ ] **Step 3: robots.txt** — change the final block of `public/robots.txt` to:

```
# Everything else
User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin/

Sitemap: https://www.foundsocklaundromat.com/sitemap-index.xml
```

- [ ] **Step 4: Build + local check**

```bash
npm run build
npm run dev &
sleep 6
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4321/api/pv \
  -H 'User-Agent: Mozilla/5.0 (iPhone)' -d '{"p":"/pricing/","r":"https://www.google.com/"}'
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4321/api/pv \
  -H 'User-Agent: Googlebot' -d '{"p":"/pricing/"}'
kill %1
```
Expected: `204` and `204` (bot silently dropped — same status by design).

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/pv.ts src/components/Layout.astro public/robots.txt
git commit -m "feat(helpdesk): first-party pageview beacon + endpoint; robots disallow /admin"
```

---

### Task 10: Access-JWT middleware

**Files:**
- Create: `src/middleware.ts`

- [ ] **Step 1: Create `src/middleware.ts`**

```ts
import { defineMiddleware } from 'astro:middleware';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const PROTECTED = (path: string) => path.startsWith('/admin') || path.startsWith('/api/admin');

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  if (!PROTECTED(pathname)) return next();

  // Local dev: no Access in front of localhost.
  if (import.meta.env.DEV) return next();

  const forbidden = () => new Response('Forbidden', { status: 403 });
  try {
    const { env } = await import('cloudflare:workers');
    const teamDomain = (env as Record<string, unknown>).CF_ACCESS_TEAM_DOMAIN as string | undefined;
    const aud = (env as Record<string, unknown>).CF_ACCESS_AUD as string | undefined;
    if (!teamDomain || !aud) return forbidden(); // fail closed on misconfig

    const token = context.request.headers.get('Cf-Access-Jwt-Assertion');
    if (!token) return forbidden();

    jwks ??= createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
    await jwtVerify(token, jwks, { audience: aud, issuer: `https://${teamDomain}` });
    return next();
  } catch {
    return forbidden();
  }
});
```

- [ ] **Step 2: Build check** (middleware runs during prerender for static pages — must not touch env on public paths):

```bash
npm run build
```
Expected: Complete! with all static pages prerendered (the `/admin` guard only executes for SSR requests).

- [ ] **Step 3: Commit**

```bash
git add src/middleware.ts
git commit -m "feat(helpdesk): Cloudflare Access JWT middleware for /admin and /api/admin (fail closed)"
```

---

### Task 11: Inbound email pipeline + real worker entrypoint

**Files:**
- Create: `src/lib/helpdesk/inbound.ts`
- Modify: `src/worker.ts` (add email handler)

- [ ] **Step 1: Create `src/lib/helpdesk/inbound.ts`**

```ts
import PostalMime from 'postal-mime';
import type { ForwardableEmailMessage } from '@cloudflare/workers-types';
import type { HelpdeskEnv } from './env';
import { parsePlusToken, parseSubjectPublicId, isAutoEmail, stripQuotedReply, htmlToText } from './email-match';
import { findByReplyToken, findByPublicId, findOpenByEmail, addMessage, setStatus, touchActivity, type TicketRow } from './db';
import { intakeTicket, sanitizeFilename } from './intake';
import { notificationEmail } from './templates';
import { sendEmail } from './resend';

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENTS = 5;

export async function handleInboundEmail(message: ForwardableEmailMessage, env: HelpdeskEnv): Promise<void> {
  const parsed = await PostalMime.parse(message.raw);

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

  const note = notificationEmail({
    publicId: ticket.public_id, ticketId: ticket.id, kind: 'message',
    subject: ticket.subject, customerName: ticket.customer_name, snippet: body || '[image attachment]',
  });
  const sent = await sendEmail(env, { to: env.NOTIFY_EMAIL, subject: note.subject, text: note.text });
  if (!sent.ok) console.error('[helpdesk] inbound notification failed:', sent.error);
}
```

- [ ] **Step 2: Replace `src/worker.ts`** with the full version (same wrapper pattern established in Task 1 — do NOT reintroduce `createExports`; the v13 adapter entry is a plain `default { fetch }`):

```ts
// Custom worker entry: wraps the Astro adapter's fetch handler and adds the
// email() handler that Cloudflare Email Routing (catch-all) delivers to.
// wrangler.jsonc `main` points here; @cloudflare/vite-plugin builds it.
import server from '@astrojs/cloudflare/entrypoints/server';
import type { ExecutionContext, ForwardableEmailMessage } from '@cloudflare/workers-types';
import { handleInboundEmail } from './lib/helpdesk/inbound';
import type { HelpdeskEnv } from './lib/helpdesk/env';

export default {
  fetch: server.fetch,
  async email(message: ForwardableEmailMessage, env: HelpdeskEnv, _ctx: ExecutionContext) {
    try {
      await handleInboundEmail(message, env);
    } catch (e) {
      console.error('[helpdesk] inbound email failed:', e);
      // Do not rethrow: rejecting would bounce the sender's email.
    }
  },
};
```
(Keep any `// @ts-expect-error` that Task 1 needed on the `server` import.)

- [ ] **Step 3: Build + tests**

```bash
npm run build && npm test
```
Expected: build Complete! (verify redirect artifacts: `test -f .wrangler/deploy/config.json && test -f dist/server/wrangler.json && echo redirect-ok`); tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/helpdesk/inbound.ts src/worker.ts
git commit -m "feat(helpdesk): inbound email pipeline (parse->match->store->notify) wired into worker email handler"
```

---

### Task 12: Admin API routes

**Files:**
- Create: `src/pages/api/admin/reply.ts`
- Create: `src/pages/api/admin/note.ts`
- Create: `src/pages/api/admin/status.ts`
- Create: `src/pages/api/admin/photo/[...key].ts`

- [ ] **Step 1: Create `src/pages/api/admin/reply.ts`**

```ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { getHelpdeskEnv } from '../../../lib/helpdesk/env';
import { getTicket, addMessage, markRead, touchActivity, lastInboundMessageId } from '../../../lib/helpdesk/db';
import { replyEmail } from '../../../lib/helpdesk/templates';
import { sendEmail } from '../../../lib/helpdesk/resend';

const json = (body: object, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  let payload: { ticketId?: string; body?: string };
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const ticketId = (payload.ticketId ?? '').trim();
  const body = (payload.body ?? '').trim();
  if (!ticketId) return json({ error: 'missing_ticket' }, 400);
  if (!body || body.length > 10000) return json({ error: 'invalid_body' }, 400);

  const env = await getHelpdeskEnv();
  const ticket = await getTicket(env.DB, ticketId);
  if (!ticket) return json({ error: 'not_found' }, 404);

  const tpl = replyEmail({ subject: ticket.subject, publicId: ticket.public_id, body });
  const inReplyTo = await lastInboundMessageId(env.DB, ticket.id);
  const sent = await sendEmail(env, {
    to: ticket.customer_email,
    subject: tpl.subject,
    text: tpl.text,
    html: tpl.html,
    replyToken: ticket.reply_token,
    inReplyTo: inReplyTo ?? undefined,
  });
  if (!sent.ok) return json({ error: 'send_failed', detail: sent.error }, 502);

  await addMessage(env.DB, { ticketId: ticket.id, direction: 'outbound', body, fromEmail: null, emailMessageId: sent.id });
  await touchActivity(env.DB, ticket.id, 0);
  await markRead(env.DB, ticket.id);
  return json({ ok: true }, 200);
};
```

- [ ] **Step 2: Create `src/pages/api/admin/note.ts`**

```ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { getHelpdeskEnv } from '../../../lib/helpdesk/env';
import { getTicket, addMessage } from '../../../lib/helpdesk/db';

const json = (body: object, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  let payload: { ticketId?: string; body?: string };
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const ticketId = (payload.ticketId ?? '').trim();
  const body = (payload.body ?? '').trim();
  if (!ticketId) return json({ error: 'missing_ticket' }, 400);
  if (!body || body.length > 10000) return json({ error: 'invalid_body' }, 400);

  const env = await getHelpdeskEnv();
  if (!(await getTicket(env.DB, ticketId))) return json({ error: 'not_found' }, 404);
  await addMessage(env.DB, { ticketId, direction: 'note', body });
  return json({ ok: true }, 200);
};
```

- [ ] **Step 3: Create `src/pages/api/admin/status.ts`**

```ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { getHelpdeskEnv } from '../../../lib/helpdesk/env';
import { getTicket, setStatus } from '../../../lib/helpdesk/db';

const json = (body: object, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  let payload: { ticketId?: string; status?: string };
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const ticketId = (payload.ticketId ?? '').trim();
  const status = payload.status;
  if (!ticketId) return json({ error: 'missing_ticket' }, 400);
  if (status !== 'open' && status !== 'closed') return json({ error: 'invalid_status' }, 400);

  const env = await getHelpdeskEnv();
  if (!(await getTicket(env.DB, ticketId))) return json({ error: 'not_found' }, 404);
  await setStatus(env.DB, ticketId, status);
  return json({ ok: true }, 200);
};
```

- [ ] **Step 4: Create `src/pages/api/admin/photo/[...key].ts`**

```ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { getHelpdeskEnv } from '../../../../lib/helpdesk/env';

export const GET: APIRoute = async ({ params }) => {
  const key = params.key ?? '';
  // Only our two known prefixes are servable.
  if (!/^(form|inbound)\/[\w-]+\/[\w.\-]+$/.test(key)) return new Response('Not found', { status: 404 });

  const env = await getHelpdeskEnv();
  const obj = await env.PHOTOS.get(key);
  if (!obj) return new Response('Not found', { status: 404 });

  return new Response(obj.body as unknown as BodyInit, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
```

- [ ] **Step 5: Build**

```bash
npm run build
```
Expected: Complete!.

- [ ] **Step 6: Commit**

```bash
git add src/pages/api/admin
git commit -m "feat(helpdesk): admin APIs (reply, note, status, photo streaming)"
```

---

### Task 13: Admin layout + dashboard + inbox

**Files:**
- Create: `src/components/admin/AdminLayout.astro`
- Create: `src/pages/admin/index.astro`
- Create: `src/pages/admin/tickets/index.astro`

- [ ] **Step 1: Create `src/components/admin/AdminLayout.astro`**

```astro
---
import '../../styles/global.css';

export interface Props { title: string; }
const { title } = Astro.props;
const nav = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/tickets', label: 'Tickets' },
  { href: '/admin/analytics', label: 'Analytics' },
];
const path = Astro.url.pathname.replace(/\/$/, '');
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <title>{title} · Found Sock Admin</title>
  </head>
  <body class="bg-cream text-brand-blue-darker antialiased min-h-screen">
    <header class="bg-brand-blue-darker text-white">
      <div class="max-w-5xl mx-auto px-5 py-3 flex items-center justify-between">
        <a href="/admin" class="font-bold tracking-tight">Found Sock <span class="opacity-60 font-normal">Admin</span></a>
        <nav class="flex gap-5 text-sm">
          {nav.map(item => (
            <a href={item.href}
               class:list={['hover:text-white transition-colors', path === item.href ? 'text-white font-semibold' : 'text-white/70']}>
              {item.label}
            </a>
          ))}
          <a href="/" class="text-white/50 hover:text-white">View site →</a>
        </nav>
      </div>
    </header>
    <main class="max-w-5xl mx-auto px-5 py-8">
      <slot />
    </main>
  </body>
</html>
```

- [ ] **Step 2: Create `src/pages/admin/index.astro`** (dashboard)

```astro
---
export const prerender = false;

import AdminLayout from '../../components/admin/AdminLayout.astro';
import { getHelpdeskEnv } from '../../lib/helpdesk/env';
import { countOpenTickets, countUnreadTickets, recentMessages, viewsByDay } from '../../lib/helpdesk/db';

const env = await getHelpdeskEnv();
const [openCount, unreadCount, recent, views] = await Promise.all([
  countOpenTickets(env.DB),
  countUnreadTickets(env.DB),
  recentMessages(env.DB, 8),
  viewsByDay(env.DB, 14),
]);
const maxViews = Math.max(1, ...views.map(v => v.views));
const fmt = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
---
<AdminLayout title="Dashboard">
  <h1 class="text-3xl font-bold tracking-tight mb-6">Dashboard</h1>

  <div class="grid grid-cols-2 gap-4 mb-8 max-w-md">
    <a href="/admin/tickets" class="bg-white rounded-2xl border border-line p-5 hover:border-brand-blue/40">
      <p class="text-4xl font-bold">{openCount}</p>
      <p class="text-xs uppercase tracking-widest opacity-60 mt-1">Open tickets</p>
    </a>
    <a href="/admin/tickets" class="bg-white rounded-2xl border border-line p-5 hover:border-brand-blue/40">
      <p class="text-4xl font-bold text-brand-red">{unreadCount}</p>
      <p class="text-xs uppercase tracking-widest opacity-60 mt-1">Unread</p>
    </a>
  </div>

  <h2 class="text-xs uppercase tracking-[0.2em] text-brand-blue font-bold mb-3">Last 14 days — visitors</h2>
  <div class="bg-white rounded-2xl border border-line p-5 mb-8">
    {views.length === 0 ? <p class="text-sm opacity-60">No data yet.</p> : (
      <div class="flex items-end gap-1 h-24">
        {views.map(v => (
          <div class="flex-1 bg-brand-blue/80 rounded-t" style={`height:${Math.max(4, Math.round((v.views / maxViews) * 100))}%`} title={`${v.day}: ${v.views}`}></div>
        ))}
      </div>
    )}
  </div>

  <h2 class="text-xs uppercase tracking-[0.2em] text-brand-blue font-bold mb-3">Recent activity</h2>
  <div class="space-y-2">
    {recent.length === 0 && <p class="text-sm opacity-60">No messages yet.</p>}
    {recent.map(m => (
      <a href={`/admin/tickets/${m.ticket_id}`} class="block bg-white rounded-xl border border-line px-4 py-3 hover:border-brand-blue/40">
        <div class="flex justify-between gap-3 text-xs opacity-60 mb-0.5">
          <span>{m.public_id} · {m.customer_name} · {m.direction === 'inbound' ? 'customer' : 'you'}</span>
          <span>{fmt(m.created_at)}</span>
        </div>
        <p class="text-sm truncate">{m.body}</p>
      </a>
    ))}
  </div>
</AdminLayout>
```

- [ ] **Step 3: Create `src/pages/admin/tickets/index.astro`** (inbox)

```astro
---
export const prerender = false;

import AdminLayout from '../../../components/admin/AdminLayout.astro';
import { getHelpdeskEnv } from '../../../lib/helpdesk/env';
import { listTickets } from '../../../lib/helpdesk/db';

const status = Astro.url.searchParams.get('status') === 'closed' ? 'closed' : 'open';
const env = await getHelpdeskEnv();
const tickets = await listTickets(env.DB, status);
const fmt = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const sourceBadge: Record<string, string> = { 'issue-form': 'Issue', 'contact-form': 'Contact', email: 'Email' };
---
<AdminLayout title="Tickets">
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-3xl font-bold tracking-tight">Tickets</h1>
    <div class="flex gap-2 text-sm font-semibold">
      <a href="/admin/tickets" class:list={['px-4 py-2 rounded-full border', status === 'open' ? 'bg-brand-blue text-white border-brand-blue' : 'bg-white border-line']}>Open</a>
      <a href="/admin/tickets?status=closed" class:list={['px-4 py-2 rounded-full border', status === 'closed' ? 'bg-brand-blue text-white border-brand-blue' : 'bg-white border-line']}>Closed</a>
    </div>
  </div>

  {tickets.length === 0 && <p class="text-sm opacity-60">No {status} tickets.</p>}
  <div class="space-y-2">
    {tickets.map(t => (
      <a href={`/admin/tickets/${t.id}`} class="block bg-white rounded-xl border border-line px-4 py-3 hover:border-brand-blue/40">
        <div class="flex items-center justify-between gap-3 mb-0.5">
          <div class="flex items-center gap-2 min-w-0">
            {t.unread === 1 && <span class="w-2 h-2 rounded-full bg-brand-red shrink-0" title="Unread"></span>}
            <span class:list={['truncate', t.unread === 1 ? 'font-bold' : 'font-semibold']}>{t.customer_name}</span>
            <span class="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-brand-blue/10 text-brand-blue shrink-0">{sourceBadge[t.source] ?? t.source}</span>
          </div>
          <span class="text-xs opacity-60 shrink-0">{fmt(t.last_activity_at)}</span>
        </div>
        <p class:list={['text-sm truncate', t.unread === 1 ? 'font-semibold' : '']}>{t.public_id} — {t.subject}</p>
        {t.snippet && <p class="text-sm opacity-60 truncate">{t.snippet}</p>}
      </a>
    ))}
  </div>
</AdminLayout>
```

- [ ] **Step 4: Build + eyeball locally**

```bash
npm run build
npm run dev &
sleep 6
curl -s http://localhost:4321/admin/ | grep -o '<title>[^<]*</title>'
curl -s "http://localhost:4321/admin/tickets/" | grep -c 'Tickets'
kill %1
```
Expected: `<title>Dashboard · Found Sock Admin</title>`; count ≥ 1. (DEV bypasses Access.)

- [ ] **Step 5: Commit**

```bash
git add src/components/admin src/pages/admin/index.astro src/pages/admin/tickets/index.astro
git commit -m "feat(helpdesk): admin layout, dashboard, ticket inbox"
```

---

### Task 14: Thread view (chat UI + reply/note/status)

**Files:**
- Create: `src/pages/admin/tickets/[id].astro`

- [ ] **Step 1: Create `src/pages/admin/tickets/[id].astro`**

```astro
---
export const prerender = false;

import AdminLayout from '../../../components/admin/AdminLayout.astro';
import { getHelpdeskEnv } from '../../../lib/helpdesk/env';
import { getTicket, getMessages, markRead } from '../../../lib/helpdesk/db';

const id = Astro.params.id ?? '';
const env = await getHelpdeskEnv();
const ticket = await getTicket(env.DB, id);
if (!ticket) return new Response('Not found', { status: 404 });

const messages = await getMessages(env.DB, ticket.id);
if (ticket.unread === 1) await markRead(env.DB, ticket.id);

const fmt = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const details: [string, string | null][] = [
  ['Email', ticket.customer_email],
  ['Phone', ticket.customer_phone],
  ['Machine', ticket.machine_type ? `${ticket.machine_type}${ticket.machine_number ? ' #' + ticket.machine_number : ''}` : null],
  ['Date/time', ticket.issue_date ? `${ticket.issue_date} ${ticket.issue_time ?? ''}` : null],
  ['Card', ticket.card_type ? `${ticket.card_type}${ticket.card_last4 ? ' • ' + ticket.card_last4 : ''}${ticket.loyalty_card ? ' • ' + ticket.loyalty_card : ''}` : null],
  ['Cost', ticket.cost ? `$${ticket.cost}` : null],
  ['Source', ticket.source],
  ['Created', fmt(ticket.created_at)],
];
const atts = (json: string | null): string[] => { try { return JSON.parse(json ?? '[]'); } catch { return []; } };
---
<AdminLayout title={ticket.public_id}>
  <a href="/admin/tickets" class="text-sm text-brand-blue font-semibold hover:text-brand-red">← All tickets</a>

  <div class="flex items-start justify-between gap-4 mt-2 mb-5">
    <div>
      <h1 class="text-2xl font-bold tracking-tight">{ticket.subject}</h1>
      <p class="text-sm opacity-60">{ticket.public_id} · {ticket.customer_name}</p>
    </div>
    <button id="statusBtn" data-ticket={ticket.id} data-status={ticket.status}
      class:list={['text-sm font-bold px-5 py-2 rounded-full border shrink-0',
        ticket.status === 'open' ? 'border-line bg-white hover:border-brand-blue/50' : 'bg-brand-blue text-white border-brand-blue']}>
      {ticket.status === 'open' ? 'Close ticket' : 'Reopen ticket'}
    </button>
  </div>

  <div class="bg-white rounded-2xl border border-line p-5 mb-6">
    <div class="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-sm">
      {details.filter(([, v]) => v).map(([k, v]) => (
        <div><span class="opacity-50 text-xs uppercase tracking-wider block">{k}</span>{v}</div>
      ))}
    </div>
    {ticket.photo_key && (
      <div class="mt-4">
        <span class="opacity-50 text-xs uppercase tracking-wider block mb-2">Photo</span>
        <a href={`/api/admin/photo/${ticket.photo_key}`} target="_blank">
          <img src={`/api/admin/photo/${ticket.photo_key}`} alt="Submitted photo" class="max-h-64 rounded-xl border border-line" loading="lazy" />
        </a>
      </div>
    )}
  </div>

  <div class="space-y-3 mb-6">
    {messages.map(m => (
      m.direction === 'note' ? (
        <div class="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-sm">
          <span class="text-[10px] uppercase tracking-wider font-bold text-amber-700 block mb-0.5">Private note · {fmt(m.created_at)}</span>
          <p class="whitespace-pre-wrap">{m.body}</p>
        </div>
      ) : (
        <div class:list={['max-w-[85%] rounded-2xl px-4 py-3', m.direction === 'inbound' ? 'bg-white border border-line' : 'bg-brand-blue text-white ml-auto']}>
          <span class:list={['text-[10px] uppercase tracking-wider font-bold block mb-1', m.direction === 'inbound' ? 'text-brand-blue' : 'text-white/70']}>
            {m.direction === 'inbound' ? ticket.customer_name : 'You'} · {fmt(m.created_at)}
          </span>
          <p class="text-sm whitespace-pre-wrap">{m.body}</p>
          {atts(m.attachments).map(k => (
            <a href={`/api/admin/photo/${k}`} target="_blank">
              <img src={`/api/admin/photo/${k}`} alt="Attachment" class="mt-2 max-h-48 rounded-lg border border-line bg-white" loading="lazy" />
            </a>
          ))}
        </div>
      )
    ))}
  </div>

  <form id="replyForm" data-ticket={ticket.id} class="bg-white rounded-2xl border border-line p-4">
    <label class="text-xs font-bold uppercase tracking-wider text-brand-blue block mb-2">Reply to {ticket.customer_name}</label>
    <textarea name="body" required rows="4" maxlength="10000"
      class="w-full border-[1.5px] border-line rounded-xl px-3.5 py-3 text-sm focus:border-brand-blue focus:outline-none resize-y"
      placeholder="Sent from support@foundsocklaundromat.com — your personal email stays hidden."></textarea>
    <div class="flex items-center gap-3 mt-3">
      <button type="submit" class="bg-brand-red text-white font-bold text-sm px-7 py-2.5 rounded-full disabled:opacity-50">Send reply →</button>
      <button type="button" id="noteBtn" class="text-sm font-semibold text-amber-700 hover:underline">Save as private note</button>
      <span id="formStatus" class="text-sm flex-1" aria-live="polite"></span>
    </div>
  </form>
</AdminLayout>

<script>
  const form = document.getElementById('replyForm') as HTMLFormElement;
  const statusEl = document.getElementById('formStatus')!;
  const ticketId = form.dataset.ticket!;
  const ta = form.querySelector('textarea')!;

  async function post(url: string, payload: object): Promise<boolean> {
    statusEl.textContent = 'Working…';
    statusEl.className = 'text-sm flex-1 opacity-60';
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(String(res.status));
      return true;
    } catch {
      statusEl.textContent = 'Failed — nothing was saved. Try again.';
      statusEl.className = 'text-sm flex-1 text-brand-red';
      return false;
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!ta.value.trim()) return;
    if (await post('/api/admin/reply', { ticketId, body: ta.value })) location.reload();
  });

  document.getElementById('noteBtn')!.addEventListener('click', async () => {
    if (!ta.value.trim()) return;
    if (await post('/api/admin/note', { ticketId, body: ta.value })) location.reload();
  });

  const statusBtn = document.getElementById('statusBtn') as HTMLButtonElement;
  statusBtn.addEventListener('click', async () => {
    const next = statusBtn.dataset.status === 'open' ? 'closed' : 'open';
    if (await post('/api/admin/status', { ticketId, status: next })) location.reload();
  });
</script>
```

- [ ] **Step 2: Build + local smoke** (uses the ticket created in Task 8's smoke test):

```bash
npm run build
npm run dev &
sleep 6
TICKET_ID=$(npx wrangler d1 execute foundsock-helpdesk --local --command "SELECT id FROM tickets LIMIT 1" --json | python3 -c "import json,sys; r=json.load(sys.stdin); print(r[0]['results'][0]['id'])")
curl -s "http://localhost:4321/admin/tickets/${TICKET_ID}/" | grep -c 'Reply to'
kill %1
```
Expected: `1` (thread page renders with reply form).

- [ ] **Step 3: Commit**

```bash
git add "src/pages/admin/tickets/[id].astro"
git commit -m "feat(helpdesk): chat-style thread view with reply/note/close"
```

---

### Task 15: Analytics page

**Files:**
- Create: `src/pages/admin/analytics.astro`

- [ ] **Step 1: Create `src/pages/admin/analytics.astro`**

```astro
---
export const prerender = false;

import AdminLayout from '../../components/admin/AdminLayout.astro';
import { getHelpdeskEnv } from '../../lib/helpdesk/env';
import { viewsByDay, topPages, topCountries, deviceSplit } from '../../lib/helpdesk/db';

const env = await getHelpdeskEnv();
const [views, pages, countries, devices] = await Promise.all([
  viewsByDay(env.DB, 30), topPages(env.DB, 30), topCountries(env.DB, 30), deviceSplit(env.DB, 30),
]);
const total = views.reduce((s, v) => s + v.views, 0);
const maxDay = Math.max(1, ...views.map(v => v.views));
const maxPage = Math.max(1, ...pages.map(p => p.views));
const devTotal = Math.max(1, devices.reduce((s, d) => s + d.views, 0));
---
<AdminLayout title="Analytics">
  <h1 class="text-3xl font-bold tracking-tight mb-1">Analytics</h1>
  <p class="text-sm opacity-60 mb-6">Last 30 days · {total} page views · first-party, cookie-free</p>

  <h2 class="text-xs uppercase tracking-[0.2em] text-brand-blue font-bold mb-3">Views per day</h2>
  <div class="bg-white rounded-2xl border border-line p-5 mb-8">
    {views.length === 0 ? <p class="text-sm opacity-60">No data yet — check back after some traffic.</p> : (
      <div class="flex items-end gap-[2px] h-32">
        {views.map(v => (
          <div class="flex-1 bg-brand-blue/80 rounded-t hover:bg-brand-red" style={`height:${Math.max(3, Math.round((v.views / maxDay) * 100))}%`} title={`${v.day}: ${v.views} views`}></div>
        ))}
      </div>
    )}
  </div>

  <div class="grid md:grid-cols-2 gap-6">
    <div>
      <h2 class="text-xs uppercase tracking-[0.2em] text-brand-blue font-bold mb-3">Top pages</h2>
      <div class="bg-white rounded-2xl border border-line p-5 space-y-2.5">
        {pages.length === 0 && <p class="text-sm opacity-60">No data yet.</p>}
        {pages.map(p => (
          <div>
            <div class="flex justify-between text-sm mb-0.5"><span class="truncate">{p.path}</span><span class="opacity-60 shrink-0 ml-3">{p.views}</span></div>
            <div class="h-1.5 bg-line rounded-full overflow-hidden"><div class="h-full bg-brand-blue rounded-full" style={`width:${Math.round((p.views / maxPage) * 100)}%`}></div></div>
          </div>
        ))}
      </div>
    </div>
    <div class="space-y-6">
      <div>
        <h2 class="text-xs uppercase tracking-[0.2em] text-brand-blue font-bold mb-3">Countries</h2>
        <div class="bg-white rounded-2xl border border-line p-5 space-y-1.5 text-sm">
          {countries.length === 0 && <p class="opacity-60">No data yet.</p>}
          {countries.map(c => <div class="flex justify-between"><span>{c.country || '—'}</span><span class="opacity-60">{c.views}</span></div>)}
        </div>
      </div>
      <div>
        <h2 class="text-xs uppercase tracking-[0.2em] text-brand-blue font-bold mb-3">Devices</h2>
        <div class="bg-white rounded-2xl border border-line p-5 space-y-1.5 text-sm">
          {devices.length === 0 && <p class="opacity-60">No data yet.</p>}
          {devices.map(d => <div class="flex justify-between"><span class="capitalize">{d.device}</span><span class="opacity-60">{d.views} ({Math.round((d.views / devTotal) * 100)}%)</span></div>)}
        </div>
      </div>
    </div>
  </div>
</AdminLayout>
```

- [ ] **Step 2: Build + smoke**

```bash
npm run build
npm run dev &
sleep 6
curl -s http://localhost:4321/admin/analytics/ | grep -c 'Views per day'
kill %1
```
Expected: `1`.

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin/analytics.astro
git commit -m "feat(helpdesk): first-party analytics dashboard"
```

---

### Task 16: Remove Freshdesk

**Files:**
- Delete: `src/lib/freshdesk.ts`, `src/lib/freshdesk.test.ts`
- Modify: `wrangler.jsonc` (drop `FRESHDESK_SUBDOMAIN` var)

- [ ] **Step 1: Delete + confirm nothing references it**

```bash
git rm src/lib/freshdesk.ts src/lib/freshdesk.test.ts
grep -rn -i freshdesk src/ && echo "REFERENCES REMAIN — fix before continuing" || echo "clean"
```
Expected: `clean`.

- [ ] **Step 2: Edit `wrangler.jsonc` vars** to exactly:

```jsonc
	"vars": {
		"CF_ACCESS_TEAM_DOMAIN": "REPLACE_AT_CUTOVER.cloudflareaccess.com",
		"CF_ACCESS_AUD": "REPLACE_AT_CUTOVER"
	}
```

- [ ] **Step 3: Build + tests**

```bash
npm run build && npm test
```
Expected: build Complete!; tests pass with 0 failures (freshdesk tests gone; 31 new helpdesk tests present — roughly 54 total). Counts are approximate — the invariant that matters is 0 failures.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(helpdesk): remove Freshdesk integration (replaced by self-hosted helpdesk)"
```

---

### Task 17: Full verification pass (pre-cutover)

**Files:** none (verification only)

- [ ] **Step 1: Clean build + full test suite**

```bash
rm -rf dist node_modules/.astro
npm run build && npm test
```
Expected: build Complete! + deploy-redirect artifacts exist (`.wrangler/deploy/config.json`, `dist/server/wrangler.json`) + 0 test failures.

- [ ] **Step 2: Public-page regression greps** (guard the 100/100 setup)

```bash
grep -c 'sendBeacon' dist/client/index.html                    # expect 1 (beacon present)
grep -o '<title>[^<]*</title>' dist/client/index.html          # homepage title unchanged
grep -c 'admin' dist/client/sitemap-0.xml || echo "0"          # expect 0 (no admin in sitemap)
grep -c 'Disallow: /admin/' dist/client/robots.txt             # expect 1
```

- [ ] **Step 3: Local end-to-end (no email sends — they fail gracefully in dev)**

```bash
npm run dev &
sleep 6
# form → ticket
curl -s -X POST http://localhost:4321/api/submit-ticket -H 'Content-Type: application/json' \
  -d '{"name":"E2E","email":"e2e@example.com","message":"verification pass","type":"general"}'
# beacon
curl -s -o /dev/null -w "pv:%{http_code}\n" -X POST http://localhost:4321/api/pv -H 'User-Agent: Mozilla/5.0' -d '{"p":"/","r":""}'
# admin pages render
curl -s http://localhost:4321/admin/ | grep -c 'Dashboard'
curl -s http://localhost:4321/admin/tickets/ | grep -c 'E2E'
kill %1
```
Expected: `{"ok":true,...}`, `pv:204`, ≥1, ≥1.

- [ ] **Step 4: Commit any stragglers + push the whole feature branch of commits**

```bash
git status --short   # should be empty
TOKEN=$(gh auth token --user eliranetinc-droid) && git push "https://x-access-token:${TOKEN}@github.com/eliranetinc-droid/foundsocklaundromat.git" main
```
IMPORTANT: this push DEPLOYS. Do it only after Task 18's dashboard prerequisites are complete **or** accept that until then: forms will 500 on D1-missing (rollback = `git revert`). **Preferred order: complete Task 18 Steps 1–6 first, then push.** (The task ordering below reflects that — Task 18 references this push as its final step.)

---

### Task 18: CUTOVER — dashboard prerequisites + deploy + E2E (owner + assistant together)

**Files:**
- Modify: `wrangler.jsonc` (real `database_id`, real Access values)

This task is interactive (Cloudflare/Resend dashboards). Values produced here replace every `REPLACE_AT_CUTOVER`.

- [ ] **Step 1: D1** — Cloudflare dashboard (Eliranetinc account) → Storage & Databases → D1 → Create database → name `foundsock-helpdesk`. Copy its **Database ID** into `wrangler.jsonc` `database_id`. Then open the database → Console → paste the full contents of `db/schema.sql` → Run. Verify: `SELECT name FROM sqlite_master WHERE type='table';` returns tickets, messages, pageviews.

- [ ] **Step 2: R2** — dashboard → R2 → Create bucket → name `foundsock-photos` (location: automatic). No public access (default).

- [ ] **Step 3: Resend** — sign up at resend.com with `eliranetinc@gmail.com` → Domains → Add domain `foundsocklaundromat.com` → Resend shows DNS records; add each in Cloudflare DNS (they typically are):
  - TXT `resend._domainkey` = provided DKIM value
  - MX + TXT on `send.foundsocklaundromat.com` = provided values (return-path)
  Then click Verify in Resend (may take ~10 min). Create an API key (Full access → Sending) — goes to secrets in Step 6.

- [ ] **Step 4: Email Routing** — dashboard → zone `foundsocklaundromat.com` → Email → Email Routing → Enable. Accept the wizard's DNS changes (adds MX `route1-3.mx.cloudflare.net`; REPLACES the root `v=spf1 -all` TXT with `v=spf1 include:_spf.mx.cloudflare.net ~all`). Then:
  - Routing rules → **Catch-all** → action **Send to Worker** → `foundsocklaundromat`. Enable catch-all.
  - Do NOT create any forward-to-personal-email rule.
  - DNS cleanup while here: delete TXT `_domainkey` (`v=DKIM1; p=` null record); edit `_dmarc` TXT to `v=DMARC1; p=reject`.

- [ ] **Step 5: Cloudflare Access** — dashboard → Zero Trust → set/confirm team domain (record it, e.g. `eliranetinc.cloudflareaccess.com`) → Access → Applications → Add → Self-hosted:
  - Application domains (4 entries): `foundsocklaundromat.com/admin`, `www.foundsocklaundromat.com/admin`, `foundsocklaundromat.com/api/admin`, `www.foundsocklaundromat.com/api/admin`
  - Session duration 24h. Policy: Allow → Include → Emails → owner's Google email. Login method: Google (One-time PIN as fallback is fine).
  - After creating, open the app → copy **Application Audience (AUD) tag**.
  - Put team domain + AUD into `wrangler.jsonc` vars (`CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`).

- [ ] **Step 6: Worker secrets** — dashboard → Workers & Pages → `foundsocklaundromat` → Settings → Variables and Secrets → add Secrets: `RESEND_API_KEY` (from Step 3), `NOTIFY_EMAIL` (owner's private notification address). Delete secret `FRESHDESK_API_KEY`.

- [ ] **Step 7: Commit config + deploy**

```bash
# TRIPWIRE: refuse to proceed if any placeholder survived (quality-review recommendation)
! grep -q REPLACE_AT_CUTOVER wrangler.jsonc || { echo "PLACEHOLDERS REMAIN in wrangler.jsonc — fill real values first"; exit 1; }
git add wrangler.jsonc
git commit -m "chore(helpdesk): cutover config (D1 id, Access team/aud)"
TOKEN=$(gh auth token --user eliranetinc-droid) && git push "https://x-access-token:${TOKEN}@github.com/eliranetinc-droid/foundsocklaundromat.git" main
```
Watch the build in Workers & Pages → Deployments until success.

- [ ] **Step 8: Production E2E checklist** (do in order; all through the live site)
  1. Visit `https://www.foundsocklaundromat.com/admin` signed out → Google login wall → after login, dashboard renders.
  2. Submit the live issue form (real photo) → success message → ticket appears in admin inbox (unread dot) → confirmation email arrives at the test customer address FROM `support@foundsocklaundromat.com` → owner notification arrives at NOTIFY_EMAIL.
  3. Open the ticket → photo renders → reply "test reply" → customer inbox receives it (From support@, Reply-To `support+t…@`) → thread shows your bubble.
  4. As the customer, reply to that email → within ~1 min the thread shows the reply, ticket unread, owner notification received.
  5. Send a brand-new email to `support@foundsocklaundromat.com` from an address with no ticket → new ticket appears (source Email) + confirmation received.
  6. Close the ticket in admin → have customer reply again → ticket reopens.
  7. Check mail headers on a received customer email (Show original in Gmail): SPF pass, DKIM pass (d=foundsocklaundromat.com), DMARC pass; owner's personal address appears NOWHERE.
  8. Browse 3–4 public pages → `/admin/analytics` shows the views.
  9. `curl -s https://www.foundsocklaundromat.com/api/admin/reply -X POST` signed-out → 403 (or Access redirect HTML) — API not open.
  10. PageSpeed mobile + desktop on `https://www.foundsocklaundromat.com/` → still 100 across the board (beacon must not regress scores).
- [ ] **Step 9: Rollback note (only if something is broken and unfixable quickly):** `git revert` the cutover commits and push — forms return to Freshdesk behavior only if the Freshdesk removal commit (Task 16) is included in the revert range and `FRESHDESK_API_KEY` still exists; otherwise fix forward. Prefer fix-forward for anything cosmetic.

---

## Plan self-review (done at authoring)

- **Spec coverage:** data model → T1; ids → T2; matching/quote-strip → T3; analytics helpers/endpoint/UI → T4/T9/T15; templates+identity rules → T5; Resend → T6; DB layer → T7; both form rewrites + confirmation/notify → T8 (spec §5.1); middleware/Access → T10 + T18.5 (spec §6, four host+path entries); inbound pipeline incl. attachments, reopen, auto-guard, new-ticket-from-email → T11 (spec §5.3); admin APIs incl. auth-gated photos → T12; dashboard/inbox/thread/analytics UI → T13–T15 (spec §8); Freshdesk removal → T16 (spec §12.4); robots+noindex → T9+T13; DNS records → T18.3/18.4 (spec §7.1); E2E checklist → T18.8 (spec §11).
- **Known deliberate deviations:** none.
- **Type consistency check:** `HelpdeskEnv`/`getHelpdeskEnv` (T1) used in T8–T15; `NewTicket`/`createTicket` field names match schema columns (T1↔T7); `intakeTicket` input matches both callers (T8, T11); `sendEmail(env, opts)` signature consistent (T6, T8-intake, T11, T12); `TicketSource` exported from templates.ts and imported by db.ts/intake.ts.
```
