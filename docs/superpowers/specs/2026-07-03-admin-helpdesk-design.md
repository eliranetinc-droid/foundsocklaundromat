# Admin + Helpdesk Design — The Found Sock Laundromat

**Date:** 2026-07-03
**Status:** Approved direction (full Freshdesk replacement, two-way email threading, one-go build)
**Owner requirement (verbatim intent):** Customers must never see the owner's personal email or phone. All customer-facing email is `support@foundsocklaundromat.com`. The admin shows each ticket as a text-message-style thread with reply box. Analytics (first-party only) and all form submissions live in one admin.

---

## 1. Goals

1. Replace Freshdesk: issue-report + contact-form submissions stored on our own infrastructure.
2. Admin area at `/admin` (Google login) to view tickets, reply, and see site analytics.
3. Two-way email: owner replies from the admin as `support@foundsocklaundromat.com`; customer replies (and brand-new emails to support@) land back in the ticket thread.
4. First-party analytics: page views, top pages, countries, device split. Zero third-party JS on the public site.
5. Keep 100/100 PageSpeed/SEO. Keep identity protection (no owner email/phone anywhere customer-visible).
6. $0/month: D1, R2, Access, Email Routing free tiers + Resend free tier (3,000 emails/mo).

## 2. Non-goals (YAGNI)

- No multi-agent/staff accounts, no roles. One owner via Cloudflare Access.
- No canned responses, tags, SLAs, or search (v1). Filter by status only.
- No CSAT surveys, no auto-close timers.
- No migration of historical Freshdesk tickets (Freshdesk account stays as read-only archive).
- No outbound attachments in replies (v1). Inbound image attachments ARE stored.
- No spam-scoring service; simple heuristics only (see §8.4).

## 3. Architecture overview

One Cloudflare Worker (the existing `foundsocklaundromat` Worker, deployed via GitHub → Cloudflare Builds) gains:

- **D1 database** (binding `DB`) — tickets, messages, pageviews.
- **R2 bucket** (binding `PHOTOS`) — form photo uploads + inbound email image attachments. Never public; served only through an authenticated admin route.
- **Custom worker entrypoint** (adapter `workerEntryPoint`) exporting both `fetch` (Astro SSR, as today) and `email` (Cloudflare Email Routing inbound handler).
- **Resend** (HTTPS API, secret `RESEND_API_KEY`) — the single external service, for outbound email as `support@foundsocklaundromat.com`.
- **Cloudflare Access** — Google-login wall on `/admin*` at the edge + JWT validation in-Worker for `/admin*` and `/api/admin/*` (defense in depth).

New Astro SSR routes (all `prerender = false`):

| Route | Purpose |
|---|---|
| `/admin` | Dashboard: open-ticket count, latest messages, 14-day visitors sparkline |
| `/admin/tickets` | Inbox list (status filter open/closed, unread indicator) |
| `/admin/tickets/[id]` | Thread view + ticket details + photo(s) + reply box + note box + close/reopen |
| `/admin/analytics` | Charts: views/day (30d), top pages, countries, device split |
| `POST /api/admin/reply` | Send reply via Resend, insert outbound message |
| `POST /api/admin/note` | Insert private note |
| `POST /api/admin/status` | Open/close ticket |
| `GET /api/admin/photo/[key]` | Stream R2 object (auth-gated photo access) |
| `POST /api/pv` | Public: first-party pageview beacon |
| `POST /api/submit-issue` | REWRITTEN: D1 + R2 + confirmation email (was Freshdesk) |
| `POST /api/submit-ticket` | REWRITTEN: D1 + confirmation email (was Freshdesk) |

Deleted after cutover: `src/lib/freshdesk.ts`, `freshdesk.test.ts`, `FRESHDESK_*` config (wrangler var + dashboard secret).

## 4. Data model (D1)

```sql
CREATE TABLE tickets (
  id TEXT PRIMARY KEY,              -- internal: random 12-char base32
  public_id TEXT NOT NULL UNIQUE,   -- customer-facing: 'FS-' + 5 chars, e.g. FS-7K2QX
  reply_token TEXT NOT NULL UNIQUE, -- for plus-addressing: 't' + 10 chars
  status TEXT NOT NULL DEFAULT 'open',       -- 'open' | 'closed'
  source TEXT NOT NULL,                       -- 'issue-form' | 'contact-form' | 'email'
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  -- issue-form fields (NULL for other sources)
  machine_type TEXT, machine_number TEXT,
  card_type TEXT, card_last4 TEXT, loyalty_card TEXT,
  issue_date TEXT, issue_time TEXT, cost TEXT,
  photo_key TEXT,                   -- R2 key of the form upload
  subject TEXT NOT NULL,            -- e.g. 'Issue: Washer #7' / 'Contact form' / email subject
  created_at TEXT NOT NULL,         -- ISO 8601 UTC
  last_activity_at TEXT NOT NULL,
  unread INTEGER NOT NULL DEFAULT 1 -- 1 when latest event is customer-side and not yet viewed
);
CREATE INDEX idx_tickets_status_activity ON tickets(status, last_activity_at DESC);
CREATE INDEX idx_tickets_email ON tickets(customer_email);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  direction TEXT NOT NULL,          -- 'inbound' | 'outbound' | 'note'
  body TEXT NOT NULL,               -- plain text (HTML stripped on inbound)
  from_email TEXT,                  -- inbound: sender; outbound: support@...
  email_message_id TEXT,            -- inbound: Message-ID header; outbound: Resend id
  attachments TEXT,                 -- JSON array of R2 keys (inbound images), NULL if none
  created_at TEXT NOT NULL
);
CREATE INDEX idx_messages_ticket ON messages(ticket_id, created_at);

CREATE TABLE pageviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,                 -- ISO 8601 UTC
  day TEXT NOT NULL,                -- 'YYYY-MM-DD' for grouping
  path TEXT NOT NULL,
  referrer_host TEXT,               -- host only, '' for direct
  country TEXT,                     -- from request.cf.country
  device TEXT                       -- 'mobile' | 'desktop' (UA heuristic)
);
CREATE INDEX idx_pageviews_day ON pageviews(day);
```

The initial submission's message text is stored as the first `messages` row (direction `inbound`), so the thread renders uniformly.

Schema applied once via the Cloudflare dashboard D1 console (avoids wrangler-auth cross-account risk). Schema file lives in repo at `db/schema.sql` as source of truth.

## 5. Flows

### 5.1 Form submission (issue form)
1. `POST /api/submit-issue` (multipart, unchanged client contract — same field names, photo required).
2. Validate exactly as today (all fields required; conditional machine number / card fields; ≤10 MB image).
3. Generate ids; store photo at R2 key `form/<ticketId>/<sanitized-filename>`.
4. Insert ticket (`source='issue-form'`, `subject='Issue: <machineType> #<n>'` or `'Issue: <machineType>'`) + first message (the free-text message).
5. Send **confirmation email** to customer via Resend (template §7.3). Failure to send does NOT fail the submission (log + continue).
6. Send **owner notification** (§7.5). Failure tolerated.
7. Return `{ ok: true, ticketId: public_id }` — client shows existing success message.

Contact form (`POST /api/submit-ticket`, JSON `{name,email,message,type}`) → same flow, `source='contact-form'`, no photo, subject `'Contact form message'`.

### 5.2 Owner replies (admin)
1. `POST /api/admin/reply` `{ticketId, body}` (auth-gated).
2. Resend API call:
   - From: `The Found Sock Laundromat <support@foundsocklaundromat.com>`
   - **Reply-To:** `support+<reply_token>@foundsocklaundromat.com`
   - To: customer_email
   - Subject: `Re: <subject> [<public_id>]`
   - Text body = reply + footer (§7.4). HTML = simple branded wrapper of same content.
   - Headers: `In-Reply-To`/`References` = last inbound `email_message_id` when present (client-side threading for the customer).
3. Insert outbound message; update `last_activity_at`; clear `unread`.
4. On Resend failure: return error to admin UI (message NOT saved) — owner sees "send failed, try again".

### 5.3 Customer replies / new inbound email
1. Cloudflare Email Routing: **catch-all** on foundsocklaundromat.com → deliver to this Worker's `email` handler. (`support@` also explicitly routed. No forwarding rules to personal email — notifications handle that.)
2. Parse raw MIME with `postal-mime`. Extract: from, to (all recipients), subject, text (fall back to HTML→stripped), Message-ID, In-Reply-To/References, attachments, `Auto-Submitted` header.
3. **Match to ticket, in order:**
   a. Any recipient matching `support+<token>@` → ticket by `reply_token`.
   b. Subject contains `[FS-XXXXX]` → ticket by `public_id`.
   c. Sender email has an **open** ticket → most recently active one.
   d. No match → **create new ticket** (`source='email'`, subject = email subject or '(no subject)', name = display name or email local-part) + confirmation email (§7.3 short variant).
4. Guards (before 3d): if `Auto-Submitted != no`/present, or sender matches `mailer-daemon|postmaster|no-?reply`, or body empty → store nothing if unmatched; if matched to a ticket, store as note `'[auto/bounce email received]'` for visibility. Never auto-reply to these.
5. Store inbound message (strip quoted history below common reply separators — keep full body if stripping would leave <10 chars). Image attachments (`image/*`, ≤10 MB, max 5) → R2 `inbound/<ticketId>/<n>-<filename>`; listed in `attachments`.
6. Reopen ticket if closed. Set `unread=1`, bump `last_activity_at`. Send owner notification (§7.5).

### 5.4 Analytics beacon
1. Tiny inline script in `Layout.astro` (public pages only, skipped when path starts with `/admin`):
   `navigator.sendBeacon('/api/pv', JSON.stringify({p: location.pathname, r: document.referrer}))` wrapped in a `requestIdleCallback`/load listener. ~200 bytes, non-blocking, no cookies, no consent needed (no personal data stored).
2. `POST /api/pv`: validate path (must start `/`, ≤200 chars, not `/admin`, not `/api`); drop known bot UAs (`bot|crawler|spider|lighthouse|pagespeed|headless`); insert row with `country = request.cf?.country`, `device` from UA (`Mobi|Android|iPhone` → mobile), `referrer_host` = parsed host, `''` if same-host or empty. Always return 204.
3. Retention: none needed at this traffic (<10k rows/mo). Revisit if D1 free rows ever matter.

## 6. Auth

- **Cloudflare Access** application (dashboard, one-time): one self-hosted app covering FOUR host+path entries — `foundsocklaundromat.com/admin`, `www.foundsocklaundromat.com/admin`, `foundsocklaundromat.com/api/admin`, `www.foundsocklaundromat.com/api/admin` (the API paths must be covered so the edge injects the JWT on the admin UI's own fetch calls). Policy: Allow → Emails = owner's Google-account email(s). Identity provider: Google (or Access One-Time PIN as fallback). Session 24h.
- **In-Worker validation** (Astro middleware `src/middleware.ts`): for paths matching `/admin` or `/api/admin/`, verify `Cf-Access-Jwt-Assertion` JWT with `jose` against `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`, audience `CF_ACCESS_AUD`. Missing/invalid → 403. Vars (non-secret, wrangler.jsonc): `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`.
- `/api/pv`, both submit endpoints, and the `email` handler are public paths (not under Access).
- Local dev (`npm run dev`): middleware allows all when `import.meta.env.DEV`.

## 7. Email details

### 7.1 DNS records (Cloudflare zone — I add/guide these at implementation time)
| Purpose | Record |
|---|---|
| Inbound (Email Routing enable) | MX `foundsocklaundromat.com` → `route1/2/3.mx.cloudflare.net` (added automatically by the Email Routing wizard) |
| Inbound SPF | Replace existing `TXT @ "v=spf1 -all"` with wizard's `"v=spf1 include:_spf.mx.cloudflare.net ~all"` |
| Outbound DKIM (Resend) | `TXT resend._domainkey` → key provided by Resend at domain-add |
| Outbound return-path (Resend) | `MX`+`TXT send.foundsocklaundromat.com` → values provided by Resend |
| DMARC | Replace strict record with `TXT _dmarc "v=DMARC1; p=reject"` (relaxed alignment; DKIM d=foundsocklaundromat.com aligns, so p=reject stays safe) |
| Cleanup | Delete stray `TXT _domainkey "v=DKIM1; p="` (null key from Wix era) |
| Keep | Both `google-site-verification` TXTs |

### 7.2 Addressing rules (identity protection)
- From on ALL outbound: `The Found Sock Laundromat <support@foundsocklaundromat.com>`.
- Reply-To on ALL outbound: `support+<reply_token>@foundsocklaundromat.com`.
- Owner's personal address appears in NO customer-facing header. Owner notifications are separate emails TO the owner (`NOTIFY_EMAIL` secret), never CC/BCC on customer mail.

### 7.3 Confirmation email (on new ticket)
Subject: `We got your report [FS-XXXXX]` (form) / `We got your message [FS-XXXXX]` (email/contact). Body: thanks, ticket reference, "reply to this email to add more details", hours line. No owner identity.

### 7.4 Reply footer
`— The Found Sock Laundromat · 76 Washington St, Brighton MA · foundsocklaundromat.com` plus `Ref: [FS-XXXXX]` (backstop for thread matching).

### 7.5 Owner notification (secret `NOTIFY_EMAIL`)
Subject: `[FS-XXXXX] new <ticket|message>: <subject>`. Body: customer name, first ~300 chars, link `https://www.foundsocklaundromat.com/admin/tickets/<id>`. Sent on new ticket + new inbound message.

## 8. Admin UI

- Same Astro/Tailwind design system as the site (brand blues/red, cream cards). Server-rendered; small inline JS only for reply/note submit + status toggle (fetch + reload).
- **Thread view:** chat bubbles — customer left (cream), owner right (brand-blue, white text), notes full-width yellow-tint with "Private note" label; timestamps; inbound attachment images inline via `/api/admin/photo/<key>`; ticket detail card (all form fields + form photo) above thread; reply textarea + Send; "Add private note"; Close/Reopen button.
- **Inbox:** rows = public_id, name, subject, snippet, relative time; bold + dot when `unread`; opening a ticket clears `unread`. Filter tabs Open/Closed.
- **Analytics:** pure-CSS/SVG bar charts (no chart library): views/day 30d, top 10 pages, top countries, mobile-vs-desktop.
- `/admin` pages emit `noindex`; robots.txt adds `Disallow: /admin/`; SSR routes are excluded from the sitemap automatically.

## 9. wrangler.jsonc / config additions

```jsonc
"d1_databases": [{ "binding": "DB", "database_name": "foundsock-helpdesk", "database_id": "<from dashboard>" }],
"r2_buckets":  [{ "binding": "PHOTOS", "bucket_name": "foundsock-photos" }],
"vars": { "CF_ACCESS_TEAM_DOMAIN": "...", "CF_ACCESS_AUD": "..." }  // FRESHDESK_SUBDOMAIN removed
```
Secrets (dashboard): `RESEND_API_KEY`, `NOTIFY_EMAIL`. Removed: `FRESHDESK_API_KEY`.
astro.config: `cloudflare({ imageService: 'compile', workerEntryPoint: { path: 'src/worker.ts', namedExports: [] } })`; `src/worker.ts` re-exports Astro's fetch handling + adds `email` handler.
New deps: `postal-mime`, `jose` (runtime); no client-side deps.

## 10. Error handling summary

| Failure | Behavior |
|---|---|
| Resend down on confirmation/notification | Submission still succeeds; error logged |
| Resend down on owner reply | Reply NOT saved; admin sees inline error |
| D1 error on submit | 500 → form shows existing "couldn't send, email support@" fallback (which now reaches the helpdesk via inbound email — true safety net) |
| Unparseable inbound email | Log + drop (message.raw kept only in logs) |
| Inbound >10 MB attachment / non-image | Skipped; body line notes omitted attachment |
| Access misconfig | Middleware 403s everything under /admin (fail closed) |

## 11. Testing

- **Vitest units:** id/token generators; plus-address parser; subject `[FS-…]` parser; ticket matcher (layers a–d incl. auto-submitted guard); quoted-reply stripper; UA device classifier; pv validator. Email send/store functions factored into `src/lib/helpdesk/*.ts` for testability; D1 calls behind thin interfaces.
- **Manual E2E checklist (post-deploy):** form → ticket + confirmation received; admin reply → arrives from support@ with correct Reply-To; customer reply → threads; brand-new email to support@ → new ticket; closed-ticket reply reopens; photo renders in admin only; /admin blocked when signed out; pageviews appear; PSI still 100/100.

## 12. Cutover & rollout order

1. Dashboard prerequisites (owner clicks, I guide): create D1 + apply schema; create R2 bucket; enable Email Routing (catch-all → Worker) — **remove/skip any forward-to-personal-email rule**; Resend account + domain verify (DNS §7.1); Access application; set secrets.
2. Deploy code (git push → Builds). Forms now write to D1; Freshdesk stops receiving new tickets that moment.
3. Run E2E checklist. Fix anything.
4. Retire Freshdesk: remove `freshdesk.ts` + secrets/vars (code removal ships in the same PR; account cancellation left to owner whenever comfortable — history stays readable meanwhile).

**Rollback:** revert the git commit → forms post to Freshdesk again (secrets kept until step 4 confirms).
