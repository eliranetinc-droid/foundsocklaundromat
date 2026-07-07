# Admin v2 + AI Reply Assistant — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Found Sock admin (shell, dashboard, analytics) to BBRM-admin quality in Found Sock branding, replace plain-text emails with branded HTML, and add a Claude-powered reply assistant that drafts replies from the owner's own history — approve-before-send only.

**Architecture:** Astro 6 SSR on Cloudflare Workers. Server-rendered admin pages read D1 via `src/lib/helpdesk/db.ts`. New presentational Astro components (Sparkline, KpiTile) are pure SVG/markup — no chart libraries. AI: pure context-assembly helpers (`ai-context.ts`, TDD) + a thin Anthropic client (`ai.ts`) + an orchestration function that persists drafts to a new `ai_drafts` table; drafts surface in the thread UI and owner email but never auto-send. Every generation is failure-tolerant — an AI or email outage can never break ticket intake.

**Tech Stack:** Astro 6, Cloudflare D1/R2, Resend HTTPS API, Anthropic Messages API (`claude-haiku-4-5-20251001`), vitest.

**Branch:** `feat/admin-helpdesk` is merged; this work happens on a NEW branch `feat/admin-v2` off `main`. Deploys via `git push` to `main` only. Push auth: `TOKEN=$(gh auth token --user eliranetinc-droid) && git push "https://x-access-token:${TOKEN}@github.com/eliranetinc-droid/foundsocklaundromat.git" <branch>`.

**Live-system rules (do not violate):**
- Identity privacy: no personal email/phone in any customer-facing template. Tests assert this.
- 100/100 PSI: public pages (everything outside `/admin` and `/api/admin`) must not change. Only touch admin + helpdesk lib + email templates.
- Trailing slash: every fetch/link/img URL under the app ends with `/` (`trailingSlash:'always'` → no-slash 308s in prod / 404s in dev).
- Times display in `America/New_York` (already the case in the 3 admin `fmt` helpers — keep it).
- Two migrations touch prod D1 (analytics `hour` column; AI `ai_drafts`+`settings` tables). They are applied by hand in the Cloudflare D1 console at deploy time (Tasks 6 and 13 call this out). Local dev mirrors via `npx wrangler d1 execute foundsock-helpdesk --local`.

**Current test baseline:** 10 files / 57 tests passing. Each TDD task raises the count; the invariant is **0 failures**, counts are approximate.

---

## File Structure

**Part A — Admin v2**
- `src/components/admin/AdminLayout.astro` — REWRITE: sidebar + topbar shell, open-ticket badge.
- `src/components/admin/Sparkline.astro` — CREATE: pure-SVG trend line for KPI tiles.
- `src/components/admin/KpiTile.astro` — CREATE: label + value + sparkline + delta chip.
- `src/pages/admin/index.astro` — REWRITE: dense dashboard.
- `src/pages/admin/analytics.astro` — REWRITE: period selector + charts.
- `src/lib/helpdesk/db.ts` — EXTEND: dashboard + analytics queries.
- `src/lib/helpdesk/pv.ts` — EXTEND: ET day/hour helper (pure, tested).
- `src/pages/api/pv.ts` — MODIFY: store ET hour.
- `db/schema.sql` — EXTEND: `hour` column, `ai_drafts`, `settings`.
- `src/lib/helpdesk/templates.ts` — REWRITE: HTML+text emails.
- `src/lib/helpdesk/resend.ts` — already accepts `html` (no change needed; verify).
- `src/lib/helpdesk/intake.ts`, `src/lib/helpdesk/inbound.ts`, `src/pages/api/admin/reply.ts` — MODIFY: pass `html`, richer notification, AI draft.

**Part B — AI**
- `src/lib/helpdesk/ai-context.ts` — CREATE: pure retrieval + prompt assembly (TDD).
- `src/lib/helpdesk/ai.ts` — CREATE: Anthropic client + `generateDraftForTicket` orchestration.
- `src/lib/helpdesk/env.ts` — MODIFY: add optional `ANTHROPIC_API_KEY`.
- `src/pages/api/admin/ai-draft.ts`, `src/pages/api/admin/draft-status.ts`, `src/pages/api/admin/settings.ts` — CREATE: Access-gated JSON routes.
- `src/pages/admin/tickets/[id].astro` — MODIFY: AI suggestion panel + JS.
- `src/pages/admin/settings.astro` — CREATE: AI toggle + house-rules editor.

---

## Task 1: Admin shell — sidebar + topbar

**Files:**
- Modify (rewrite): `src/components/admin/AdminLayout.astro`

Rationale: the shell is presentational and shared by every admin page via `<AdminLayout title=…>`; rewriting it alone re-skins the whole admin without touching page content. Settings nav item is added later (Task 12) so no dead link ships now.

- [ ] **Step 1: Rewrite the file to exactly:**

```astro
---
import '../../styles/global.css';
import { getHelpdeskEnv } from '../../lib/helpdesk/env';
import { countOpenTickets } from '../../lib/helpdesk/db';

export interface Props { title: string; }
const { title } = Astro.props;

// Open-ticket badge is best-effort; a DB hiccup must not blank the whole admin.
let openCount = 0;
try { openCount = await countOpenTickets((await getHelpdeskEnv()).DB); } catch {}

const nav = [
  { href: '/admin/', label: 'Dashboard', icon: '▚' },
  { href: '/admin/tickets/', label: 'Tickets', icon: '✉' },
  { href: '/admin/analytics/', label: 'Analytics', icon: '▟' },
];
const path = Astro.url.pathname.endsWith('/') ? Astro.url.pathname : Astro.url.pathname + '/';
const isActive = (href: string) => path === href || (href !== '/admin/' && path.startsWith(href));
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
  <body class="bg-cream text-brand-blue-darker antialiased lg:flex min-h-screen">
    <!-- On lg the body is a flex row (sidebar column + content). On mobile the
         sidebar is a fixed drawer toggled by JS (inline transform beats Tailwind
         v4's cascade layers, which defeat a pure-CSS :checked sibling override). -->
    <aside id="adminSidebar" class="fixed inset-y-0 left-0 z-30 w-64 bg-brand-blue-darker text-white flex flex-col
                  transition-transform lg:static lg:shrink-0">
      <div class="px-5 py-4 border-b border-white/10">
        <a href="/admin/" class="font-bold tracking-tight text-lg">Found Sock <span class="opacity-60 font-normal">Admin</span></a>
      </div>
      <nav class="flex-1 px-3 py-4 space-y-1 text-sm">
        {nav.map(item => (
          <a href={item.href}
             class:list={['flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
               isActive(item.href) ? 'bg-white/10 font-semibold text-white' : 'text-white/60 hover:text-white hover:bg-white/5']}>
            <span class="w-4 text-center opacity-80">{item.icon}</span>{item.label}
          </a>
        ))}
      </nav>
      <div class="px-3 py-4 border-t border-white/10">
        <a href="/" class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-white/50 hover:text-white hover:bg-white/5 text-sm">
          <span class="w-4 text-center">↗</span>View site
        </a>
      </div>
    </aside>
    <!-- Dim overlay behind mobile drawer (shown/hidden by JS) -->
    <div id="navOverlay" class="fixed inset-0 z-20 bg-black/30 hidden lg:hidden"></div>

    <div class="flex-1 flex flex-col min-h-screen min-w-0">
      <!-- Topbar -->
      <header class="sticky top-0 z-10 bg-white border-b border-line">
        <div class="px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <button type="button" id="navOpen" class="lg:hidden cursor-pointer text-xl leading-none px-1" aria-label="Open menu">☰</button>
            <h1 class="text-base font-bold tracking-tight truncate">{title}</h1>
          </div>
          <a href="/admin/tickets/" class:list={['text-xs font-bold px-3 py-1.5 rounded-full',
               openCount > 0 ? 'bg-brand-red text-white' : 'bg-brand-blue/10 text-brand-blue']}>
            {openCount} open
          </a>
        </div>
      </header>
      <main class="flex-1 p-4 sm:p-6 max-w-6xl w-full">
        <slot />
      </main>
    </div>

    <style is:global>
      /* Mobile: drawer closed by default; JS sets inline transform to open it.
         Desktop: sidebar is a static flex column, never transformed. */
      #adminSidebar { transform: translateX(-100%); }
      @media (min-width: 1024px) { #adminSidebar { transform: none !important; } }
    </style>
    <script is:inline>
      (function () {
        var aside = document.getElementById('adminSidebar');
        var overlay = document.getElementById('navOverlay');
        var openBtn = document.getElementById('navOpen');
        function open() { aside.style.transform = 'translateX(0)'; overlay.classList.remove('hidden'); }
        function close() { aside.style.transform = ''; overlay.classList.add('hidden'); }
        openBtn && openBtn.addEventListener('click', open);
        overlay && overlay.addEventListener('click', close);
      })();
    </script>
  </body>
</html>
```

- [ ] **Step 2: Build + smoke against the running dev server (port 4321).**

```bash
cd "/Users/eliranderei/Found Sock Laundromat"
npm run build 2>&1 | tail -2   # must end "[build] Complete!"
curl -s http://localhost:4321/admin/ | grep -c 'Found Sock'          # >=1
curl -s http://localhost:4321/admin/ | grep -c 'open'                 # >=1 (badge)
curl -s http://localhost:4321/admin/tickets/ | grep -c 'Tickets'      # >=1 (page still renders in new shell)
```

- [ ] **Step 3: Run the suite (no logic changed — must stay green).**

```bash
npm test 2>&1 | grep -E "Test Files|Tests "   # 10 files / 57 tests, 0 failures
```

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/AdminLayout.astro
git commit -m "feat(admin): sidebar + topbar shell with open-ticket badge"
```

---

## Task 2: Dashboard data queries (TDD)

**Files:**
- Modify: `src/lib/helpdesk/db.ts`
- Test: `src/lib/helpdesk/db.dashboard.test.ts` (create)

These three queries feed the new dashboard. They are unit-tested with a hand-rolled fake D1 so no live database is needed.

- [ ] **Step 1: Write the failing test** — create `src/lib/helpdesk/db.dashboard.test.ts`:

```ts
import { test, expect, describe } from 'vitest';
import { medianFirstReplyHours, ticketsPerDay, needsAttention } from './db';

// Minimal fake D1: prepare().bind().all()/first() returning canned rows keyed by SQL fragments.
function fakeDb(handlers: { match: RegExp; rows?: any[]; first?: any }[]) {
  return {
    prepare(sql: string) {
      const h = handlers.find(x => x.match.test(sql));
      return {
        bind() { return this; },
        async all() { return { results: h?.rows ?? [] }; },
        async first() { return h?.first ?? null; },
      };
    },
  } as any;
}

describe('medianFirstReplyHours', () => {
  test('returns median hours across tickets with a reply', async () => {
    // three tickets: 1h, 3h, 5h → median 3
    const db = fakeDb([{ match: /firsts/, rows: [
      { fin: '2026-07-01T10:00:00.000Z', fout: '2026-07-01T11:00:00.000Z' }, // 1h
      { fin: '2026-07-01T10:00:00.000Z', fout: '2026-07-01T13:00:00.000Z' }, // 3h
      { fin: '2026-07-01T10:00:00.000Z', fout: '2026-07-01T15:00:00.000Z' }, // 5h
    ] }]);
    expect(await medianFirstReplyHours(db, 30)).toBe(3);
  });
  test('returns null when no replied tickets', async () => {
    expect(await medianFirstReplyHours(fakeDb([{ match: /firsts/, rows: [] }]), 30)).toBeNull();
  });
});

describe('ticketsPerDay', () => {
  test('returns day/count rows', async () => {
    const db = fakeDb([{ match: /GROUP BY day/, rows: [{ day: '2026-07-01', n: 2 }] }]);
    expect(await ticketsPerDay(db, 14)).toEqual([{ day: '2026-07-01', n: 2 }]);
  });
});

describe('needsAttention', () => {
  test('returns the open+stale rows the query yields', async () => {
    const db = fakeDb([{ match: /status = 'open'/, rows: [{ id: 't1', public_id: 'FS-AAAAA', subject: 's', customer_name: 'J', unread: 1, last_activity_at: '2026-07-01T00:00:00.000Z' }] }]);
    const r = await needsAttention(db);
    expect(r).toHaveLength(1);
    expect(r[0].public_id).toBe('FS-AAAAA');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run src/lib/helpdesk/db.dashboard.test.ts
```
Expected: FAIL — `medianFirstReplyHours`/`ticketsPerDay`/`needsAttention` are not exported.

- [ ] **Step 3: Append to `src/lib/helpdesk/db.ts`** (after the existing `recentMessages` function, before EOF):

```ts
export async function ticketsPerDay(db: D1Database, days: number) {
  const { results } = await db.prepare(
    `SELECT substr(created_at,1,10) AS day, COUNT(*) AS n FROM tickets WHERE created_at >= ? GROUP BY day ORDER BY day ASC`
  ).bind(new Date(Date.now() - days * 86400000).toISOString()).all<{ day: string; n: number }>();
  return results;
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
```

- [ ] **Step 4: Run to verify pass**

```bash
npx vitest run src/lib/helpdesk/db.dashboard.test.ts
```
Expected: PASS (3 describes).

- [ ] **Step 5: Full suite + commit**

```bash
npm test 2>&1 | grep "Tests "   # +~4 tests, 0 failures
git add src/lib/helpdesk/db.ts src/lib/helpdesk/db.dashboard.test.ts
git commit -m "feat(admin): dashboard queries (tickets/day, median first reply, needs-attention)"
```

---

## Task 3: Dashboard page + Sparkline + KpiTile

**Files:**
- Create: `src/components/admin/Sparkline.astro`
- Create: `src/components/admin/KpiTile.astro`
- Modify (rewrite): `src/pages/admin/index.astro`

- [ ] **Step 1: Create `src/components/admin/Sparkline.astro`:**

```astro
---
export interface Props { data: number[]; color?: string; height?: number; }
const { data, color = '#2f6f9f', height = 34 } = Astro.props;
const w = 100, h = height;
const max = Math.max(1, ...data);
const n = data.length;
const pts = data.map((v, i) => [n <= 1 ? 0 : (i / (n - 1)) * w, h - (v / max) * (h - 3) - 2] as const);
const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
const area = n ? `M0,${h} ${pts.map(p => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')} L${w},${h} Z` : '';
---
{n > 0 && (
  <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" class="w-full" style={`height:${h}px`} aria-hidden="true">
    <path d={area} fill={color} fill-opacity="0.12" />
    <path d={line} fill="none" stroke={color} stroke-width="1.5" vector-effect="non-scaling-stroke" />
  </svg>
)}
```

- [ ] **Step 2: Create `src/components/admin/KpiTile.astro`:**

```astro
---
import Sparkline from './Sparkline.astro';
export interface Props {
  label: string; value: string | number; spark?: number[]; color?: string;
  delta?: { current: number; prev: number; lowerIsBetter?: boolean } | null;
}
const { label, value, spark = [], color = '#2f6f9f', delta = null } = Astro.props;
let chip: { text: string; cls: string } | null = null;
if (delta) {
  const { current, prev, lowerIsBetter } = delta;
  const pct = prev === 0 ? (current === 0 ? 0 : 100) : Math.round(((current - prev) / prev) * 100);
  const up = pct > 0, flat = pct === 0;
  const good = flat ? false : lowerIsBetter ? !up : up;
  chip = {
    text: `${up ? '▲' : flat ? '■' : '▼'} ${Math.abs(pct)}%`,
    cls: flat ? 'bg-slate-100 text-slate-500' : good ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600',
  };
}
---
<div class="bg-white rounded-2xl border border-line p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition">
  <div class="flex items-center justify-between gap-2">
    <p class="text-[11px] uppercase tracking-widest opacity-55 font-semibold">{label}</p>
    {chip && <span class={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${chip.cls}`}>{chip.text}</span>}
  </div>
  <p class="text-3xl font-bold mt-1 mb-2">{value}</p>
  {spark.length > 0 && <Sparkline data={spark} color={color} />}
</div>
```

- [ ] **Step 3: Rewrite `src/pages/admin/index.astro` to exactly:**

```astro
---
export const prerender = false;

import AdminLayout from '../../components/admin/AdminLayout.astro';
import KpiTile from '../../components/admin/KpiTile.astro';
import { getHelpdeskEnv } from '../../lib/helpdesk/env';
import {
  countOpenTickets, recentMessages, viewsByDay, topPages,
  ticketsPerDay, medianFirstReplyHours, needsAttention,
} from '../../lib/helpdesk/db';

const env = await getHelpdeskEnv();
const [openCount, recent, views14, pages, tix14, medHrs, attention] = await Promise.all([
  countOpenTickets(env.DB),
  recentMessages(env.DB, 8),
  viewsByDay(env.DB, 14),
  topPages(env.DB, 14, 5),
  ticketsPerDay(env.DB, 14),
  medianFirstReplyHours(env.DB, 30),
  needsAttention(env.DB),
]);

// Build gap-filled 14-day series (ET) for the sparklines.
const fmt = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const etDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const days: string[] = Array.from({ length: 14 }, (_, i) => etDay(new Date(Date.now() - (13 - i) * 86400000)));
const seriesFrom = (rows: { day?: string }[], key: 'views' | 'n') => {
  const map = new Map(rows.map((r: any) => [r.day, r[key] as number]));
  return days.map(d => map.get(d) ?? 0);
};
const viewsSeries = seriesFrom(views14 as any, 'views');
const tixSeries = seriesFrom(tix14 as any, 'n');
const views7 = viewsSeries.slice(7).reduce((a, b) => a + b, 0);
const viewsPrev7 = viewsSeries.slice(0, 7).reduce((a, b) => a + b, 0);
const tix7 = tixSeries.slice(7).reduce((a, b) => a + b, 0);
const tixPrev7 = tixSeries.slice(0, 7).reduce((a, b) => a + b, 0);
const maxPage = Math.max(1, ...pages.map(p => p.views));

const age = (iso: string) => {
  const h = (Date.now() - Date.parse(iso)) / 3_600_000;
  return h < 1 ? `${Math.max(1, Math.round(h * 60))}m` : h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
};
---
<AdminLayout title="Dashboard">
  <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
    <KpiTile label="Visitors · 7d" value={views7} spark={viewsSeries} color="#2f6f9f" delta={{ current: views7, prev: viewsPrev7 }} />
    <KpiTile label="Open tickets" value={openCount} spark={tixSeries} color="#16a34a" />
    <KpiTile label="New tickets · 7d" value={tix7} spark={tixSeries} color="#16a34a" delta={{ current: tix7, prev: tixPrev7 }} />
    <KpiTile label="Avg first reply" value={medHrs === null ? '—' : `${medHrs}h`} />
  </div>

  <div class="grid lg:grid-cols-3 gap-4 mb-6">
    <!-- Needs attention -->
    <section class="lg:col-span-2 bg-white rounded-2xl border border-line shadow-sm">
      <div class="px-5 py-3.5 border-b border-line flex items-center justify-between">
        <h2 class="text-sm font-bold">Needs attention</h2>
        <a href="/admin/tickets/" class="text-xs font-medium text-brand-blue hover:text-brand-red">All tickets →</a>
      </div>
      <div class="divide-y divide-line">
        {attention.length === 0 && <p class="px-5 py-8 text-sm text-center opacity-50">All caught up. 🧺</p>}
        {attention.map(t => (
          <a href={`/admin/tickets/${t.id}/`} class="flex items-center gap-3 px-5 py-3 hover:bg-cream/60">
            {t.unread === 1 && <span class="w-2 h-2 rounded-full bg-brand-red shrink-0" title="Unread"></span>}
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-blue/10 text-brand-blue shrink-0">{t.public_id}</span>
            <span class="text-sm truncate flex-1 min-w-0"><span class="font-semibold">{t.customer_name}</span> · {t.subject}</span>
            <span class="text-xs opacity-50 shrink-0">{age(t.last_activity_at)}</span>
          </a>
        ))}
      </div>
    </section>

    <!-- Traffic -->
    <section class="bg-white rounded-2xl border border-line shadow-sm">
      <div class="px-5 py-3.5 border-b border-line flex items-center justify-between">
        <h2 class="text-sm font-bold">Traffic · 14d</h2>
        <a href="/admin/analytics/" class="text-xs font-medium text-brand-blue hover:text-brand-red">Analytics →</a>
      </div>
      <div class="p-5 space-y-3">
        {pages.length === 0 && <p class="text-sm opacity-50">No data yet.</p>}
        {pages.map(p => (
          <div>
            <div class="flex justify-between text-xs mb-0.5"><span class="truncate">{p.path}</span><span class="opacity-55 ml-2 shrink-0">{p.views}</span></div>
            <div class="h-1.5 bg-line rounded-full overflow-hidden"><div class="h-full bg-brand-blue rounded-full" style={`width:${Math.round((p.views / maxPage) * 100)}%`}></div></div>
          </div>
        ))}
      </div>
    </section>
  </div>

  <!-- Recent activity -->
  <section class="bg-white rounded-2xl border border-line shadow-sm">
    <div class="px-5 py-3.5 border-b border-line"><h2 class="text-sm font-bold">Recent activity</h2></div>
    <div class="divide-y divide-line">
      {recent.length === 0 && <p class="px-5 py-8 text-sm text-center opacity-50">No messages yet.</p>}
      {recent.map(m => (
        <a href={`/admin/tickets/${m.ticket_id}/`} class="block px-5 py-3 hover:bg-cream/60">
          <div class="flex justify-between gap-3 text-xs opacity-55 mb-0.5">
            <span>{m.public_id} · {m.customer_name} · {m.direction === 'inbound' ? 'customer' : 'you'}</span>
            <span>{fmt(m.created_at)}</span>
          </div>
          <p class="text-sm truncate">{m.body}</p>
        </a>
      ))}
    </div>
  </section>
</AdminLayout>
```

- [ ] **Step 2b: Build + smoke.**

```bash
npm run build 2>&1 | tail -2
curl -s http://localhost:4321/admin/ | grep -c 'Needs attention'   # 1
curl -s http://localhost:4321/admin/ | grep -c 'Avg first reply'   # 1
curl -s http://localhost:4321/admin/ | grep -c 'Recent activity'   # 1
```

- [ ] **Step 3: Interactive smoke (dev server 4321).** Navigate `http://localhost:4321/admin/`, screenshot, confirm: 4 KPI tiles render with sparklines, "Needs attention" panel present (populated or empty-state), traffic bars, recent activity. `preview_console_logs level error` clean.

- [ ] **Step 4: Suite + commit**

```bash
npm test 2>&1 | grep "Tests "
git add src/components/admin/Sparkline.astro src/components/admin/KpiTile.astro src/pages/admin/index.astro
git commit -m "feat(admin): dense dashboard with KPI tiles, needs-attention, traffic"
```

---

## Task 4: Analytics data + ET hour bucketing (TDD)

**Files:**
- Modify: `src/lib/helpdesk/pv.ts` (add pure ET helper)
- Test: `src/lib/helpdesk/pv.test.ts` (extend)
- Modify: `src/lib/helpdesk/db.ts` (insertPageview + new queries)
- Modify: `src/pages/api/pv.ts` (pass hour)
- Modify: `db/schema.sql` (hour column)

- [ ] **Step 1: Write the failing test** — append to `src/lib/helpdesk/pv.test.ts`:

```ts
import { etDayHour } from './pv';

describe('etDayHour', () => {
  test('converts a UTC instant to America/New_York day + hour', () => {
    // 2026-07-01T02:30:00Z is 2026-06-30 22:30 EDT → day 2026-06-30, hour 22
    const r = etDayHour(new Date('2026-07-01T02:30:00.000Z'));
    expect(r.day).toBe('2026-06-30');
    expect(r.hour).toBe(22);
  });
  test('midday UTC stays same calendar day in ET', () => {
    const r = etDayHour(new Date('2026-07-01T16:00:00.000Z')); // 12:00 EDT
    expect(r.day).toBe('2026-07-01');
    expect(r.hour).toBe(12);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run src/lib/helpdesk/pv.test.ts
```
Expected: FAIL — `etDayHour` not exported.

- [ ] **Step 3: Append to `src/lib/helpdesk/pv.ts`:**

```ts
/** Calendar day (YYYY-MM-DD) and 0–23 hour of an instant, in America/New_York. */
export function etDayHour(d: Date): { day: string; hour: number } {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: '2-digit', hour12: false,
  }).format(d)) % 24; // '24' → 0 guard
  return { day, hour };
}
```

- [ ] **Step 4: Run to verify pass**

```bash
npx vitest run src/lib/helpdesk/pv.test.ts
```
Expected: PASS.

- [ ] **Step 5: Update `insertPageview` in `src/lib/helpdesk/db.ts`** — replace the existing `insertPageview` and `sinceDay` block with:

```ts
import { etDayHour } from './pv';
// (add the import at the top of db.ts alongside the existing imports)

export const insertPageview = (db: D1Database, pv: { path: string; referrerHost: string; country: string; device: string }) => {
  const d = new Date();
  const { day, hour } = etDayHour(d);
  return db.prepare(
    `INSERT INTO pageviews (ts, day, hour, path, referrer_host, country, device) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(d.toISOString(), day, hour, pv.path, pv.referrerHost, pv.country, pv.device).run();
};

const sinceDay = (days: number) => {
  const d = new Date(Date.now() - days * 86400000);
  return etDayHour(d).day;
};
```

(Keep the existing `viewsByDay`, `topPages`, `topCountries`, `deviceSplit` — they already use `sinceDay`.)

- [ ] **Step 6: Append new analytics queries to `src/lib/helpdesk/db.ts`:**

```ts
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
```

- [ ] **Step 7: Update `src/pages/api/pv.ts`** — no code change needed (it calls `insertPageview`, which now derives the hour internally). Verify by re-reading; leave as-is.

- [ ] **Step 8: Update `db/schema.sql`** — replace the `pageviews` CREATE block with (adds `hour`):

```sql
CREATE TABLE IF NOT EXISTS pageviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  day TEXT NOT NULL,
  hour INTEGER,
  path TEXT NOT NULL,
  referrer_host TEXT,
  country TEXT,
  device TEXT
);
CREATE INDEX IF NOT EXISTS idx_pageviews_day ON pageviews(day);
```

Add a migration note comment at the top of `db/schema.sql` (after the existing header comment):

```sql
-- MIGRATION 2026-07 (analytics hour): existing databases need:
--   ALTER TABLE pageviews ADD COLUMN hour INTEGER;
```

- [ ] **Step 9: Apply the ALTER to LOCAL D1 so dev works:**

```bash
npx wrangler d1 execute foundsock-helpdesk --local --command "ALTER TABLE pageviews ADD COLUMN hour INTEGER;" 2>&1 | tail -2
```
(If it errors "duplicate column name", it's already applied — fine.)

- [ ] **Step 10: Full suite + commit**

```bash
npm test 2>&1 | grep "Tests "   # +2 tests
git add src/lib/helpdesk/pv.ts src/lib/helpdesk/pv.test.ts src/lib/helpdesk/db.ts db/schema.sql
git commit -m "feat(analytics): ET day/hour bucketing + referrers/hours/range queries"
```

---

## Task 5: Analytics page rewrite

**Files:**
- Modify (rewrite): `src/pages/admin/analytics.astro`

- [ ] **Step 1: Rewrite `src/pages/admin/analytics.astro` to exactly:**

```astro
---
export const prerender = false;

import AdminLayout from '../../components/admin/AdminLayout.astro';
import { getHelpdeskEnv } from '../../lib/helpdesk/env';
import { viewsByDay, topPages, topCountries, deviceSplit, referrers, hoursOfDay, viewsInRange } from '../../lib/helpdesk/db';

const periodParam = Astro.url.searchParams.get('period');
const period = periodParam === '7' || periodParam === '90' ? Number(periodParam) : 30;

const env = await getHelpdeskEnv();
const [views, pages, countries, devices, refs, hours] = await Promise.all([
  viewsByDay(env.DB, period), topPages(env.DB, period), topCountries(env.DB, period),
  deviceSplit(env.DB, period), referrers(env.DB, period), hoursOfDay(env.DB, period),
]);

const etDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const dayAgo = (n: number) => etDay(new Date(Date.now() - n * 86400000));
const today = dayAgo(0);
const curStart = dayAgo(period - 1);
const prevStart = dayAgo(2 * period - 1);
const prevEnd = dayAgo(period);
const total = views.reduce((s, v) => s + v.views, 0);
const prevTotal = await viewsInRange(env.DB, prevStart, prevEnd);
const dailyAvg = Math.round(total / period);
const deltaPct = prevTotal === 0 ? (total === 0 ? 0 : 100) : Math.round(((total - prevTotal) / prevTotal) * 100);
const busiest = views.reduce((m, v) => (v.views > (m?.views ?? -1) ? v : m), null as null | { day: string; views: number });

// Gap-filled daily series for the big chart
const nDays = period;
const days: string[] = Array.from({ length: nDays }, (_, i) => dayAgo(nDays - 1 - i));
const vmap = new Map(views.map(v => [v.day, v.views]));
const series = days.map(d => vmap.get(d) ?? 0);
const maxDay = Math.max(1, ...series);
const W = 720, H = 180;
const pts = series.map((v, i) => [nDays <= 1 ? 0 : (i / (nDays - 1)) * W, H - (v / maxDay) * (H - 10) - 5] as const);
const linePath = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
const areaPath = `M0,${H} ${pts.map(p => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')} L${W},${H} Z`;

const maxPage = Math.max(1, ...pages.map(p => p.views));
const devTotal = Math.max(1, devices.reduce((s, d) => s + d.views, 0));
const hourArr = Array.from({ length: 24 }, (_, h) => hours.find(x => x.hour === h)?.views ?? 0);
const maxHour = Math.max(1, ...hourArr);
const periods = [7, 30, 90];
const label12 = (h: number) => (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`);
---
<AdminLayout title="Analytics">
  <div class="flex items-center justify-between flex-wrap gap-3 mb-5">
    <h1 class="text-2xl font-bold tracking-tight">Analytics</h1>
    <div class="flex gap-1 bg-white border border-line rounded-full p-1 text-sm font-semibold">
      {periods.map(p => (
        <a href={`/admin/analytics/?period=${p}`}
           class:list={['px-3.5 py-1 rounded-full', period === p ? 'bg-brand-blue text-white' : 'text-brand-blue-darker/60 hover:text-brand-blue-darker']}>
          {p}d
        </a>
      ))}
    </div>
  </div>

  <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
    <div class="bg-white rounded-2xl border border-line p-4 shadow-sm">
      <p class="text-[11px] uppercase tracking-widest opacity-55 font-semibold">Total views</p>
      <p class="text-3xl font-bold mt-1">{total}</p>
      <span class:list={['text-[11px] font-bold px-1.5 py-0.5 rounded-full', deltaPct > 0 ? 'bg-emerald-50 text-emerald-700' : deltaPct < 0 ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500']}>
        {deltaPct > 0 ? '▲' : deltaPct < 0 ? '▼' : '■'} {Math.abs(deltaPct)}% vs prev
      </span>
    </div>
    <div class="bg-white rounded-2xl border border-line p-4 shadow-sm">
      <p class="text-[11px] uppercase tracking-widest opacity-55 font-semibold">Daily avg</p>
      <p class="text-3xl font-bold mt-1">{dailyAvg}</p>
    </div>
    <div class="bg-white rounded-2xl border border-line p-4 shadow-sm">
      <p class="text-[11px] uppercase tracking-widest opacity-55 font-semibold">Busiest day</p>
      <p class="text-lg font-bold mt-2">{busiest ? busiest.day.slice(5) : '—'}</p>
      <p class="text-xs opacity-55">{busiest ? `${busiest.views} views` : ''}</p>
    </div>
    <div class="bg-white rounded-2xl border border-line p-4 shadow-sm">
      <p class="text-[11px] uppercase tracking-widest opacity-55 font-semibold">Period</p>
      <p class="text-3xl font-bold mt-1">{period}d</p>
      <p class="text-xs opacity-55">cookie-free</p>
    </div>
  </div>

  <section class="bg-white rounded-2xl border border-line shadow-sm p-5 mb-6">
    <h2 class="text-sm font-bold mb-3">Views per day</h2>
    {total === 0 ? <p class="text-sm opacity-50">No data yet.</p> : (
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" class="w-full" style={`height:${H}px`} aria-hidden="true">
        <path d={areaPath} fill="#2f6f9f" fill-opacity="0.1" />
        <path d={linePath} fill="none" stroke="#2f6f9f" stroke-width="2" vector-effect="non-scaling-stroke" />
      </svg>
    )}
    <div class="flex justify-between text-[10px] opacity-45 mt-1"><span>{days[0]?.slice(5)}</span><span>{today.slice(5)}</span></div>
  </section>

  <div class="grid md:grid-cols-2 gap-4 mb-6">
    <section class="bg-white rounded-2xl border border-line shadow-sm p-5">
      <h2 class="text-sm font-bold mb-3">Top pages</h2>
      {pages.length === 0 && <p class="text-sm opacity-50">No data yet.</p>}
      <div class="space-y-2.5">
        {pages.map(p => (
          <div>
            <div class="flex justify-between text-sm mb-0.5"><span class="truncate">{p.path}</span><span class="opacity-55 ml-2 shrink-0">{p.views}</span></div>
            <div class="h-1.5 bg-line rounded-full overflow-hidden"><div class="h-full bg-brand-blue rounded-full" style={`width:${Math.round((p.views / maxPage) * 100)}%`}></div></div>
          </div>
        ))}
      </div>
    </section>
    <section class="bg-white rounded-2xl border border-line shadow-sm p-5">
      <h2 class="text-sm font-bold mb-3">Referrers</h2>
      {refs.length === 0 && <p class="text-sm opacity-50">No data yet.</p>}
      <div class="space-y-1.5 text-sm">
        {refs.map(r => <div class="flex justify-between"><span class="truncate">{r.host}</span><span class="opacity-55 ml-2 shrink-0">{r.views}</span></div>)}
      </div>
    </section>
  </div>

  <div class="grid md:grid-cols-2 gap-4 mb-6">
    <section class="bg-white rounded-2xl border border-line shadow-sm p-5">
      <h2 class="text-sm font-bold mb-3">Countries</h2>
      {countries.length === 0 && <p class="text-sm opacity-50">No data yet.</p>}
      <div class="space-y-1.5 text-sm">
        {countries.map(c => <div class="flex justify-between"><span>{c.country || '—'}</span><span class="opacity-55">{c.views}</span></div>)}
      </div>
    </section>
    <section class="bg-white rounded-2xl border border-line shadow-sm p-5">
      <h2 class="text-sm font-bold mb-3">Devices</h2>
      {devices.length === 0 && <p class="text-sm opacity-50">No data yet.</p>}
      <div class="space-y-1.5 text-sm">
        {devices.map(d => <div class="flex justify-between"><span class="capitalize">{d.device}</span><span class="opacity-55">{d.views} ({Math.round((d.views / devTotal) * 100)}%)</span></div>)}
      </div>
    </section>
  </div>

  <section class="bg-white rounded-2xl border border-line shadow-sm p-5">
    <h2 class="text-sm font-bold mb-3">Busiest hours <span class="font-normal opacity-45">(Eastern)</span></h2>
    <div class="flex items-end gap-[3px] h-24">
      {hourArr.map((v, h) => (
        <div class="flex-1 bg-brand-blue/70 hover:bg-brand-red rounded-t" style={`height:${Math.max(2, Math.round((v / maxHour) * 100))}%`} title={`${label12(h)}: ${v}`}></div>
      ))}
    </div>
    <div class="flex justify-between text-[10px] opacity-45 mt-1"><span>12a</span><span>6a</span><span>12p</span><span>6p</span><span>11p</span></div>
  </section>
</AdminLayout>
```

- [ ] **Step 2: Build + smoke each period.**

```bash
npm run build 2>&1 | tail -2
for p in 7 30 90; do curl -s -o /dev/null -w "period=$p %{http_code}\n" "http://localhost:4321/admin/analytics/?period=$p"; done  # all 200
curl -s "http://localhost:4321/admin/analytics/" | grep -c 'Busiest hours'   # 1
curl -s "http://localhost:4321/admin/analytics/" | grep -c 'Referrers'       # 1
```

- [ ] **Step 3: Interactive smoke.** Navigate `http://localhost:4321/admin/analytics/`, screenshot, click the 7d/30d/90d pills, confirm the chart + stats change and console is clean.

- [ ] **Step 4: Suite + commit**

```bash
npm test 2>&1 | grep "Tests "
git add src/pages/admin/analytics.astro
git commit -m "feat(analytics): period selector, area chart, referrers, busiest hours"
```

---

## Task 6: HTML email templates + wire callers (TDD)

**Files:**
- Modify (rewrite): `src/lib/helpdesk/templates.ts`
- Test (rewrite): `src/lib/helpdesk/templates.test.ts`
- Modify: `src/lib/helpdesk/intake.ts`, `src/lib/helpdesk/inbound.ts`, `src/pages/api/admin/reply.ts`

The three template functions gain an `html` field and a richer `notificationEmail` signature. `sendEmail` already forwards `html`. Callers must pass it.

- [ ] **Step 1: Rewrite `src/lib/helpdesk/templates.test.ts` to exactly:**

```ts
import { test, expect, describe } from 'vitest';
import { confirmationEmail, notificationEmail, replyEmail } from './templates';

describe('confirmationEmail', () => {
  test('form variant: subject, greeting, ref; no personal identity; has html', () => {
    const e = confirmationEmail({ publicId: 'FS-7K2QX', source: 'issue-form', customerName: 'Jane' });
    expect(e.subject).toBe('We got your report [FS-7K2QX]');
    expect(e.text).toContain('Jane');
    expect(e.text).toContain('FS-7K2QX');
    expect(e.html).toContain('FS-7K2QX');
    expect(e.html).toContain('<');           // it is HTML
    expect(e.text.toLowerCase()).not.toContain('eliran');
    expect(e.html.toLowerCase()).not.toContain('eliran');
    expect(e.html.toLowerCase()).not.toContain('gmail');
  });
  test('email/contact variant says message', () => {
    expect(confirmationEmail({ publicId: 'FS-AAAAA', source: 'email', customerName: 'Bob' }).subject)
      .toBe('We got your message [FS-AAAAA]');
  });
  test('escapes html in customer name', () => {
    const e = confirmationEmail({ publicId: 'FS-1', source: 'email', customerName: '<script>x' });
    expect(e.html).not.toContain('<script>x');
    expect(e.html).toContain('&lt;script&gt;x');
  });
});

describe('notificationEmail', () => {
  test('has admin link, details, and html; optional aiDraft renders', () => {
    const e = notificationEmail({
      publicId: 'FS-7K2QX', ticketId: 'abcabcabcabc', kind: 'ticket',
      subject: 'Issue: Washer #7', customerName: 'Jane', customerEmail: 'j@x.com',
      snippet: 'It ate my money', machine: 'Washer #7', source: 'issue-form',
      aiDraft: 'Sorry about that — refund sent.',
    });
    expect(e.subject).toContain('FS-7K2QX');
    expect(e.subject).toContain('Washer #7');
    expect(e.html).toContain('https://www.foundsocklaundromat.com/admin/tickets/abcabcabcabc/');
    expect(e.html).toContain('Jane');
    expect(e.html).toContain('It ate my money');
    expect(e.html).toContain('Sorry about that');   // AI draft embedded
    expect(e.text).toContain('It ate my money');
  });
  test('omits AI block when no draft', () => {
    const e = notificationEmail({ publicId: 'FS-1', ticketId: 't', kind: 'message', subject: 's', customerName: 'J', customerEmail: 'j@x.com', snippet: 'hi' });
    expect(e.html).not.toContain('Suggested reply');
  });
});

describe('replyEmail', () => {
  test('threads subject; body in text + html; footer ref', () => {
    const e = replyEmail({ subject: 'Issue: Washer #7', publicId: 'FS-7K2QX', body: 'Refund sent to your card.' });
    expect(e.subject).toBe('Re: Issue: Washer #7 [FS-7K2QX]');
    expect(e.text).toContain('Refund sent to your card.');
    expect(e.html).toContain('Refund sent to your card.');
    expect(e.text).toContain('Ref: [FS-7K2QX]');
  });
  test('does not double Re: or [id]', () => {
    expect(replyEmail({ subject: 'Re: Issue [FS-7K2QX]', publicId: 'FS-7K2QX', body: 'x' }).subject)
      .toBe('Re: Issue [FS-7K2QX]');
  });
  test('escapes html in body', () => {
    const e = replyEmail({ subject: 's', publicId: 'FS-1', body: '<b>hi</b>' });
    expect(e.html).not.toContain('<b>hi</b>');
    expect(e.html).toContain('&lt;b&gt;hi&lt;/b&gt;');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run src/lib/helpdesk/templates.test.ts
```
Expected: FAIL (confirmationEmail has no `html`; notificationEmail signature differs).

- [ ] **Step 3: Rewrite `src/lib/helpdesk/templates.ts` to exactly:**

```ts
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
```

- [ ] **Step 4: Run to verify pass**

```bash
npx vitest run src/lib/helpdesk/templates.test.ts
```
Expected: PASS.

- [ ] **Step 5: Update callers.**

`src/lib/helpdesk/intake.ts` — replace the confirmation + notification send block (the `if (input.sendConfirmation !== false) { … }` through the `notified` send) with:

```ts
  if (input.sendConfirmation !== false) {
    const conf = confirmationEmail({ publicId, source: input.source, customerName: input.customerName });
    const sent = await sendEmail(env, { to: input.customerEmail, subject: conf.subject, text: conf.text, html: conf.html, replyToken });
    if (!sent.ok) console.error('[helpdesk] confirmation send failed:', sent.error);
  }
  const note = notificationEmail({
    publicId, ticketId: id, kind: 'ticket', subject: input.subject,
    customerName: input.customerName, customerEmail: input.customerEmail, snippet: input.body,
    machine: input.fields?.machineType ? `${input.fields.machineType}${input.fields.machineNumber ? ' #' + input.fields.machineNumber : ''}` : null,
    source: input.source,
  });
  const notified = await sendEmail(env, { to: env.NOTIFY_EMAIL, subject: note.subject, text: note.text, html: note.html });
  if (!notified.ok) console.error('[helpdesk] owner notification failed:', notified.error);
```

`src/lib/helpdesk/inbound.ts` — replace the `notificationEmail({ … })` + send block near the end with:

```ts
  const note = notificationEmail({
    publicId: ticket.public_id, ticketId: ticket.id, kind: 'message',
    subject: ticket.subject, customerName: ticket.customer_name, customerEmail: ticket.customer_email,
    snippet: body || '[image attachment]',
    machine: ticket.machine_type ? `${ticket.machine_type}${ticket.machine_number ? ' #' + ticket.machine_number : ''}` : null,
    source: ticket.source,
  });
  const sent = await sendEmail(env, { to: env.NOTIFY_EMAIL, subject: note.subject, text: note.text, html: note.html });
  if (!sent.ok) console.error('[helpdesk] inbound notification failed:', sent.error);
```

`src/pages/api/admin/reply.ts` — no change (it already passes `html: tpl.html`). Verify by re-reading.

- [ ] **Step 6: Full suite + build**

```bash
npm test 2>&1 | grep "Tests "     # 0 failures
npm run build 2>&1 | tail -2      # Complete!
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/helpdesk/templates.ts src/lib/helpdesk/templates.test.ts src/lib/helpdesk/intake.ts src/lib/helpdesk/inbound.ts
git commit -m "feat(email): branded HTML templates + richer owner notification"
```

> **DEPLOY CHECKPOINT (Part A):** After Task 6 review passes, Part A is shippable. The controller applies the analytics `hour` migration to prod D1 (Cloudflare console → D1 → foundsock-helpdesk → Console → `ALTER TABLE pageviews ADD COLUMN hour INTEGER;`), then merges `feat/admin-v2`→`main` and pushes. Verify live: `/admin/` renders new shell, an email test still sends. Then continue Part B.

---

## Task 7: AI schema + settings/drafts queries (TDD)

**Files:**
- Modify: `db/schema.sql` (add `ai_drafts`, `settings`)
- Modify: `src/lib/helpdesk/db.ts` (queries)
- Test: `src/lib/helpdesk/db.ai.test.ts` (create)

- [ ] **Step 1: Append to `db/schema.sql`:**

```sql
CREATE TABLE IF NOT EXISTS ai_drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  trigger_message_id INTEGER,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'suggested',
  model TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_drafts_ticket ON ai_drafts(ticket_id, created_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

- [ ] **Step 2: Apply to LOCAL D1:**

```bash
npx wrangler d1 execute foundsock-helpdesk --local --command "CREATE TABLE IF NOT EXISTS ai_drafts (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id TEXT NOT NULL REFERENCES tickets(id), trigger_message_id INTEGER, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'suggested', model TEXT NOT NULL, created_at TEXT NOT NULL); CREATE INDEX IF NOT EXISTS idx_ai_drafts_ticket ON ai_drafts(ticket_id, created_at DESC); CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);" 2>&1 | tail -2
```

- [ ] **Step 3: Write the failing test** — create `src/lib/helpdesk/db.ai.test.ts`:

```ts
import { test, expect, describe } from 'vitest';
import { getSetting, recentOutboundPairs } from './db';

function fakeDb(handlers: { match: RegExp; rows?: any[]; first?: any }[]) {
  return {
    prepare(sql: string) {
      const h = handlers.find(x => x.match.test(sql));
      return { bind() { return this; }, async all() { return { results: h?.rows ?? [] }; }, async first() { return h?.first ?? null; } };
    },
  } as any;
}

describe('getSetting', () => {
  test('returns stored value', async () => {
    const db = fakeDb([{ match: /FROM settings/, first: { value: 'hello rules' } }]);
    expect(await getSetting(db, 'house_rules')).toBe('hello rules');
  });
  test('returns null when absent', async () => {
    expect(await getSetting(fakeDb([{ match: /FROM settings/, first: null }]), 'x')).toBeNull();
  });
});

describe('recentOutboundPairs', () => {
  test('maps rows to {inbound, outbound}', async () => {
    const db = fakeDb([{ match: /direction='outbound'/, rows: [
      { inbound: 'is it open?', outbound: 'Yes, 6am to 11pm daily.' },
    ] }]);
    const pairs = await recentOutboundPairs(db, 50);
    expect(pairs).toEqual([{ inbound: 'is it open?', outbound: 'Yes, 6am to 11pm daily.' }]);
  });
});
```

- [ ] **Step 4: Run to verify failure**

```bash
npx vitest run src/lib/helpdesk/db.ai.test.ts
```
Expected: FAIL — functions not exported.

- [ ] **Step 5: Append to `src/lib/helpdesk/db.ts`:**

```ts
// ---- AI drafts + settings ----
export async function getSetting(db: D1Database, key: string): Promise<string | null> {
  const r = await db.prepare(`SELECT value FROM settings WHERE key = ?`).bind(key).first<{ value: string }>();
  return r?.value ?? null;
}
export const setSetting = (db: D1Database, key: string, value: string) =>
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(key, value).run();

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
```

- [ ] **Step 6: Run to verify pass + full suite + commit**

```bash
npx vitest run src/lib/helpdesk/db.ai.test.ts
npm test 2>&1 | grep "Tests "
git add db/schema.sql src/lib/helpdesk/db.ts src/lib/helpdesk/db.ai.test.ts
git commit -m "feat(ai): ai_drafts + settings tables and queries"
```

---

## Task 8: AI context assembly (TDD, pure)

**Files:**
- Create: `src/lib/helpdesk/ai-context.ts`
- Test: `src/lib/helpdesk/ai-context.test.ts`

- [ ] **Step 1: Write the failing test** — create `src/lib/helpdesk/ai-context.test.ts`:

```ts
import { test, expect, describe } from 'vitest';
import { tokenize, selectExamples, buildPrompt } from './ai-context';

describe('tokenize', () => {
  test('lowercases, drops stopwords and short tokens', () => {
    expect(tokenize('Is the Washer working today?')).toEqual(['washer', 'working', 'today']);
  });
});

describe('selectExamples', () => {
  const pairs = [
    { inbound: 'what are your hours', outbound: 'We are open 6am to 11pm daily.' },
    { inbound: 'the washer ate my quarters', outbound: 'Sorry! Refund on the way.' },
    { inbound: 'do you sell detergent', outbound: 'Yes, vending by the door.' },
  ];
  test('ranks by keyword overlap with the trigger', () => {
    const r = selectExamples(pairs, 'my washer took my money', 2);
    expect(r[0].inbound).toBe('the washer ate my quarters');
    expect(r.length).toBeLessThanOrEqual(2);
  });
  test('returns empty when nothing overlaps', () => {
    expect(selectExamples(pairs, 'zzzzz qqqqq', 3)).toEqual([]);
  });
});

describe('buildPrompt', () => {
  test('includes house rules, examples, and the SKIP instruction', () => {
    const { system, user } = buildPrompt({
      houseRules: 'Refunds within 7 days.',
      examples: [{ inbound: 'hours?', outbound: 'Open 6-11.' }],
      ticketSubject: 'Washer', threadText: 'It broke.',
    });
    expect(system).toContain('SKIP');
    expect(system).toContain('The Found Sock Laundromat');
    expect(user).toContain('Refunds within 7 days.');
    expect(user).toContain('Open 6-11.');
    expect(user).toContain('It broke.');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run src/lib/helpdesk/ai-context.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/helpdesk/ai-context.ts`:**

```ts
const STOP = new Set(['the','a','an','is','are','was','were','be','to','of','and','or','in','on','at','it','my','your','you','i','we','do','does','did','for','with','this','that','have','has','had','not','no','can','will','would','me','our','us','if','so','but','as','from','they','them','he','she','get','got','out','up','am','pm']);

export function tokenize(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(t => t.length >= 3 && !STOP.has(t));
}

export function selectExamples(
  pairs: { inbound: string; outbound: string }[],
  triggerText: string,
  k: number,
): { inbound: string; outbound: string }[] {
  const trig = new Set(tokenize(triggerText));
  if (trig.size === 0) return [];
  const scored = pairs.map((p, i) => {
    const toks = new Set(tokenize(p.inbound));
    let score = 0;
    for (const t of toks) if (trig.has(t)) score++;
    return { p, score, i };
  });
  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => (b.score - a.score) || (a.i - b.i)) // ties → earlier (pairs are newest-first)
    .slice(0, k)
    .map(s => s.p);
}

const SYSTEM = [
  'You draft email replies for the owner of The Found Sock Laundromat, a self-service laundromat at 76 Washington St, Brighton MA (open daily 6 AM–11 PM).',
  'Match the owner\'s tone and phrasing from the EXAMPLES. Be brief, warm, and concrete.',
  'Never invent policies, prices, refunds, or promises that are not supported by the HOUSE RULES or the EXAMPLES.',
  'If the customer\'s message is not clearly covered by the examples or house rules, reply with exactly the single word SKIP and nothing else.',
  'Do not add a subject line or an email signature — those are added automatically. Write only the reply body.',
].join(' ');

export function buildPrompt(input: {
  houseRules: string;
  examples: { inbound: string; outbound: string }[];
  ticketSubject: string;
  threadText: string;
}): { system: string; user: string } {
  const ex = input.examples.length
    ? input.examples.map((e, i) => `Example ${i + 1}:\nCustomer: ${e.inbound}\nOwner: ${e.outbound}`).join('\n\n')
    : '(no close examples on file)';
  const user = [
    `HOUSE RULES:\n${input.houseRules || '(none set)'}`,
    ``,
    `EXAMPLES (past replies by the owner):\n${ex}`,
    ``,
    `NEW TICKET — subject: ${input.ticketSubject}`,
    `Latest customer message(s):\n${input.threadText}`,
    ``,
    `Write the owner's reply now (or SKIP):`,
  ].join('\n');
  return { system: SYSTEM, user };
}
```

- [ ] **Step 4: Run to verify pass + commit**

```bash
npx vitest run src/lib/helpdesk/ai-context.test.ts
npm test 2>&1 | grep "Tests "
git add src/lib/helpdesk/ai-context.ts src/lib/helpdesk/ai-context.test.ts
git commit -m "feat(ai): keyword retrieval + prompt assembly (pure, tested)"
```

---

## Task 9: Anthropic client + orchestration (TDD mocked)

**Files:**
- Modify: `src/lib/helpdesk/env.ts` (add optional key)
- Create: `src/lib/helpdesk/ai.ts`
- Test: `src/lib/helpdesk/ai.test.ts`

- [ ] **Step 1: Add to `HelpdeskEnv` in `src/lib/helpdesk/env.ts`** — add this line inside the interface (after `CF_ACCESS_AUD`):

```ts
  ANTHROPIC_API_KEY?: string;
```

- [ ] **Step 2: Write the failing test** — create `src/lib/helpdesk/ai.test.ts`:

```ts
import { test, expect, describe, vi, afterEach } from 'vitest';
import { draftReply } from './ai';

afterEach(() => vi.restoreAllMocks());

const KEY = { ANTHROPIC_API_KEY: 'sk-test' } as any;

describe('draftReply', () => {
  test('returns the model text on success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: 'Sorry about that!' }] }), { status: 200 })));
    expect(await draftReply(KEY, { system: 's', user: 'u' })).toBe('Sorry about that!');
  });
  test('returns null when the model says SKIP', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: 'SKIP' }] }), { status: 200 })));
    expect(await draftReply(KEY, { system: 's', user: 'u' })).toBeNull();
  });
  test('returns null on API error (never throws)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    expect(await draftReply(KEY, { system: 's', user: 'u' })).toBeNull();
  });
  test('returns null when no key configured', async () => {
    expect(await draftReply({} as any, { system: 's', user: 'u' })).toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify failure**

```bash
npx vitest run src/lib/helpdesk/ai.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 4: Create `src/lib/helpdesk/ai.ts`:**

```ts
import type { HelpdeskEnv } from './env';
import { getSetting, recentOutboundPairs, getMessages, getTicket, supersedeDrafts, insertDraft } from './db';
import { selectExamples, buildPrompt } from './ai-context';

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

    const threadText = messages.filter(m => m.direction !== 'note').slice(-6)
      .map(m => `${m.direction === 'inbound' ? 'Customer' : 'Owner'}: ${m.body}`).join('\n');
    const houseRules = (await getSetting(env.DB, 'house_rules')) ?? '';
    const pairs = await recentOutboundPairs(env.DB, 100);
    const examples = selectExamples(pairs, trigger, 12);

    const { system, user } = buildPrompt({ houseRules, examples, ticketSubject: ticket.subject, threadText });
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
```

- [ ] **Step 5: Run to verify pass + full suite + commit**

```bash
npx vitest run src/lib/helpdesk/ai.test.ts
npm test 2>&1 | grep "Tests "
git add src/lib/helpdesk/env.ts src/lib/helpdesk/ai.ts src/lib/helpdesk/ai.test.ts
git commit -m "feat(ai): Anthropic client + failure-tolerant draft orchestration"
```

---

## Task 10: Generate drafts on intake + inbound; embed in owner email

**Files:**
- Modify: `src/lib/helpdesk/intake.ts`
- Modify: `src/lib/helpdesk/inbound.ts`

Draft generation runs AFTER ticket/message persistence and BEFORE the owner notification (so the draft can ride along in the email). It must never block or fail intake.

- [ ] **Step 1: Update `src/lib/helpdesk/intake.ts`** — add the import at the top:

```ts
import { generateDraftForTicket } from './ai';
```

Then, in `intakeTicket`, generate the draft after `addMessage(...)` and before building `note`, and pass it into `notificationEmail`. Replace the notification block (from `const note = notificationEmail(...)` through its `if (!notified.ok) …`) with:

```ts
  const aiDraft = await generateDraftForTicket(env, id, null);

  const note = notificationEmail({
    publicId, ticketId: id, kind: 'ticket', subject: input.subject,
    customerName: input.customerName, customerEmail: input.customerEmail, snippet: input.body,
    machine: input.fields?.machineType ? `${input.fields.machineType}${input.fields.machineNumber ? ' #' + input.fields.machineNumber : ''}` : null,
    source: input.source,
    aiDraft,
  });
  const notified = await sendEmail(env, { to: env.NOTIFY_EMAIL, subject: note.subject, text: note.text, html: note.html });
  if (!notified.ok) console.error('[helpdesk] owner notification failed:', notified.error);
```

- [ ] **Step 2: Update `src/lib/helpdesk/inbound.ts`** — add the import at the top:

```ts
import { generateDraftForTicket } from './ai';
```

In `handleInboundEmail`, the existing-ticket branch does `addMessage(...)`, `setStatus`, `touchActivity`, then builds `note`. To get the trigger message id, change the `addMessage` for the inbound reply to capture nothing new (addMessage returns void), and instead pass `null` as the trigger id (the orchestrator re-reads the latest inbound itself). Replace the notification block (from `const note = notificationEmail({` through its `if (!sent.ok) …`) with:

```ts
  const aiDraft = await generateDraftForTicket(env, ticket.id, null);

  const note = notificationEmail({
    publicId: ticket.public_id, ticketId: ticket.id, kind: 'message',
    subject: ticket.subject, customerName: ticket.customer_name, customerEmail: ticket.customer_email,
    snippet: body || '[image attachment]',
    machine: ticket.machine_type ? `${ticket.machine_type}${ticket.machine_number ? ' #' + ticket.machine_number : ''}` : null,
    source: ticket.source,
    aiDraft,
  });
  const sent = await sendEmail(env, { to: env.NOTIFY_EMAIL, subject: note.subject, text: note.text, html: note.html });
  if (!sent.ok) console.error('[helpdesk] inbound notification failed:', sent.error);
```

(The new-ticket-from-email branch calls `intakeTicket`, which already generates the draft via Step 1 — no change needed there.)

- [ ] **Step 3: Build + suite** (no AI key locally → `generateDraftForTicket` returns null; behavior unchanged, nothing breaks).

```bash
npm run build 2>&1 | tail -2
npm test 2>&1 | grep "Tests "
```

- [ ] **Step 4: Local E2E — a ticket still creates with no key present.**

```bash
curl -s -X POST http://localhost:4321/api/submit-ticket/ -H 'Content-Type: application/json' \
  -d '{"name":"AI Wire","email":"aiwire@example.com","message":"is the dryer working","type":"general"}'
# expect {"ok":true,"ticketId":"FS-..."}
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/helpdesk/intake.ts src/lib/helpdesk/inbound.ts
git commit -m "feat(ai): generate drafts on intake/inbound and embed in owner email"
```

---

## Task 11: Thread AI panel + draft API routes

**Files:**
- Create: `src/pages/api/admin/ai-draft.ts`
- Create: `src/pages/api/admin/draft-status.ts`
- Modify: `src/pages/admin/tickets/[id].astro`

- [ ] **Step 1: Create `src/pages/api/admin/ai-draft.ts`:**

```ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { getHelpdeskEnv } from '../../../lib/helpdesk/env';
import { generateDraftForTicket } from '../../../lib/helpdesk/ai';

const json = (body: object, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// CSRF note: protected by Cloudflare Access (edge) + Access-JWT middleware —
// do NOT copy this pattern to a non-Access-gated endpoint.
export const POST: APIRoute = async ({ request }) => {
  let payload: { ticketId?: string };
  try { payload = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const ticketId = (payload.ticketId ?? '').trim();
  if (!ticketId) return json({ error: 'missing_ticket' }, 400);

  const env = await getHelpdeskEnv();
  const body = await generateDraftForTicket(env, ticketId, null);
  return json({ ok: true, body }, 200); // body may be null (no suggestion)
};
```

- [ ] **Step 2: Create `src/pages/api/admin/draft-status.ts`:**

```ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { getHelpdeskEnv } from '../../../lib/helpdesk/env';
import { setDraftStatus } from '../../../lib/helpdesk/db';

const json = (body: object, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const ALLOWED = new Set(['used', 'sent_as_is', 'dismissed']);

// CSRF note: protected by Cloudflare Access (edge) + Access-JWT middleware.
export const POST: APIRoute = async ({ request }) => {
  let payload: { draftId?: number; status?: string };
  try { payload = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const id = Number(payload.draftId);
  const status = payload.status ?? '';
  if (!id || !ALLOWED.has(status)) return json({ error: 'invalid_params' }, 400);

  const env = await getHelpdeskEnv();
  await setDraftStatus(env.DB, id, status);
  return json({ ok: true }, 200);
};
```

- [ ] **Step 3: Update `src/pages/admin/tickets/[id].astro`** — add to the frontmatter imports:

```ts
import { latestSuggestedDraft } from '../../../lib/helpdesk/db';
```

After the `const messages = …` / `markRead` lines, add:

```ts
const draft = await latestSuggestedDraft(env.DB, ticket.id);
```

Then, immediately BEFORE the `<form id="replyForm" …>` element, insert the panel:

```astro
  {draft && (
    <div id="aiPanel" data-draft={draft.id} class="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4">
      <p class="text-[11px] uppercase tracking-wider font-bold text-amber-700 mb-1.5">🤖 Suggested reply</p>
      <p id="aiBody" class="text-sm whitespace-pre-wrap text-brand-blue-darker mb-3">{draft.body}</p>
      <div class="flex flex-wrap gap-2">
        <button id="aiUse" class="text-sm font-bold px-4 py-2 rounded-full bg-white border border-amber-300 hover:border-amber-500">Use &amp; edit</button>
        <button id="aiSend" class="text-sm font-bold px-4 py-2 rounded-full bg-brand-blue text-white hover:opacity-90">Send as-is →</button>
        <button id="aiDismiss" class="text-sm font-semibold px-4 py-2 rounded-full text-amber-700 hover:underline">Dismiss</button>
        <span id="aiStatus" class="text-sm self-center opacity-60"></span>
      </div>
    </div>
  )}
```

At the END of the existing `<script>` block (before `</script>`), add:

```ts
  const aiPanel = document.getElementById('aiPanel');
  if (aiPanel) {
    const draftId = Number((aiPanel as HTMLElement).dataset.draft);
    const aiBody = document.getElementById('aiBody')!.textContent ?? '';
    const aiStatus = document.getElementById('aiStatus')!;
    const markDraft = (status: string) =>
      fetch('/api/admin/draft-status/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draftId, status }) });

    document.getElementById('aiUse')!.addEventListener('click', () => {
      ta.value = aiBody; ta.focus();
      markDraft('used'); aiPanel.remove();
    });
    document.getElementById('aiSend')!.addEventListener('click', async () => {
      aiStatus.textContent = 'Sending…';
      if (await post('/api/admin/reply/', { ticketId, body: aiBody })) { await markDraft('sent_as_is'); location.reload(); }
      else aiStatus.textContent = '';
    });
    document.getElementById('aiDismiss')!.addEventListener('click', () => { markDraft('dismissed'); aiPanel.remove(); });
  }
```

- [ ] **Step 4: Build + smoke.** Insert a fake draft into local D1 for the seeded ticket and confirm the panel renders:

```bash
npm run build 2>&1 | tail -2
# pick any local open ticket id:
TID=$(for db in $(find .wrangler/state -path '*miniflare-D1DatabaseObject*' -name '*.sqlite'); do sqlite3 "$db" "SELECT id FROM tickets LIMIT 1" 2>/dev/null && break; done)
DB=$(for db in $(find .wrangler/state -path '*miniflare-D1DatabaseObject*' -name '*.sqlite'); do sqlite3 "$db" "SELECT 1 FROM tickets LIMIT 1" >/dev/null 2>&1 && echo "$db" && break; done)
sqlite3 "$DB" "INSERT INTO ai_drafts (ticket_id, body, status, model, created_at) VALUES ('$TID','Try the machine next to it — I refunded your \$2.','suggested','test','2026-07-06T00:00:00Z');"
curl -s "http://localhost:4321/admin/tickets/$TID/" | grep -c 'Suggested reply'   # 1
```

- [ ] **Step 5: Interactive smoke.** Navigate to that ticket, screenshot the amber panel, click **Use & edit** → confirm textarea fills and panel disappears; reload, then test **Dismiss** removes it and marks the row `dismissed` in D1. `preview_console_logs level error` clean. Clean up test drafts: `sqlite3 "$DB" "DELETE FROM ai_drafts WHERE model='test';"`.

- [ ] **Step 6: Suite + commit**

```bash
npm test 2>&1 | grep "Tests "
git add src/pages/api/admin/ai-draft.ts src/pages/api/admin/draft-status.ts "src/pages/admin/tickets/[id].astro"
git commit -m "feat(ai): suggested-reply panel + draft api routes"
```

---

## Task 12: Settings page + settings route + nav item

**Files:**
- Create: `src/pages/api/admin/settings.ts`
- Create: `src/pages/admin/settings.astro`
- Modify: `src/components/admin/AdminLayout.astro` (add Settings nav item)

- [ ] **Step 1: Create `src/pages/api/admin/settings.ts`:**

```ts
export const prerender = false;

import type { APIRoute } from 'astro';
import { getHelpdeskEnv } from '../../../lib/helpdesk/env';
import { setSetting } from '../../../lib/helpdesk/db';

const json = (body: object, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// CSRF note: protected by Cloudflare Access (edge) + Access-JWT middleware.
export const POST: APIRoute = async ({ request }) => {
  let payload: { aiEnabled?: boolean; houseRules?: string };
  try { payload = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  const env = await getHelpdeskEnv();
  if (typeof payload.aiEnabled === 'boolean') await setSetting(env.DB, 'ai_enabled', payload.aiEnabled ? '1' : '0');
  if (typeof payload.houseRules === 'string') await setSetting(env.DB, 'house_rules', payload.houseRules.slice(0, 4000));
  return json({ ok: true }, 200);
};
```

- [ ] **Step 2: Create `src/pages/admin/settings.astro`:**

```astro
---
export const prerender = false;

import AdminLayout from '../../components/admin/AdminLayout.astro';
import { getHelpdeskEnv } from '../../lib/helpdesk/env';
import { getSetting } from '../../lib/helpdesk/db';

const env = await getHelpdeskEnv();
const [aiEnabled, houseRules] = await Promise.all([
  getSetting(env.DB, 'ai_enabled'),
  getSetting(env.DB, 'house_rules'),
]);
const enabled = aiEnabled !== '0'; // default on
const hasKey = !!(env as any).ANTHROPIC_API_KEY;
---
<AdminLayout title="Settings">
  <h1 class="text-2xl font-bold tracking-tight mb-5">Settings</h1>

  <section class="bg-white rounded-2xl border border-line shadow-sm p-5 mb-5 max-w-2xl">
    <h2 class="text-sm font-bold mb-1">AI reply assistant</h2>
    <p class="text-sm opacity-60 mb-4">Drafts replies to repeat questions from your past answers. Nothing is ever sent without your approval.</p>

    {!hasKey && (
      <div class="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm mb-4">
        No API key yet. Add a Worker secret named <code class="font-mono">ANTHROPIC_API_KEY</code> in the Cloudflare dashboard to turn this on.
      </div>
    )}

    <label class="flex items-center gap-3 mb-5 cursor-pointer">
      <input type="checkbox" id="aiEnabled" checked={enabled} class="w-5 h-5 accent-brand-blue" />
      <span class="text-sm font-semibold">Suggest replies automatically</span>
    </label>

    <label class="text-xs font-bold uppercase tracking-wider text-brand-blue block mb-2">House rules</label>
    <p class="text-xs opacity-55 mb-2">Hours, refund policy, pricing, anything the assistant should always know. Kept private.</p>
    <textarea id="houseRules" rows="8" maxlength="4000"
      class="w-full border-[1.5px] border-line rounded-xl px-3.5 py-3 text-sm focus:border-brand-blue focus:outline-none resize-y"
      placeholder="e.g. Refunds for machine failures within 7 days. Open 6am–11pm daily. Detergent vending by the door.">{houseRules ?? ''}</textarea>

    <div class="flex items-center gap-3 mt-3">
      <button id="saveBtn" class="bg-brand-red text-white font-bold text-sm px-7 py-2.5 rounded-full disabled:opacity-50">Save</button>
      <span id="saveStatus" class="text-sm opacity-60" aria-live="polite"></span>
    </div>
  </section>
</AdminLayout>

<script>
  const enabledEl = document.getElementById('aiEnabled') as HTMLInputElement;
  const rulesEl = document.getElementById('houseRules') as HTMLTextAreaElement;
  const statusEl = document.getElementById('saveStatus')!;
  let saving = false;
  document.getElementById('saveBtn')!.addEventListener('click', async () => {
    if (saving) return;
    saving = true; statusEl.textContent = 'Saving…';
    try {
      const res = await fetch('/api/admin/settings/', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiEnabled: enabledEl.checked, houseRules: rulesEl.value }),
      });
      statusEl.textContent = res.ok ? 'Saved ✓' : 'Failed — try again.';
    } catch {
      statusEl.textContent = 'Failed — try again.';
    }
    saving = false;
  });
</script>
```

- [ ] **Step 3: Add the Settings nav item** in `src/components/admin/AdminLayout.astro` — change the `nav` array to:

```ts
const nav = [
  { href: '/admin/', label: 'Dashboard', icon: '▚' },
  { href: '/admin/tickets/', label: 'Tickets', icon: '✉' },
  { href: '/admin/analytics/', label: 'Analytics', icon: '▟' },
  { href: '/admin/settings/', label: 'Settings', icon: '⚙' },
];
```

- [ ] **Step 4: Build + smoke.**

```bash
npm run build 2>&1 | tail -2
curl -s http://localhost:4321/admin/settings/ | grep -c 'House rules'   # 1
# save round-trip:
curl -s -X POST http://localhost:4321/api/admin/settings/ -H 'Content-Type: application/json' -H 'Origin: http://localhost:4321' \
  -d '{"aiEnabled":true,"houseRules":"Open 6am-11pm. Refunds within 7 days."}'   # {"ok":true}
curl -s http://localhost:4321/admin/settings/ | grep -c 'Refunds within 7 days'  # 1 (persisted)
```

- [ ] **Step 5: Interactive smoke.** Navigate `/admin/settings/`, edit house rules, click Save → "Saved ✓"; reload → text persists; toggle checkbox + save. Console clean.

- [ ] **Step 6: Suite + commit**

```bash
npm test 2>&1 | grep "Tests "
git add src/pages/api/admin/settings.ts src/pages/admin/settings.astro src/components/admin/AdminLayout.astro
git commit -m "feat(ai): settings page (AI toggle + house rules) and nav item"
```

---

## Task 13: Full verification pass + deploy

**Files:** none (verification + prod migration + deploy)

- [ ] **Step 1: Clean build + full suite + email-handler survival check.**

```bash
cd "/Users/eliranderei/Found Sock Laundromat"
rm -rf dist node_modules/.astro
npm run build && npm test 2>&1 | grep -E "Test Files|Tests "
node -e "const fs=require('fs');const m=fs.readFileSync('dist/server/entry.mjs','utf8').match(/chunks\/[\w.-]+\.mjs/);const c=fs.readFileSync('dist/server/'+m[0],'utf8');console.log(/async email\s*\(/.test(c)?'email-handler-present':'MISSING')"
```
Gate: 0 failures; `email-handler-present`.

- [ ] **Step 2: Public-page regression greps (100/100 guard — must be unchanged).**

```bash
grep -c 'sendBeacon' dist/client/index.html                       # 1
grep -o '<title>[^<]*</title>' dist/client/index.html             # homepage title unchanged
grep -c 'admin' dist/client/sitemap-0.xml || echo 0               # 0
grep -c 'Disallow: /admin/' dist/client/robots.txt                # 1
ls dist/client/photos/og/default.jpg                              # exists
```

- [ ] **Step 3: Apply BOTH prod migrations** (Cloudflare dashboard → D1 → foundsock-helpdesk → Console). If Part A already deployed its ALTER at the Task 6 checkpoint, skip the first line.

```sql
ALTER TABLE pageviews ADD COLUMN hour INTEGER;
CREATE TABLE IF NOT EXISTS ai_drafts (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id TEXT NOT NULL REFERENCES tickets(id), trigger_message_id INTEGER, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'suggested', model TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_ai_drafts_ticket ON ai_drafts(ticket_id, created_at DESC);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
```
Verify: `SELECT name FROM sqlite_master WHERE type='table';` includes `ai_drafts`, `settings`; `PRAGMA table_info(pageviews);` includes `hour`.

- [ ] **Step 4: Merge + deploy.**

```bash
git checkout main && git merge --ff-only feat/admin-v2
TOKEN=$(gh auth token --user eliranetinc-droid) && git push "https://x-access-token:${TOKEN}@github.com/eliranetinc-droid/foundsocklaundromat.git" main
```
Watch the build in Workers & Pages → Deployments. Then poll live until the new admin serves:

```bash
for i in $(seq 1 30); do c=$(curl -s "https://www.foundsocklaundromat.com/admin/settings/" -o /dev/null -w "%{http_code}"); echo "$i: $c"; [ "$c" = "302" ] && echo "LIVE (Access redirect = deployed)" && break; sleep 15; done
```
(302 = Access login wall in front of the new page = deployed. A 404 would mean the old build.)

- [ ] **Step 5: Live smoke (signed in).** Visit `https://www.foundsocklaundromat.com/admin/` → new shell + dashboard render; `/admin/analytics/?period=7` works; `/admin/settings/` loads. Submit a test issue → confirm branded HTML confirmation arrives and the owner notification is HTML with an "Open in admin" button.

---

## Task 14: Anthropic key setup + enable (interactive with owner)

**Files:** none (dashboard + verification)

- [ ] **Step 1 (owner):** Create an Anthropic API account at console.anthropic.com, add a small credit balance, create an API key (starts `sk-ant-…`).
- [ ] **Step 2 (owner):** Cloudflare dashboard → Workers & Pages → `foundsocklaundromat` → Settings → Variables and Secrets → **+ Add** → Type **Secret**, Name `ANTHROPIC_API_KEY`, Value = the key → Deploy.
- [ ] **Step 3:** Confirm live: `/admin/settings/` no longer shows the "No API key yet" banner.
- [ ] **Step 4 (owner):** Set house rules in `/admin/settings/` (hours, refund policy, common answers) and Save.
- [ ] **Step 5: Live E2E.** From a test address, email `support@foundsocklaundromat.com` a common question (e.g. "what are your hours?"). Within ~1 min: the ticket shows the amber "🤖 Suggested reply" panel; the owner notification email includes the suggested reply; clicking **Send as-is** delivers it and the draft row flips to `sent_as_is`. Send an off-topic message and confirm the assistant produces no draft (SKIP path).

---

## Plan self-review (author)

- **Spec coverage:** shell §4.1 → T1; dashboard §4.2 → T2+T3; analytics §4.3 + ET buckets → T4+T5; HTML emails §4.4 → T6; AI data §5.1 → T7; provider §5.2 → T9; context/prompt §5.3 → T8; flow/UI §5.4 (generate on intake+inbound, thread panel, routes, settings, learning loop) → T10+T11+T12; cost/safety §5.5 → T9 (failure-tolerant, max_tokens) + T14; rollout §6 → deploy checkpoints in T6/T13/T14; testing §7 → TDD in T2/T4/T6/T7/T8/T9 + verification T13.
- **Type consistency:** `notificationEmail` new signature (adds `customerEmail`, `machine?`, `source?`, `aiDraft?`) updated in both callers (T6 then T10); `generateDraftForTicket(env, ticketId, triggerMessageId)` used identically in T10/T11; `sendEmail` `html` field already exists (verified in resend.ts). `getSetting`/`setSetting`/`insertDraft`/`latestSuggestedDraft`/`recentOutboundPairs`/`supersedeDrafts`/`setDraftStatus` defined T7, consumed T9/T11/T12. `etDayHour` defined T4, consumed by `insertPageview`/`sinceDay` same task.
- **Placeholder scan:** none — every code step is complete.
- **Known deliberate choices:** AI trigger message id passed as `null` (orchestrator re-reads latest inbound) — simpler than threading the new message id through `addMessage` (which returns void); documented in T10. Historical pageview rows keep null `hour` (excluded from busiest-hours via `hour IS NOT NULL`) — acceptable, small volume.
