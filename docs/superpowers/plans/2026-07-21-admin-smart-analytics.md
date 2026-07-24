# Admin Smart Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Owner-picked upgrades: (0) Today becomes the default range everywhere with an HONEST comparison (vs yesterday-to-the-same-hour); (1) named campaign/QR tracking (`?src=` / `utm_*` → Campaigns card, wall-sign QR re-issued as `?src=qr-sign`); (2) a week×hour busiest-times heatmap replacing the two mini bar charts; (3) channel-mix-by-day stacked chart, ▲▼ mover columns on Top pages/Referrers, and a plain-English insight strip on the dashboard.

**Architecture:** Beacon gains one field (`s: location.search`); the server derives a sanitized `campaign` label (src > utm_campaign > utm_source) into a new nullable `pageviews.campaign` column (prod migration #5, additive-safe). New range queries: campaignsRange, heatmapRange, channelsByDayRange, ticketHeatRange, medianFirstReplyHoursRange. A pure `insights.ts` turns simple aggregates into at most two threshold-gated callouts. Pages consume all of it; cookie-free stance unchanged (campaign labels are URL data, not visitor identity).

**Tech Stack:** Astro 6 SSR on Cloudflare Workers, vitest fake-D1, Tailwind v4.

**Branch:** `feat/admin-smart-analytics` off main (9725afa). Baseline: 26 test files / 146 tests.

**Prod migration #5 (owner pastes in D1 console BEFORE the final push):** `ALTER TABLE pageviews ADD COLUMN campaign TEXT;` — safe under old code (its INSERT names columns explicitly).

---

## Task S1: Today is the default range (TDD)

**Files:**
- Modify: `src/lib/helpdesk/ranges.ts`, `src/lib/helpdesk/ranges.test.ts`

- [ ] **Step 1: Update the tests first.** In `ranges.test.ts`: the three fallback expectations currently pinned to `'last-7'` (unknown preset, custom-with-invalid-dates ×2) change to `'today'`; the `resolveFromParams(params(''), T).preset` expectation changes from `'last-7'` to `'today'`. ADD one test:

```ts
  test('today is the default and fallback everywhere', () => {
    expect(resolveFromParams(new URLSearchParams(''), T).preset).toBe('today');
    expect(resolveRange('nonsense', T).preset).toBe('today');
    expect(resolveRange('custom', T).preset).toBe('today');
  });
```

- [ ] **Step 2: Run → FAIL** (code still falls back to last-7).
- [ ] **Step 3: Implement** in `ranges.ts`: the two `return resolveRange('last-7', today)` fallbacks (custom-invalid, switch default) become `resolveRange('today', today)`; in `resolveFromParams` the `?? 'last-7'` default becomes `?? 'today'`. Legacy map for `'7'`/`'30'`/`'90'` stays exactly as-is.
- [ ] **Step 4: Gates** — ranges tests pass (13); `npm test` → 26 files / 147 tests / 0 failures; build clean; astro check at 14-error baseline.
- [ ] **Step 5: Commit** `git add src/lib/helpdesk/ranges.ts src/lib/helpdesk/ranges.test.ts` → `feat(admin): Today is the default range everywhere`

---

## Task S2: Campaign capture end-to-end (TDD)

**Files:**
- Modify: `db/schema.sql`, `src/lib/helpdesk/pv.ts`, `src/lib/helpdesk/pv.test.ts`, `src/components/Layout.astro`, `src/pages/api/pv.ts`, `src/lib/helpdesk/db.ts`

- [ ] **Step 1: Failing tests** — append to `pv.test.ts`:

```ts
describe('campaignFrom', () => {
  test('src wins, then utm_campaign, then utm_source', () => {
    expect(campaignFrom('?src=qr-sign&utm_campaign=x&utm_source=y')).toBe('qr-sign');
    expect(campaignFrom('?utm_campaign=spring-promo&utm_source=ig')).toBe('spring-promo');
    expect(campaignFrom('?utm_source=google-business')).toBe('google-business');
  });
  test('absent/empty/junk-only → null', () => {
    expect(campaignFrom('')).toBe(null);
    expect(campaignFrom('?foo=bar')).toBe(null);
    expect(campaignFrom('?src=%3Cscript%3E')).toBe('script');
    expect(campaignFrom('?src=!!!')).toBe(null);
  });
  test('sanitizes to lowercase slug, max 40 chars', () => {
    expect(campaignFrom('?src=QR Sign #2')).toBe('qr sign 2');
    expect(campaignFrom('?src=' + 'a'.repeat(60))).toBe('a'.repeat(40));
  });
});
```

(Add `campaignFrom` to the existing pv.ts import line.)

- [ ] **Step 2: FAIL → implement** in `pv.ts`:

```ts
/** Campaign label from a landing URL's query string: ?src= wins, then
 * utm_campaign, then utm_source. Sanitized to a lowercase [a-z0-9 _-] slug
 * (max 40 chars) so arbitrary URL junk can't reach the admin. Null when absent. */
export function campaignFrom(search: string): string | null {
  let params: URLSearchParams;
  try { params = new URLSearchParams(search); } catch { return null; }
  const raw = params.get('src') || params.get('utm_campaign') || params.get('utm_source') || '';
  const slug = raw.toLowerCase().replace(/[^a-z0-9 _-]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 40).trim();
  return slug || null;
}
```

- [ ] **Step 3: Wire the pipeline.**
  - `db/schema.sql`: add `campaign TEXT` to the pageviews CREATE TABLE (after `device`), plus the migration comment convention used by earlier migrations: `-- migration #5 (2026-07-21): ALTER TABLE pageviews ADD COLUMN campaign TEXT;`
  - `src/components/Layout.astro` beacon line: `navigator.sendBeacon('/api/pv/', JSON.stringify({ p: location.pathname, r: document.referrer, s: location.search }));`
  - `src/pages/api/pv.ts`: type widens to `{ p?: unknown; r?: unknown; s?: unknown }`; import `campaignFrom`; pass `campaign: campaignFrom(typeof data.s === 'string' ? data.s : '')` to insertPageview.
  - `src/lib/helpdesk/db.ts` `insertPageview`: input gains `campaign: string | null`; INSERT gains the `campaign` column and bind (8 columns total). If any existing test pins the 7-column INSERT SQL, update it in the same commit and report it.
  - **Local dev DB**: apply the migration to the ACTIVE local sqlite so dev keeps working — find it under `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/` (the one whose `.tables` includes `settings`; historically `bc896c….sqlite`), then `sqlite3 <file> "ALTER TABLE pageviews ADD COLUMN campaign TEXT;"`. Verify with `.schema pageviews`. (Local file only — NEVER any remote/wrangler-remote command.)
- [ ] **Step 4: Gates** — pv tests pass; `npm test` → 26 files / 150 tests / 0 failures (147 + 3); build clean; astro check baseline; dev-server smoke: `curl -s -X POST http://localhost:4321/api/pv/ -H 'Content-Type: application/json' -H "Origin: http://localhost:4321" -d '{"p":"/","r":"","s":"?src=qr-sign"}' -o /dev/null -w "%{http_code}"` → 204, then `sqlite3 <active file> "SELECT campaign FROM pageviews ORDER BY id DESC LIMIT 1;"` → `qr-sign` (clean up: DELETE that probe row by id and confirm).
- [ ] **Step 5: Commit** (all six files) → `feat(analytics): capture campaign labels from src/utm params`

---

## Task S3: New range queries (TDD)

**Files:**
- Modify: `src/lib/helpdesk/db.ts`
- Test: extend `src/lib/helpdesk/db.ranges.test.ts`

- [ ] **Step 1: Failing tests** (fake-D1 harness already in the file): `campaignsRange` binds both bounds and filters `campaign IS NOT NULL AND campaign != ''`; `heatmapRange` binds both bounds and returns `{day, hour, views}` rows; `channelsByDayRange` classifies per-day referrer hosts into the four channels (feed two days × google/direct rows, assert per-day totals); `ticketHeatRange` buckets tickets into ET `{day, hour}` within the window (reuse the `2026-07-06T02:30:00Z` = Jul 5 10:30pm ET edge — must land day `2026-07-05`, hour 22); `medianFirstReplyHoursRange` mirrors `medianFirstReplyHours` with explicit bounds (check its SQL/JS shape first and mirror with `created_at`-window guard band if it post-filters in JS).
- [ ] **Step 2: FAIL → implement** following the file's established Range conventions (day bounds for pageview-backed, guard-band + `etDayHour` JS filter for ticket-backed):

```ts
export const campaignsRange = (db: D1Database, startDay: string, endDay: string, limit = 8) =>
  db.prepare(
    `SELECT campaign, COUNT(*) AS n FROM pageviews
     WHERE day >= ? AND day <= ? AND campaign IS NOT NULL AND campaign != ''
     GROUP BY campaign ORDER BY n DESC LIMIT ?`
  ).bind(startDay, endDay, limit).all<{ campaign: string; n: number }>().then(r => r.results);

export const heatmapRange = (db: D1Database, startDay: string, endDay: string) =>
  db.prepare(
    `SELECT day, hour, COUNT(*) AS views FROM pageviews
     WHERE day >= ? AND day <= ? AND hour IS NOT NULL GROUP BY day, hour`
  ).bind(startDay, endDay).all<{ day: string; hour: number; views: number }>().then(r => r.results);
```

`channelsByDayRange`: SQL `SELECT day, referrer_host, COUNT(*) AS views … GROUP BY day, referrer_host`, then JS-fold via `channelOf` into `{ day, Direct, Search, Social, Referral }[]` (day-ascending). `ticketHeatRange`: guard-band fetch of `created_at`, JS `etDayHour(new Date(created_at))`, filter day within bounds, fold to `{ day, hour, n }[]`.
- [ ] **Step 3: Gates** — `npm test` → 26 files / ~155 tests (report actual) / 0 failures; existing tests untouched and passing; build clean; astro check baseline.
- [ ] **Step 4: Commit** → `feat(db): campaign, heatmap, channel-trend, ticket-heat, reply-median range queries`

---

## Task S4: insights.ts (TDD, pure)

**Files:**
- Create: `src/lib/helpdesk/insights.ts`
- Test: `src/lib/helpdesk/insights.test.ts` (create)

- [ ] **Step 1: Failing tests** — pin these behaviors (write the concrete cases yourself, one per rule + one per suppression):
  - Pace rule (before 18:00 ET): yesterdayToNow = sum of `yesterdayByHour[0..currentHour]`; fires only when both ≥5 views and ratio ≥1.5 (🔥 "ahead of yesterday's pace (X vs Y by 3pm)") or ≤0.5 (🌙 quiet variant). After 18:00: compares `todayViews` vs `median(sameWeekdayTotals)` with the same thresholds ("… your typical Wednesday").
  - Tickets rule: fires when `weekTickets >= median(priorWeeksTickets) + 2` (⚠️ "N machine issues this week — typical is M").
  - Reply rule: fires when both medians non-null, prev ≥ 2× current and prev ≥ 0.5h (⚡ "Median reply Xm — down from Yh Zm", strings via fmtDuration).
  - Cap: returns at most 2, priority pace > tickets > reply; empty array when nothing clears thresholds (sparse data must produce NO noise).
- [ ] **Step 2: FAIL → implement**:

```ts
import { fmtDuration } from './fmt';

export interface Insight { emoji: string; text: string; }

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const label12 = (h: number) => (h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`);
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Deterministic, threshold-gated callouts (max 2). Quiet by default: sparse or
 * unremarkable data yields []. All inputs are plain aggregates the pages already
 * know how to fetch; no I/O here. */
export function computeInsights(input: {
  todayViews: number;
  currentHour: number;            // ET, 0-23
  weekday: number;                // ET, 0=Sunday
  yesterdayByHour: number[];      // 24 buckets
  sameWeekdayTotals: number[];    // full-day totals of the last few same weekdays
  weekTickets: number;
  priorWeeksTickets: number[];    // totals of prior full weeks
  medianReplyHours: number | null;
  prevMedianReplyHours: number | null;
}): Insight[] {
  const out: Insight[] = [];
  const { todayViews, currentHour } = input;

  if (currentHour < 18) {
    const pace = input.yesterdayByHour.slice(0, currentHour + 1).reduce((a, b) => a + b, 0);
    if (todayViews >= 5 && pace >= 5) {
      const r = todayViews / pace;
      if (r >= 1.5) out.push({ emoji: '🔥', text: `Today is ahead of yesterday's pace (${todayViews} vs ${pace} by ${label12(currentHour)})` });
      else if (r <= 0.5) out.push({ emoji: '🌙', text: `Quieter than yesterday so far (${todayViews} vs ${pace} by ${label12(currentHour)})` });
    }
  } else {
    const typical = median(input.sameWeekdayTotals);
    if (todayViews >= 5 && typical >= 5) {
      const r = todayViews / typical;
      if (r >= 1.5) out.push({ emoji: '🔥', text: `Today is ${(Math.round(r * 10) / 10)}× your typical ${WEEKDAYS[input.weekday]} (${todayViews} vs ~${Math.round(typical)})` });
      else if (r <= 0.5) out.push({ emoji: '🌙', text: `Quieter than a typical ${WEEKDAYS[input.weekday]} (${todayViews} vs ~${Math.round(typical)})` });
    }
  }

  const typicalTickets = median(input.priorWeeksTickets);
  if (input.weekTickets >= typicalTickets + 2) {
    out.push({ emoji: '⚠️', text: `${input.weekTickets} machine issues this week — typical is ${Math.round(typicalTickets)}` });
  }

  const { medianReplyHours: cur, prevMedianReplyHours: prev } = input;
  if (cur !== null && prev !== null && prev >= 0.5 && prev >= 2 * cur) {
    out.push({ emoji: '⚡', text: `Median reply ${fmtDuration(cur)} — down from ${fmtDuration(prev)}` });
  }

  return out.slice(0, 2);
}
```

- [ ] **Step 3: Gates** — insights tests pass; `npm test` → 27 files / ~163 tests (report actual) / 0 failures; build clean; astro check baseline (insights files clean).
- [ ] **Step 4: Commit** → `feat(admin): pure insight engine — pace, issue spikes, reply-time wins`

---

## Task S5: Analytics page — campaigns, heatmap, trend, movers, honest today

**Files:**
- Modify: `src/pages/admin/analytics.astro`

- [ ] All data joins the single `Promise.all`: `campaignsRange`, `heatmapRange`, `channelsByDayRange`, `ticketHeatRange`, prev-window `topPagesRange` + `referrersRange` (for movers), and for today-preset the prev-window `hoursOfDayRange` (honest delta).
- [ ] **Honest today delta**: when `range.preset === 'today'`, `prevTotal` becomes the sum of yesterday's hour buckets `0..currentHour` (ET hour via `new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(new Date())` parsed to int); the delta chip caption reads `vs yesterday to {h}` (reuse the page's `label12`). All other presets unchanged.
- [ ] **Campaigns card**: new `grid grid-cols-1 md:grid-cols-2 gap-4 mb-6` row: LEFT "Campaigns" (rows: campaign label + n + mini-bar, same style as Channels; empty state "No tagged visits yet — links with ?src=name land here."), RIGHT "Channel mix by day" (stacked bars: one column per day, segments Direct/Search/Social/Referral with fixed colors `#0F2A4A/#2f6f9f/#e2a33a/#9ca3af`, tiny legend; hide the card for single-day ranges).
- [ ] **Heatmap card** replaces BOTH the "Busiest hours" and "Busiest weekday" sections: title `Busiest times <span class="font-normal opacity-45">(Eastern)</span>`; CSS grid `grid-template-columns: 32px repeat(24, 1fr)`; 7 rows Sun..Sat; cell = `<div title="Tue 2pm: 9 views">` with `background: rgba(47,111,159, alpha)` where alpha = views/max (min 0.04 when >0, 0 when 0); an amber 3px corner dot on cells where `ticketHeatRange` has n>0 (title gains "· N issue(s)"); column labels 12a/6a/12p/6p/11p under the grid. Weekday rows aggregate across the selected range by ET weekday of `day` (noon-UTC trick, as elsewhere).
- [ ] **Movers**: Top pages and Referrers rows gain a small right-aligned chip vs the previous window: `▲n` (emerald) / `▼n` (red) / `new` (blue) / nothing when unchanged; prev maps built from the prev-window fetches keyed by path/host.
- [ ] Gates: suite unchanged from S4 count; build clean; astro check baseline; curls 200 across the 13-variant battery; default (`/admin/analytics/`) now renders the TODAY view (grep: `<option value="today" selected`); greps `Campaigns` ≥1, `Busiest times` ≥1, old `Busiest weekday` heading GONE; 375px probe (scrollWidth==375, heatmap must scroll inside its own `overflow-x-auto` wrapper if it can't fit). Interactive smoke incl. screenshots (default today view + a multi-day view with stacked chart + heatmap).
- [ ] Commit → `feat(analytics): campaigns card, busiest-times heatmap, channel trend, movers, honest today delta`

---

## Task S6: Dashboard — insight strip + honest today

**Files:**
- Modify: `src/pages/admin/index.astro`

- [ ] Fetches join the main `Promise.all`: yesterday's `hoursOfDayRange` (always — cheap, needed when `range.preset==='today'` for the honest delta AND for insights), `viewsByDayRange` over the last 28 ET days (for sameWeekdayTotals — filter to the current ET weekday, exclude today, take up to 4 full-day totals), `ticketsPerDayRange` over the last 35 days (fold into current-week total (last 7 incl today) and 4 prior 7-day totals), `medianFirstReplyHoursRange` for the last 30 days and the 30 before (insight inputs; the fixed `medianFirstReplyHours(env.DB, 30)` KPI call stays).
- [ ] `computeInsights(...)` renders as a slim strip ABOVE the KPI row — one rounded card per insight (`bg-white border border-line rounded-2xl px-4 py-2.5 text-sm` with the emoji leading); render nothing when the array is empty (no empty container).
- [ ] **Honest today delta** for the Visitors KPI, same rule and caption approach as S5 (KpiTile delta prop gets prev = yesterday-to-now when preset is today; add a `title` attr or small caption `vs yesterday to {h}` — match KpiTile's existing API, extend it minimally ONLY if it can't express a caption).
- [ ] Gates: suite unchanged; build clean; astro check baseline; curls 200 (12-variant dashboard battery); default `/admin/` renders TODAY (grep selected option); 375px probe clean; interactive smoke + screenshot (strip visible with seeded data if thresholds allow — otherwise verify empty-state renders nothing and prove the strip via a temporary threshold-crossing probe INSERT that you then delete).
- [ ] Commit → `feat(admin): dashboard insight strip + honest today comparison`

---

## Task S7: Verify + deploy (controller + owner)

- [ ] Controller: full gates; interactive spot-check of both pages (today default, campaigns empty-state, heatmap, movers, insight strip); merge → main; **owner pastes migration #5 FIRST** (`ALTER TABLE pageviews ADD COLUMN campaign TEXT;`); owner says "push"; push.
- [ ] Controller post-deploy: regenerate the wall-sign QR as `https://foundsocklaundromat.com/report-issue/?src=qr-sign` (same pipeline as before: 4 QR files + the fixed customer-service sign PDF/PNG, decode-verified, refreshed in print/ + Downloads). Note to owner: any copy already at the printer still works — it just counts as Direct instead of "qr-sign".
- [ ] Owner: live checks — today default on both pages, scan the new QR once (a `qr-sign` row should appear in Campaigns within a minute), watch the heatmap fill over days.

---

## Plan self-review (author)
- Coverage: Today default (S1, both pages inherit via resolver); honest today comparison (S5+S6); campaigns end-to-end incl. sign re-issue (S2+S3+S5+S7); heatmap (S3+S5); trend+movers (S3+S5); callouts (S4+S6).
- Types: campaignFrom string|null → insertPageview campaign column; heat/channel/campaign row shapes defined in S3 and consumed in S5; Insight[] from S4 consumed in S6; fmtDuration reused.
- Privacy: campaign labels are sanitized URL slugs, never identity; no cookies/IDs introduced.
- Migration ordering: additive column, owner pastes before push (same discipline as closed_at).
- Test math: 146 +1 (S1) +3 (S2) +~5 (S3) +~8 (S4) ≈ 163; exact counts reported per task.
