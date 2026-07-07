# Admin v2 + AI Reply Assistant — Design

**Date:** 2026-07-06 · **Status:** Approved (user: "approved", AI brain = Claude per recommendation)
**Builds on:** 2026-07-03 helpdesk (live since 2026-07-06). Timezone display fix already shipped (`America/New_York` in all admin `fmt` helpers).

## 1. Goals

1. Rebuild the admin shell, dashboard, and analytics to BBRM-admin quality (information-dense, modern) while keeping Found Sock's own brand identity.
2. Keep the tickets inbox + thread pages' content as-is (user likes them) — rehomed into the new shell.
3. Replace all three plain-text emails with branded HTML (+ retained plain-text alternative part).
4. Add an AI reply assistant: drafts replies to repeat questions in the owner's voice, learned from his own reply history + an editable house-rules note. **Approve-before-send only.**

## 2. Non-goals (explicit)

- No auto-send of AI replies (future: confidence-gated auto-send — out of scope).
- No vector database / embeddings — keyword-overlap retrieval is enough at this volume.
- No dark mode. No external chart libraries. No new third-party services beyond the Anthropic API.
- No redesign of ticket inbox rows or chat bubbles (content preserved; only the surrounding shell changes).
- Public site untouched (100/100 PSI invariant).

## 3. Design reference (extracted from BBRM admin)

Source: `/Users/eliranderei/BBRM new Website/src/app/admin/` (Next.js + Tailwind). Adopt: dark `w-64` sidebar shell + white sticky topbar; KPI tiles with custom-SVG sparklines and ▲/▼ delta chips; `rounded-xl/2xl` white cards, `border-gray-100`-weight borders, `shadow-sm`, hover lift `-translate-y-0.5`; segmented period selector (active = solid brand pill); status chips `rounded-full px-2.5 py-0.5 text-xs`; skeleton/empty states; div-based horizontal mini-bars. Skip (domain-specific): live-visitor modal, competition podium, calendar.
**Identity stays Found Sock:** existing Tailwind tokens (`brand-blue`, `brand-blue-darker`, `brand-red`, `cream`, `line`), Inter + Instrument Serif. No Barlow/Varela, no BBRM orange.

## 4. Part A — Admin v2

### 4.1 Shell (`src/components/admin/AdminLayout.astro` rewrite)

- Fixed left sidebar `w-64`, `bg-brand-blue-darker`, white text: wordmark ("Found Sock **Admin**"), nav (Dashboard, Tickets, Analytics; Settings item added with Part B when its page ships), bottom link "View site →". Active item: white text + `bg-white/10` pill; inactive `text-white/60`.
- Mobile (<lg): sidebar hidden behind a hamburger in the topbar (CSS-only `peer`/checkbox toggle or minimal inline JS; no framework).
- Topbar: sticky, white, `border-b border-line`: page title (slot prop), right side: open-tickets count badge (red pill when >0, links to /admin/tickets/) — server-rendered per page load.
- Content area: `p-4 sm:p-6`, `max-w-6xl`. Body stays `bg-cream`.
- All admin pages adopt the shell via existing `<AdminLayout title=…>` interface (children unchanged where content is kept).

### 4.2 Dashboard (`src/pages/admin/index.astro` rewrite)

Row 1 — 4 KPI tiles (each: label, big value, 14-day sparkline, delta chip vs previous 7 days):
1. **Visitors** (pageviews, 7d sum; spark = daily views)
2. **Open tickets** (current count; spark = daily new tickets)
3. **New tickets (7d)** (count; delta vs prior 7d)
4. **Avg. first reply** (median hours from first inbound to first outbound over last 30d; "—" when no data)

Row 2 — two-thirds/one-third grid:
- **Needs attention** (⅔): tickets that are unread OR open >48h, oldest first, each row: public_id chip, subject, customer, age ("3h", "2d"), unread dot. Empty state: "All caught up. 🧺"
- **Traffic (14d)** (⅓): mini area chart + top 5 pages as label+count mini-bars.

Row 3 — **Recent activity**: last 8 messages (in/out/note) across tickets: direction icon, customer/You, snippet, time (ET), linking to the thread.

New `db.ts` queries: `ticketsPerDay(db, days)`, `medianFirstReplyHours(db, days)`, `needsAttention(db)`, existing `recentMessages`/`viewsByDay`/`topPages` reused. Sparkline = shared `Sparkline.astro` component (pure SVG, fluid width, area fill + stroke; colors: blue #276798-family from Found Sock tokens, green #16a34a for tickets).

### 4.3 Analytics (`src/pages/admin/analytics.astro` rewrite)

- Segmented period selector: **7d / 30d / 90d** (query param `?period=`, default 30d; server-rendered links styled as segmented control).
- Header stats with delta chips vs the equal-length previous period: total views, daily average, busiest day.
- Big area chart (views/day, custom SVG, x-axis date labels every ~5 ticks, y-axis max label).
- Grid: **Top pages** (mini-bars + counts), **Referrers** (from `referrer_host`, '—' = direct), **Countries** (count + %), **Devices** (mini-bars + %), **Busiest hours** (24 vertical mini-bars, ET hour buckets — new).
- ET bucketing: pageviews gain an `hour` INTEGER column (ET hour at insert); `day` computed in ET at insert going forward. Migration below. Historical rows (few days, small counts) keep UTC-derived values; acceptable drift, documented.

### 4.4 HTML emails (`src/lib/helpdesk/templates.ts` rewrite)

All three templates become `{ subject, html, text }` (text part = current plain content, kept for deliverability). Shared layout: 600px table-based (email-client-safe), `brand-blue-darker` header band with white "The Found Sock Laundromat" wordmark text (no remote images — text renders everywhere), white content card on cream background, footer (address · hours · foundsocklaundromat.com · Ref code).
1. **Customer confirmation**: friendly heading, their message quoted in a light card, reference `[FS-XXXXX]`, "just reply to this email to add details".
2. **Customer reply**: owner's message in a brand-blue-tinted card ("The Found Sock Laundromat replied:"), thread reference footer.
3. **Owner notification**: ticket details table (name/email/machine/source), message body, **CTA button "Open in admin"** → `https://www.foundsocklaundromat.com/admin/tickets/<id>/`, plus the AI draft when one exists (Part B). Subject: `🧺 New ticket [FS-XXXXX]: <subject>` / `↩️ Reply on [FS-XXXXX]`.
- `escapeHtml` applied to every interpolated user value (function already exists; keep first in file).
- `sendEmail` (resend.ts): body gains optional `html` field passed to Resend alongside `text`.

## 5. Part B — AI reply assistant

### 5.1 Data

```sql
CREATE TABLE IF NOT EXISTS ai_drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  trigger_message_id INTEGER,          -- messages.id of the inbound that prompted it
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'suggested',  -- suggested | used | sent_as_is | dismissed | superseded
  model TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_drafts_ticket ON ai_drafts(ticket_id, created_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- seeded keys: ai_enabled ('1'/'0', default '1'), house_rules (freeform text)
```

### 5.2 Provider (`src/lib/helpdesk/ai.ts`)

- Single `draftReply(env, input): Promise<string | null>` — provider-pluggable behind one fetch wrapper; v1 = Anthropic Messages API, model const `claude-haiku-4-5-20251001`, `max_tokens: 500`, secret `ANTHROPIC_API_KEY` (Worker secret, set in dashboard like RESEND_API_KEY).
- Returns `null` when: AI disabled in settings, no API key, API error (console.error, never throws to caller), or the model outputs the literal token `SKIP`.

### 5.3 Context assembly & prompt

- Input: ticket fields + full current thread + up to **12 prior exchange pairs** (inbound message → the outbound reply that followed it, same ticket adjacency) selected from the most recent 100 outbound replies across all tickets, scored by case-folded keyword overlap with the triggering message (stopwords removed; ties → recency). Plus `house_rules` text.
- System prompt (fixed, in code): you draft replies for the owner of a Brighton MA laundromat; match the owner's tone from the examples; be brief and warm; never invent policies, refunds, or promises absent from house rules/examples; if the question isn't clearly covered by examples or house rules, output exactly `SKIP`; always sign as "The Found Sock Laundromat".
- Unit-testable pieces: keyword scoring, pair extraction, prompt assembly (pure functions, mocked in vitest).

### 5.4 Flow & UI

- **Generate**: in `handleInboundEmail` after `addMessage`, and in `intakeTicket` for new form tickets — fire draft generation *after* ticket persistence, failure-tolerant (an AI outage must never affect ticketing). Store row in `ai_drafts`; embed body in the owner notification email ("Suggested reply — review in admin").
- **Thread view**: latest `suggested` draft renders as an amber-tinted panel above the reply box: "🤖 Suggested reply" + body + buttons **[Use & edit]** (copies into textarea, focuses, marks `used`), **[Send as-is]** (posts to existing `/api/admin/reply/`, then marks `sent_as_is`), **[Dismiss]** (marks `dismissed`, panel disappears). New inbound message → new draft, old one auto-marked `superseded`.
- **New API routes** (Access-gated, same CSRF note as siblings): `POST /api/admin/ai-draft/` `{ticketId}` → regenerate on demand (also a small "Suggest reply" button in thread when no draft); `POST /api/admin/draft-status/` `{draftId, status}`.
- **Settings page** `src/pages/admin/settings.astro`: AI on/off toggle, house-rules textarea (saves to settings table via `POST /api/admin/settings/`), note showing where the API key lives (dashboard secret).
- **Learning loop**: no separate store — every outbound reply already lands in `messages`, so tomorrow's retrieval automatically includes today's answers. Draft `status` recorded for future tuning.

### 5.5 Cost & safety

- Haiku at this volume: ~1–3k tokens/draft, expected ≪ $1/month. Hard cap via `max_tokens`.
- Drafts are private (admin + owner email only). Customer never sees anything unsent. API key never in git; wrangler.jsonc unchanged (secret only).

## 6. Rollout order

1. Part A tasks (shell → dashboard → analytics → emails) — each deployable alone; site stays live throughout.
2. D1 migration (ALTER/CREATE SQL above) — pasted in D1 console before the Part B deploy; local dev mirrors via `wrangler d1 execute --local`.
3. Part B (ai.ts + hooks + thread UI + settings) — ships dark until `ANTHROPIC_API_KEY` secret exists; user creates Anthropic account + key as final step (guided, like Resend).

## 7. Error handling & testing

- Every new query/template/scoring helper: vitest unit tests (mocked D1/fetch, matching existing test style). Expected suite grows from 57 to ~75+; invariant = 0 failures.
- AI generation wrapped so any failure degrades to "no draft" — never blocks intake/inbound. Email HTML failures cannot occur at send time (templates are pure functions; sendEmail contract unchanged otherwise).
- Interactive smokes per task via local dev + real D1 data (established pattern): dashboard renders KPIs against seeded data, analytics for each period, draft panel buttons exercised through the UI.
- Regression greps: public-page checks from T17 (beacon, sitemap, robots, og:image) re-run before each push.
