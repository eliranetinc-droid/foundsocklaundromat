# Admin Time Ranges + Readable Durations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed 7d/30d pills with a real time-range selector (Today / Yesterday / Last 7 days / Last 30 days / This week / Last week / This month / Last month / Custom from–to) on BOTH the dashboard and analytics, with same-length previous-period comparisons; and humanize every duration ("0.2h" → "12m", "2.1h" → "2h 6m").

**Architecture:** A pure `ranges.ts` resolver turns a preset (or custom from/to) into ET day-string windows `{start,end,prevStart,prevEnd,label,days,single}`. `db.ts` gains `…Range(db, startDay, endDay)` variants of every period query the two pages consume (old N-day signatures become thin wrappers so digest/tests keep working). A shared `RangePicker.astro` renders the selector as a GET form (URL-persisted, PWA-friendly, no JS lib). Pages resolve the range once and feed start/end everywhere; single-day ranges swap daily line charts for 24-hour bars. `fmt.ts#fmtDuration` humanizes durations at every display site.

**Tech Stack:** Astro 6 SSR on Cloudflare Workers, vitest fake-D1 pattern, Tailwind v4.

**Branch:** `feat/admin-time-ranges` off main (ace63b6). Baseline: 23 test files / 119 tests.

**Conventions locked by owner:** weeks start Sunday; "Last month" (not next); analytics stays bucketed in ET (America/New_York) by design — ranges anchor to the ET calendar.

---

## Task Q1: Range resolver (TDD, pure)

**Files:**
- Create: `src/lib/helpdesk/ranges.ts`
- Test: `src/lib/helpdesk/ranges.test.ts` (create)

- [ ] **Step 1: Write the failing tests** — create `src/lib/helpdesk/ranges.test.ts`:

```ts
import { test, expect, describe } from 'vitest';
import { shiftDay, daysBetween, resolveRange, resolveFromParams } from './ranges';

// 2026-07-15 is a Wednesday (getUTCDay=3 at noon UTC).
const T = '2026-07-15';

describe('day math', () => {
  test('shiftDay moves across month boundaries', () => {
    expect(shiftDay('2026-07-01', -1)).toBe('2026-06-30');
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDay(T, 0)).toBe(T);
  });
  test('daysBetween is inclusive', () => {
    expect(daysBetween('2026-07-01', '2026-07-01')).toBe(1);
    expect(daysBetween('2026-07-01', '2026-07-15')).toBe(15);
  });
});

describe('resolveRange presets (today = Wed 2026-07-15)', () => {
  test('today / yesterday are single days with day-before comparison', () => {
    const r = resolveRange('today', T);
    expect(r).toMatchObject({ start: T, end: T, prevStart: '2026-07-14', prevEnd: '2026-07-14', single: true, days: 1 });
    const y = resolveRange('yesterday', T);
    expect(y).toMatchObject({ start: '2026-07-14', end: '2026-07-14', prevStart: '2026-07-13', prevEnd: '2026-07-13', single: true });
  });
  test('last-7 / last-30 are rolling windows ending today', () => {
    const r = resolveRange('last-7', T);
    expect(r).toMatchObject({ start: '2026-07-09', end: T, prevStart: '2026-07-02', prevEnd: '2026-07-08', days: 7 });
    expect(resolveRange('last-30', T).start).toBe('2026-06-16');
  });
  test('this-week starts Sunday; last-week is the previous full Sun..Sat', () => {
    const r = resolveRange('this-week', T);
    expect(r).toMatchObject({ start: '2026-07-12', end: T, days: 4 });
    expect(r.prevEnd).toBe('2026-07-11');
    expect(r.prevStart).toBe('2026-07-08'); // same length (4 days) immediately before
    const lw = resolveRange('last-week', T);
    expect(lw).toMatchObject({ start: '2026-07-05', end: '2026-07-11', days: 7, prevStart: '2026-06-28', prevEnd: '2026-07-04' });
  });
  test('this-month starts on the 1st; last-month is the full previous month', () => {
    expect(resolveRange('this-month', T)).toMatchObject({ start: '2026-07-01', end: T, days: 15, prevStart: '2026-06-16', prevEnd: '2026-06-30' });
    expect(resolveRange('last-month', T)).toMatchObject({ start: '2026-06-01', end: '2026-06-30', days: 30 });
  });
  test('unknown preset falls back to last-7', () => {
    expect(resolveRange('bogus', T).preset).toBe('last-7');
  });
  test('labels are human', () => {
    expect(resolveRange('today', T).label).toBe('Today');
    expect(resolveRange('last-week', T).label).toBe('Last week');
  });
});

describe('custom + params', () => {
  const params = (q: string) => new URLSearchParams(q);
  test('custom range parses, clamps future end to today, swaps reversed bounds', () => {
    const r = resolveRange('custom', T, { from: '2026-07-03', to: '2026-07-05' });
    expect(r).toMatchObject({ start: '2026-07-03', end: '2026-07-05', days: 3, prevStart: '2026-06-30', prevEnd: '2026-07-02' });
    expect(resolveRange('custom', T, { from: '2026-07-10', to: '2027-01-01' }).end).toBe(T);
    expect(resolveRange('custom', T, { from: '2026-07-05', to: '2026-07-03' }).start).toBe('2026-07-03');
  });
  test('custom with invalid dates falls back to last-7', () => {
    expect(resolveRange('custom', T, { from: 'nope', to: '2026-07-05' }).preset).toBe('last-7');
    expect(resolveRange('custom', T).preset).toBe('last-7');
  });
  test('custom label shows the dates', () => {
    expect(resolveRange('custom', T, { from: '2026-07-03', to: '2026-07-05' }).label).toBe('Jul 3 – Jul 5');
  });
  test('resolveFromParams reads period/from/to and maps legacy values', () => {
    expect(resolveFromParams(params('period=this-week'), T).preset).toBe('this-week');
    expect(resolveFromParams(params('period=custom&from=2026-07-03&to=2026-07-05').entries() && params('period=custom&from=2026-07-03&to=2026-07-05'), T).days).toBe(3);
    expect(resolveFromParams(params('period=7'), T).preset).toBe('last-7');   // legacy pills
    expect(resolveFromParams(params('period=30'), T).preset).toBe('last-30');
    expect(resolveFromParams(params('period=today'), T).preset).toBe('today');
    expect(resolveFromParams(params(''), T).preset).toBe('last-7');           // default
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/lib/helpdesk/ranges.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — create `src/lib/helpdesk/ranges.ts`:

```ts
import { etDay } from './pv';

/** All values are ET calendar-day strings (YYYY-MM-DD). Day math runs on
 * noon-UTC anchors so DST can never shift a calendar day. */
export interface DateRange {
  preset: string;
  start: string; end: string;
  prevStart: string; prevEnd: string;
  label: string; days: number; single: boolean;
}

const noon = (day: string) => new Date(day + 'T12:00:00Z');

export function shiftDay(day: string, n: number): string {
  return new Date(noon(day).getTime() + n * 86400000).toISOString().slice(0, 10);
}
export function daysBetween(a: string, b: string): number {
  return Math.round((noon(b).getTime() - noon(a).getTime()) / 86400000) + 1;
}
const weekdayOf = (day: string) => noon(day).getUTCDay(); // 0 = Sunday

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const fmtShort = (day: string) => noon(day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export const RANGE_PRESETS: { key: string; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last-7', label: 'Last 7 days' },
  { key: 'last-30', label: 'Last 30 days' },
  { key: 'this-week', label: 'This week' },
  { key: 'last-week', label: 'Last week' },
  { key: 'this-month', label: 'This month' },
  { key: 'last-month', label: 'Last month' },
];

function windows(preset: string, start: string, end: string, label: string): DateRange {
  const days = daysBetween(start, end);
  const prevEnd = shiftDay(start, -1);
  const prevStart = shiftDay(prevEnd, -(days - 1));
  return { preset, start, end, prevStart, prevEnd, label, days, single: start === end };
}

/** Resolve a preset (or custom from/to) into concrete ET windows. `today` is
 * injected for testability; callers pass `etDay(new Date())`. */
export function resolveRange(preset: string, today: string, custom?: { from?: string; to?: string }): DateRange {
  switch (preset) {
    case 'today': return windows(preset, today, today, 'Today');
    case 'yesterday': { const y = shiftDay(today, -1); return windows(preset, y, y, 'Yesterday'); }
    case 'last-7': return windows(preset, shiftDay(today, -6), today, 'Last 7 days');
    case 'last-30': return windows(preset, shiftDay(today, -29), today, 'Last 30 days');
    case 'this-week': return windows(preset, shiftDay(today, -weekdayOf(today)), today, 'This week');
    case 'last-week': { const end = shiftDay(today, -weekdayOf(today) - 1); return windows(preset, shiftDay(end, -6), end, 'Last week'); }
    case 'this-month': return windows(preset, today.slice(0, 7) + '-01', today, 'This month');
    case 'last-month': { const end = shiftDay(today.slice(0, 7) + '-01', -1); return windows(preset, end.slice(0, 7) + '-01', end, 'Last month'); }
    case 'custom': {
      const from = custom?.from, to = custom?.to;
      if (!from || !to || !DAY_RE.test(from) || !DAY_RE.test(to)) return resolveRange('last-7', today);
      let [s, e] = from <= to ? [from, to] : [to, from];
      if (e > today) e = today;
      if (s > today) s = today;
      return windows('custom', s, e, `${fmtShort(s)} – ${fmtShort(e)}`);
    }
    default: return resolveRange('last-7', today);
  }
}

/** Read ?period=&from=&to= (mapping the legacy pill values 7/30/90). */
export function resolveFromParams(params: URLSearchParams, today = etDay(new Date())): DateRange {
  const legacy: Record<string, string> = { '7': 'last-7', '30': 'last-30', '90': 'last-30' };
  const raw = params.get('period') ?? 'last-7';
  const preset = legacy[raw] ?? raw;
  return resolveRange(preset, today, { from: params.get('from') ?? undefined, to: params.get('to') ?? undefined });
}
```

- [ ] **Step 4: Gates** — `npx vitest run src/lib/helpdesk/ranges.test.ts` PASSES (12 tests); `npm test` → 24 files / 131 tests / 0 failures; `npm run build` clean; `npx astro check` stays at the 14-error pre-existing baseline.

- [ ] **Step 5: Commit**

```bash
git add src/lib/helpdesk/ranges.ts src/lib/helpdesk/ranges.test.ts
git commit -m "feat(admin): ET date-range resolver — presets, custom, prev-window math"
```

---

## Task Q2: Range query variants in db.ts (TDD)

**Files:**
- Modify: `src/lib/helpdesk/db.ts`
- Test: `src/lib/helpdesk/db.ranges.test.ts` (create)

- [ ] **Step 1: Enumerate the targets.** Read `src/pages/admin/index.astro` and `src/pages/admin/analytics.astro` frontmatter `Promise.all` blocks and list every db function that takes a `days: number` period argument (expected set: `viewsByDay`, `topPages`, `topCountries`, `deviceSplit`, `referrers`, `hoursOfDay`, `viewsByChannel`, `entryPages`, `issueFunnel`, `ticketsPerDay`, plus whatever the dashboard's avg-reply/median stat uses if period-scoped). `viewsInRange` already takes (startDay, endDay) — it is the model.

- [ ] **Step 2: Write failing tests** — create `src/lib/helpdesk/db.ranges.test.ts` using the repo's established fake-D1 pattern (copy the harness style from `db.traffic.test.ts`). Cover at minimum, each with a two-arg day window:
  - `viewsByDayRange` binds both bounds (`day >= ? AND day <= ?`) and returns rows.
  - `topPagesRange`, `referrersRange`, `viewsByChannelRange`, `entryPagesRange`, `hoursOfDayRange`, `topCountriesRange`, `deviceSplitRange` — same bound-both-ends assertion (one test each; assert the SQL the fake receives contains a BETWEEN-or-two-bound day filter and both bind values).
  - `ticketsPerDayRange('2026-07-03','2026-07-05')` buckets by ET day in JS and excludes tickets outside the window (feed created_at values straddling the bounds, incl. an ET-evening edge like `2026-07-06T02:30:00Z` = Jul 5 ET, which must be INCLUDED).
  - `issueFunnelRange` computes {views, tickets, rate} over the window and returns rate null when views = 0.

- [ ] **Step 3: Implement.** For each function above add a `<name>Range(db, startDay, endDay, …same extras)` variant filtering `day >= ?1 AND day <= ?2` (pageview-backed) or the JS `etDay(created_at)` window pattern (ticket-backed — fetch with a ±1-day UTC guard band, then filter `etDay(created_at) >= start && <= end`). Then convert the old N-day functions into thin wrappers, e.g.:

```ts
export const viewsByDay = (db: D1Database, days: number) =>
  viewsByDayRange(db, sinceDay(days), etDay(new Date()));
```

(Only where semantics are provably identical — if any function's SQL does something a wrapper can't reproduce exactly, keep its body and add the Range variant standalone; report which.) The digest and existing pages keep calling the N-day forms unchanged.

- [ ] **Step 4: Gates** — new tests pass; **the existing 130-test suite must pass UNCHANGED** (wrapper equivalence proof); `npm test` → 25 files / ~140 tests (report actual) / 0 failures; build clean; astro check at baseline.

- [ ] **Step 5: Commit**

```bash
git add src/lib/helpdesk/db.ts src/lib/helpdesk/db.ranges.test.ts
git commit -m "feat(db): range-bounded variants of all period queries"
```

---

## Task Q3: fmtDuration (TDD) + apply everywhere

**Files:**
- Create: `src/lib/helpdesk/fmt.ts`
- Test: `src/lib/helpdesk/fmt.test.ts` (create)
- Modify: `src/pages/admin/index.astro` (Avg reply KPI + Resolution card), `src/lib/helpdesk/templates.ts` (digestEmail median row), `src/lib/helpdesk/templates.digest.test.ts` (pin new format)

- [ ] **Step 1: Failing tests** — create `src/lib/helpdesk/fmt.test.ts`:

```ts
import { test, expect, describe } from 'vitest';
import { fmtDuration } from './fmt';

describe('fmtDuration', () => {
  test('null/invalid/negative → em dash', () => {
    expect(fmtDuration(null)).toBe('—');
    expect(fmtDuration(NaN)).toBe('—');
    expect(fmtDuration(-1)).toBe('—');
  });
  test('under a minute', () => { expect(fmtDuration(0)).toBe('<1m'); expect(fmtDuration(0.004)).toBe('<1m'); });
  test('minutes only under an hour', () => {
    expect(fmtDuration(0.2)).toBe('12m');
    expect(fmtDuration(0.99)).toBe('59m');
  });
  test('hours and minutes', () => {
    expect(fmtDuration(1)).toBe('1h');
    expect(fmtDuration(2.1)).toBe('2h 6m');
    expect(fmtDuration(5.5)).toBe('5h 30m');
    expect(fmtDuration(26.5)).toBe('26h 30m');
  });
});
```

- [ ] **Step 2: FAIL → implement** `src/lib/helpdesk/fmt.ts`:

```ts
/** Humanize a duration given in (possibly fractional) hours, minute precision:
 * null/invalid → '—', under a minute → '<1m', under an hour → '12m',
 * otherwise '2h 6m' (bare '2h' when exactly on the hour). */
export function fmtDuration(hours: number | null): string {
  if (hours === null || !Number.isFinite(hours) || hours < 0) return '—';
  const mins = Math.round(hours * 60);
  if (mins < 1) return '<1m';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
```

- [ ] **Step 3: Apply at every duration display site.**
  - `src/pages/admin/index.astro`: import `fmtDuration`; the Avg reply KPI value becomes `fmtDuration(medHrs)` (drop the `'—' : \`${medHrs}h\`` ternary — fmtDuration handles null; pass the UNROUNDED hours value if the current code pre-rounds, check upstream); the Resolution card's median line becomes `fmtDuration(res.medianCloseHours)`.
  - `src/lib/helpdesk/templates.ts` digestEmail: both the text line and the HTML row for 'Median time to close' use `fmtDuration(d.medianCloseHours)` (import from './fmt'); remove the local `'—'` ternaries.
  - `src/lib/helpdesk/templates.digest.test.ts`: add to the first test: `expect(e.html).toContain('5h 30m');` and `expect(e.text).toContain('5h 30m');` (data has medianCloseHours: 5.5).
- [ ] **Step 4: Gates** — `npm test` → 26 files / ~148 tests (report actual) / 0 failures; build clean; astro check baseline.
- [ ] **Step 5: Commit**

```bash
git add src/lib/helpdesk/fmt.ts src/lib/helpdesk/fmt.test.ts src/pages/admin/index.astro src/lib/helpdesk/templates.ts src/lib/helpdesk/templates.digest.test.ts
git commit -m "feat(admin): human-readable durations — 12m / 2h 6m everywhere"
```

---

## Task Q4: RangePicker component + dashboard range plumbing

**Files:**
- Create: `src/components/admin/RangePicker.astro`
- Modify: `src/pages/admin/index.astro`

- [ ] **Step 1: Create `src/components/admin/RangePicker.astro`:**

```astro
---
import { RANGE_PRESETS, type DateRange } from '../../lib/helpdesk/ranges';

export interface Props { range: DateRange; action: string; }
const { range, action } = Astro.props;
const isCustom = range.preset === 'custom';
---
<!-- GET form: the chosen range lives in the URL, so refresh/bookmark/PWA keep it.
     Preset changes submit immediately; Custom reveals date inputs + Apply. -->
<form method="get" action={action} class="flex items-center gap-2 flex-wrap" data-rangepicker>
  <select name="period"
    class="text-sm font-semibold bg-white border border-line rounded-full px-4 py-2 pr-8 cursor-pointer focus:border-brand-blue focus:outline-none">
    {RANGE_PRESETS.map(p => <option value={p.key} selected={range.preset === p.key}>{p.label}</option>)}
    <option value="custom" selected={isCustom}>Custom…</option>
  </select>
  <span class:list={['items-center gap-2', isCustom ? 'flex' : 'hidden']} data-customfields>
    <input type="date" name="from" value={isCustom ? range.start : ''}
      class="text-sm bg-white border border-line rounded-full px-3 py-1.5 focus:border-brand-blue focus:outline-none" />
    <span class="text-sm opacity-50">→</span>
    <input type="date" name="to" value={isCustom ? range.end : ''}
      class="text-sm bg-white border border-line rounded-full px-3 py-1.5 focus:border-brand-blue focus:outline-none" />
    <button type="submit" class="text-sm font-bold px-4 py-1.5 rounded-full bg-brand-blue text-white">Apply</button>
  </span>
</form>
<script is:inline>
  (function () {
    var form = document.querySelector('[data-rangepicker]');
    if (!form) return;
    var sel = form.querySelector('select[name=period]');
    var fields = form.querySelector('[data-customfields]');
    sel.addEventListener('change', function () {
      if (sel.value === 'custom') { fields.classList.remove('hidden'); fields.classList.add('flex'); }
      else { form.querySelectorAll('input[type=date]').forEach(function (i) { i.value = ''; }); form.submit(); }
    });
  })();
</script>
```

- [ ] **Step 2: Rewire `src/pages/admin/index.astro`.**
  - Frontmatter: import `resolveFromParams` from ranges, `fmtDuration` already imported (Q3), and the Range query variants. Replace the `periodParam`/`period` logic with `const range = resolveFromParams(Astro.url.searchParams);`.
  - Data fetch: visitors = `viewsInRange(db, range.start, range.end)` vs `viewsInRange(db, range.prevStart, range.prevEnd)`; tickets series = `ticketsPerDayRange` over both windows (gap-fill each to `range.days` via `shiftDay`); sparklines from the current-window series; when `range.single`, the visitors sparkline/hour chart uses `hoursOfDayRange(db, range.start, range.end)` (24-entry gap-fill, exactly like the current today-branch).
  - KPI labels: `New · {range.label}` (short label fine). Delta chips compare current vs previous windows as today.
  - Traffic card header shows `Traffic · {range.label}`; `range.single` → hour bars branch; else `topPagesRange` list.
  - Replace the pills `<div>` with `<RangePicker range={range} action="/admin/" />`.
  - Machine watch / AI assistant / Resolution cards: UNCHANGED (fixed 90d/30d/90d windows by design).
- [ ] **Step 3: Gates** — suite unchanged from Q3 count; build clean; curls 200 for `/admin/`, `/admin/?period=today`, `?period=yesterday`, `?period=this-week`, `?period=last-week`, `?period=this-month`, `?period=last-month`, `?period=custom&from=2026-07-01&to=2026-07-10`, and legacy `?period=7`, `?period=30`; grep the default page for `Last 7 days` = present.
- [ ] **Step 4: Interactive smoke** (dev server on 4321; preview_list first; clear auto-refresh timers): switch presets via the select (URL updates, data re-renders), pick Custom + apply a from/to, verify Today shows the hour chart, console clean. Screenshot.
- [ ] **Step 5: Commit**

```bash
git add src/components/admin/RangePicker.astro src/pages/admin/index.astro
git commit -m "feat(admin): dashboard time-range selector — presets + custom, prev-window deltas"
```

---

## Task Q5: Analytics range plumbing

**Files:**
- Modify: `src/pages/admin/analytics.astro`

- [ ] **Step 1: Rewire frontmatter.** `const range = resolveFromParams(Astro.url.searchParams);` replaces the 7/30/90 param logic. Fetch: `views = viewsByDayRange(db, range.start, range.end)`, `prevViews = viewsByDayRange(db, range.prevStart, range.prevEnd)` (two calls replace the 2×period fetch+split); `prevTotal = viewsInRange(db, range.prevStart, range.prevEnd)`; every card query switches to its Range variant with `(range.start, range.end)`; gap-fill both windows to `range.days` using `shiftDay(range.start, i)` / `shiftDay(range.prevStart, i)`.
- [ ] **Step 2: Charts.** Keep the daily line + ghost + legend for multi-day ranges (x-axis labels `range.start.slice(5)` / `range.end.slice(5)`). When `range.single`, render instead a 24-bar hourly chart for that day (`hoursOfDayRange(db, range.start, range.end)`, same bar markup as Busiest hours, with the 12a/6a/12p/6p/11p axis) and suppress the ghost legend row; the delta chip still compares vs the previous day. Busiest hours + weekday cards now compute over the range (`hoursOfDayRange`; weekday aggregation unchanged over the gap-filled current series).
- [ ] **Step 3: Selector.** Replace the 7/30/90 pill row with `<RangePicker range={range} action="/admin/analytics/" />`. Header shows `range.label`.
- [ ] **Step 4: Gates** — suite unchanged; build clean; curls 200 for `/admin/analytics/` with the same 10 period/custom/legacy variants as Q4; grep default page: `Channels` ≥1, `Entry pages` ≥1, legend `Previous period` present on multi-day, absent on `?period=today`.
- [ ] **Step 5: Interactive smoke**: preset switching, custom range, single-day hourly swap, ghost line on This month, console clean. Screenshot.
- [ ] **Step 6: Commit**

```bash
git add src/pages/admin/analytics.astro
git commit -m "feat(analytics): time-range selector — presets, custom, single-day hourly view"
```

---

## Task Q6: Verify + deploy (controller + owner)

- [ ] Controller: full gates (suite, build, handlers-in-chunk, route battery incl. custom + legacy params on both pages), interactive spot-check of both selectors, merge → main, push (owner confirms with "push"), no migration.
- [ ] Owner: live checks — flip through the presets on both pages, run one custom range, confirm Avg reply / Median time to close / Monday digest read like "12m" / "2h 6m".

---

## Plan self-review (author)
- Coverage: selector on BOTH pages (Q4/Q5) with presets incl. custom (Q1) and full data plumbing (Q2); durations humanized at all three display sites (Q3); owner conventions (Sunday weeks, last-month, custom) locked in header.
- Types: `DateRange` defined Q1, consumed Q4/Q5; Range query signatures defined Q2, consumed Q4/Q5; `fmtDuration(hours: number | null)` matches `medHrs`/`medianCloseHours` nullability.
- Legacy URLs (`?period=7/30/90/today`) keep working via the resolver map — old bookmarks and the admin PWA cold-start URL never 404 or blank.
- Test math: 119 + 12 (Q1) + ~8 (Q2) + 7 (Q3, plus digest pins) ≈ 145+; exact counts reported per task, reviewers verify consistency.
- Deliberately unchanged: fixed-window ops cards (Machine watch 90d / AI 30d / Resolution 90d); recent-visits table; ET bucketing convention.
