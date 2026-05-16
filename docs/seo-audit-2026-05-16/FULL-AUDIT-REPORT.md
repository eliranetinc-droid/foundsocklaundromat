# Full SEO Audit Report — The Found Sock Laundromat
**Date:** 2026-05-16
**Site:** https://www.foundsocklaundromat.com (custom domain not yet connected)
**Stack:** Astro 6 + Tailwind 4 + Cloudflare Workers
**Pages audited:** 32 (home, 10 marketing/info, 5 area, 16 blog posts, blog index, 404)
**Method:** 6 parallel specialist subagents — Technical, Content/E-E-A-T, Schema, Sitemap, Performance, GEO/AI

---

## Executive Summary

### Overall SEO Health Score: **76 / 100** (B)

Weighted breakdown:

| Category | Weight | Score | Weighted |
|---|---|---|---|
| Technical SEO | 25% | 76 | 19.0 |
| Content Quality + E-E-A-T | 25% | 78 (E-E-A-T: 72) | 19.5 |
| On-Page SEO | 20% | 80 | 16.0 |
| Schema / Structured Data | 10% | 85 | 8.5 |
| Performance (CWV) | 10% | 70 | 7.0 |
| Images | 5% | 50 | 2.5 |
| AI Search Readiness (GEO) | 5% | 74 | 3.7 |
| **TOTAL** | 100% | — | **~76** |

**One-line verdict:** Strong technical and content foundations with three categories of fixable bugs holding the site back — image optimization, identity/trust signals (phone + reviews + author), and crawl-efficiency consistency (trailing slash + lastmod + orphaned area pages). Fixing the 10 Critical+High items below should move the score to ~93.

---

## Top 5 Critical Issues (fix before launch)

1. **Placeholder Google reviews shipping to production homepage.** `dist/client/index.html` literally renders the strings *"Real reviews will be fetched from Google Places API at build time"* and *"Will be replaced once owner provides Google Place ID"* under 5-star ratings, attributed to "Placeholder" and "Placeholder 2". Trust impact is catastrophic — every first-time visitor sees fake five-star reviews.
   - File: `src/data/reviews.json` + `src/components/ReviewsBlock.astro`
   - Flagged by: Content, GEO

2. **Phone number missing site-wide.** `src/data/business.json:23` has `"phone": null`. The LocalBusiness JSON-LD silently omits `telephone`. No phone anywhere on llms.txt, contact page, or footer. Single biggest missing trust signal for a local business — blocks Bing Copilot citations, weakens AI Overview eligibility, drops conversion.
   - Flagged by: GEO, Content

3. **Trailing-slash mismatch between canonicals/sitemap and every internal link.** Built canonicals + 32 sitemap URLs all use trailing slash, but `astro.config.mjs` doesn't declare a `trailingSlash` policy and every header/footer link points to the non-slash version. Every nav click on production = a 301 redirect.
   - Files: `astro.config.mjs`, `src/components/Header.astro:3-9`, `src/components/Footer.astro:22-40`, plus all `generateBreadcrumbSchema` callers
   - Flagged by: Technical

4. **All 5 `/area/*` neighborhood pages are completely orphaned.** Zero `<a href="/area/...">` exists anywhere in the built output. They live in the sitemap but no internal navigation reaches them — defeats the entire purpose of having neighborhood landing pages.
   - Flagged by: Technical, GEO

5. **Every image ships as a raw 1600px JPEG with no AVIF/WebP/srcset.** `astro:assets` is not in use anywhere. `storefront.jpg` (328 KB), `inside-1.jpg` (332 KB), and the gallery (5.4 MB) all serve at full intrinsic resolution. Plus `dist/client/photos/wix-source/` (30 MB) and `gmb-source/` (3.3 MB) get deployed to Cloudflare on every build despite not being referenced anywhere.
   - Flagged by: Performance

---

## Top 5 Quick Wins (high impact, low effort)

| # | Fix | File | Effort | Impact |
|---|---|---|---|---|
| 1 | Set `"phone": "+1-617-XXX-XXXX"` in business.json | `src/data/business.json:23` | 1 min | Flows into LocalBusiness schema, llms.txt, contact page |
| 2 | Filter out `Placeholder` authors in ReviewsBlock OR replace reviews.json with curated real quotes | `src/components/ReviewsBlock.astro` | 15 min | Removes trust-killing fake reviews |
| 3 | Remove `public/photos/wix-source/` and `public/photos/gmb-source/` (33 MB) | shell `mv` | 1 min | 33 MB less per deploy |
| 4 | Add `trailingSlash: 'always'` to astro.config.mjs + add trailing slash to header/footer link hrefs | 2 files | 10 min | Eliminates 301 on every nav click |
| 5 | Add a "Service area" footer block linking to all 5 `/area/*` pages | `src/components/Footer.astro` | 10 min | Un-orphans 5 ranking pages |

---

# Detailed Findings

## 1. Technical SEO (Score: 76 / 100)

### Critical
**C1. Trailing-slash inconsistency** — `astro.config.mjs` defaults `trailingSlash: 'ignore'`; canonicals + sitemap use trailing slash; every header/footer link drops it. Cloudflare Workers static asset binding issues a 301 on `/about` → `/about/`. Every navigation click = redirect.
*Fix:* Set `trailingSlash: 'always'` in astro.config.mjs. Update `src/components/Header.astro:3-9` and `src/components/Footer.astro:22-40` to use trailing slashes.

**C2. Article + Breadcrumb schema URLs missing trailing slash** — `src/lib/schema.ts:86` (`url: ${baseUrl}/blog/${article.slug}`), and every `generateBreadcrumbSchema` caller passes URLs without trailing slash. Mismatched with canonical can drop Article rich results.
*Fix:* Append trailing slash in both `schema.ts:86` and every caller.

**C3. 5 area pages orphaned** — `/area/allston/`, `/area/brighton-center/`, `/area/brookline-village/`, `/area/cleveland-circle/`, `/area/oak-square/` have zero internal links. In sitemap but not crawlable through navigation.
*Fix:* Add "Service area" section to footer + home page.

### High
**H1. Sitemap has no `<lastmod>`** — 32 URLs in sitemap-0.xml, zero `<lastmod>`. Google uses lastmod as a recrawl hint; without it crawl efficiency degrades.
*Fix:* Configure `@astrojs/sitemap` to derive lastmod from content collection frontmatter.

**H2. Hero JPEGs unoptimized** — `storefront.jpg` is 328 KB at 1600×1066 rendered at ~400px. No srcset, no `<picture>`, no `astro:assets`. LCP element on home + visit pages.
*Fix:* Migrate to `astro:assets <Picture>` with AVIF/WebP and widths=[400,800,1200].

**H3. Inter.woff2 = 352 KB unsubsetted variable font** — covers weights 100-900 + Latin-Ext + Cyrillic. Site is English-only using ~2 weights.
*Fix:* Subset to Latin + the punctuation actually used via glyphhanger → ~50 KB. Saves 290 KB on every cold page.

**H4. CSP `connect-src 'self'` will block Places API JS calls** — current CSP works for the iframe but blocks future review fetching from JS.
*Fix:* Add `https://maps.googleapis.com https://places.googleapis.com` to `connect-src` in `public/_headers`.

### Medium
- M1: 12/16 blog titles run 72-98 chars (Google truncates at ~60)
- M2: Home meta description 182 chars (truncates at 160)
- M3: Placeholder reviews shipping to prod (also see Content C1)
- M4: Hard-coded `https://www.foundsocklaundromat.com` baseUrl in schema.ts (won't work on preview deploys)
- M5: FAQ schema only on `/faq/`; missing on `/loyalty/`, `/pricing/`, `/visit/`, `/app/`
- M6: `/blog/` index has no Blog/ItemList schema
- M7: Storefront `<img>` declares width=800 but intrinsic is 1600×1066

### Low
- L1: No IndexNow key file — Bing/Yandex discovery lags
- L2: No `aria-current` on active nav link
- L4: Mobile menu toggle doesn't update `aria-expanded`
- L5: Logo PNG is 25 KB; SVG would be 1-2 KB

### What's already done well
- All security headers present (HSTS preload, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy)
- robots.txt allows GPTBot/ClaudeBot/PerplexityBot/Google-Extended (best-in-class AI crawler permissions)
- One H1 per page across all 32 pages
- 404 correctly emits `noindex`
- font-display: swap set on both fonts
- Zero third-party JS (no GA/GTM)
- All assets cached `max-age=31536000, immutable`

---

## 2. Content Quality + E-E-A-T (Score: 78 / 100, E-E-A-T 72 / 100)

### E-E-A-T scorecard
| Factor | Weight | Score | Notes |
|---|---|---|---|
| Experience | 20% | 16/20 | Voice reads first-hand; local color (BC games, Sep 1 move-in, comforter rush). Limited by anonymous author. |
| Expertise | 25% | 21/25 | Genuinely correct detergent chemistry, fabric physics, machine sizing math. |
| Authoritativeness | 25% | 14/25 | Author shown only as "Organization", no bio/team page, no external citations, fake reviews. |
| Trustworthiness | 30% | 21/30 | NAP/hours/pricing consistent + schema clean. Hurt by placeholder reviews, no phone, unsubstantiated superlatives. |

### Readability
All 16 posts score Flesch 68-89.5 (very accessible). **No remediation needed.**

### Word counts
- Blog posts: 474-822 words. Tight + voice-driven by design — **don't pad**.
- Area pages: 168-217 words — **too thin, expand to 400-500**.
- Welcome post: 154 words — too short for a featured post (gets surfaced as "Latest" on /blog).
- About page: ~145 words — too thin for an About page.

### Critical
**C1 (Content). Placeholder Google reviews on production homepage.** Same finding as overall #1. `src/data/reviews.json` contains `"Real reviews will be fetched..."` strings rendered with 5-star ratings.

**C2 (Content). "Drop off" language on Brighton Center area page contradicts self-service-only positioning.** `src/content/areas/brighton-center.md:13`: *"Walk over, drop off, walk home"* — but you don't offer drop-off service.
*Fix:* Replace with `"Walk over, start a load, walk home"`.

### High
**H1. Article schema author is `Organization`** — Sept 2025 QRG explicitly favors named expert authors. Fix in schema.ts + add byline to blog template.

**H2. No `dateModified` in Article schema** despite every post having an `updatedAt` field. Posts from 2024-11-17 (`how-to-remove-tough-stains`, `how-to-use-coinless-payment`) appear stale.
*Fix:* Pass `post.data.updatedAt` to `generateArticleSchema`, emit `dateModified`.

**H3. Area pages thin and repetitive** (168-217 words, same 4-5 bullet talking points). QRG would flag as borderline doorway/programmatic.
*Fix:* Extend each to 400-500 words with genuinely neighborhood-specific content (BU dorm move-out for Allston, 57 bus for Cleveland Circle, etc.).

**H4. Allston "best times" tip contradicts the blog post.** `src/content/areas/allston.md:26` says *"Sunday mornings (9-11 AM) and Wednesday afternoons are our quietest times"* but `best-time-to-visit.md` shows Sunday 11 AM-4 PM is the busiest window of the entire week.
*Fix:* Update Allston to `"Tuesday and Wednesday mornings are our quietest times. Avoid Sunday 11 AM-4 PM."`

**H5. Allston "month of laundry in one cycle" contradicts overload warnings.** Allston page says use 45 lb washer for *"a full month of laundry in one cycle"*, but etiquette + comforter posts warn against overloading.
*Fix:* `"A 45 lb washer handles 2-3 weeks of regular laundry in one cycle."`

**H6. TV/seating claims need physical verification.** Made on 5 pages — if reviewers can disprove, it's a QRG "Lowest" page-quality trigger.

### Medium
- M1: `welcome.md` has unsubstantiated claims ("100/100 Google mobile speed", "faster than 99% of laundromats")
- M2: pricing.astro:24 alt-text says "25 lb washers" — that size doesn't exist (your sizes are 20/30/35/45)
- M3: reviews.json has `rating: 4.8` and `count: 217` but no schema or render uses them
- M4: Missing phone number (also see GEO #1, overall Critical #2)
- M5: Blog posts under-link to /pricing, /loyalty, /visit (several have 0 links)
- M6: `scratchy-towels-fix.md` and `too-much-detergent.md` overlap ~30% on detergent topic
- M7: Tag taxonomy too broad; most posts share `how-to`/`first-time`/`tips`

### Low
- L1: welcome.md is the newest post, so it gets featured on /blog despite being weakest hook
- L2: welcome.md title "We rebuilt our website..." is inward-facing
- L6: about page is 145 words; needs owner name, story, milestones
- L7: "Brighton's cleanest" superlative unsubstantiated

---

## 3. Schema / Structured Data (Score: 85 / 100)

**No Critical issues.** Implementation is clean, type-safe, centralized in `src/lib/schema.ts`, with tests. Currently emits:
- `Laundry` (LocalBusiness subtype) on all 18 pages — valid
- `BreadcrumbList` on 17 pages
- `FAQPage` on `/faq` only
- `Article` on all 16 blog posts

### High (all additive — unlock more rich results)
**H1. Switch `Article` → `BlogPosting`, add `dateModified`, `publisher`, `mainEntityOfPage`, `ImageObject`** for blog posts.

**H2. Enrich `Laundry` schema** with `@id`, `sameAs` (Google Maps with Place ID, Yelp, FB, IG), `hasMap`, `areaServed` (Brighton/Allston/Brookline/Cleveland Circle/Oak Square), `currenciesAccepted`, `amenityFeature` (Wi-Fi, self-service, card machines, app, folding tables, TV/seating, family washers), `slogan`.

**H3. Use post-specific images in blog Article schema.** All 16 posts currently emit the same `/photos/og/default.jpg`. Add per-post `image:` in frontmatter + photos in `public/photos/blog/`.

### Medium
- M1. Add global `Organization` + `WebSite` schema (enables SiteLinks Search Box once /search exists, builds connected entity graph)
- M2. Add `OfferCatalog` + `Service` schemas for washers/dryers/loyalty on `/pricing` and `/loyalty`
- M3. `WebPage` typing on non-blog pages (`AboutPage`, `ContactPage`, `CollectionPage`)
- M4. **Do NOT add `HowTo`** — Google removed HowTo rich results in Sept 2023

### Low
- L1. `paymentAccepted` array vs string — both valid
- L2. `telephone` waits on phone number being added
- L5. Update `schema.test.ts` after BlogPosting change

---

## 4. Sitemap (Score: A-, ~90/100)

| Check | Status |
|---|---|
| Valid XML format | PASS |
| Sitemap index references sitemap-0.xml | PASS |
| robots.txt references sitemap | PASS |
| Under 50,000 URLs (currently 32) | PASS |
| All URLs HTTPS + www | PASS |
| Trailing slash consistency | PASS |
| 404 excluded | PASS |
| API routes excluded | PASS |
| Expected pages present | PASS (32/32) |
| `<lastmod>` present | **FAIL — missing on all 32 URLs** |
| Unused namespaces | WARN (news/xhtml/image/video declared but unused) |

### Medium
**M1. Add `<lastmod>` to every URL** — same as Technical H1. Use Astro sitemap config to derive from frontmatter.

### Low
**L1. Drop unused XML namespaces** (or start using `image:` extensions for the gallery page).

---

## 5. Performance / Core Web Vitals (Score: 70 / 100)

### Critical
**C1. Every image is a raw 1600px JPEG with no format negotiation.** `astro:assets` not used anywhere (verified via grep). Storefront.jpg = 328 KB, gallery = 5.4 MB total. Gallery's first 3 images eager-loaded = 1.25 MB above fold.

**C2. Gallery `<img>` tags have no width/height** in `src/pages/gallery.astro:24` (24 images). PhotoStrip same. Triggers Lighthouse `unsized-images` warning; CLS risk before Tailwind aspect-ratio utility applies.

### High
**H1. Inter.woff2 = 344 KB unsubsetted** — covers all weights 100-900 + Latin-Ext + Cyrillic, site uses 4 weights of Latin.

**H2. Gallery eagerly loads first 3 images = 1.25 MB above fold.** Only first card is above fold on mobile.

**H3. 33 MB of unused source images shipped to Cloudflare.** `public/photos/wix-source/` (30 MB) and `gmb-source/` (3.3 MB) — never referenced but copied into `dist/client/photos/` on every build.

**H4. InstrumentSerif-Italic.woff2 used in hero "cleanest" not preloaded** — visible FOUT.

### Medium
- M1. `OpenNowBadge` runs `setInterval(refresh, 60_000)` forever — prevents bfcache eligibility
- M2. Logo PNG is 25 KB; SVG would be 1-2 KB
- M3. Report-issue ships 143 `<option>` elements inline (96 time slots) — slow INP on iOS native pickers. Use `<input type="time" step="900">` instead

### Page-by-page LCP estimate (4G mobile, before fixes)
| Page | LCP candidate | Est. LCP |
|---|---|---|
| `/` (desktop) | `storefront.jpg` 328 KB | ~1.3 s |
| `/` (mobile) | H1 text (image hidden md:flex) | ~0.6 s |
| `/visit` | `storefront.jpg` 328 KB | ~1.3 s |
| `/gallery` | `gallery/01.jpg` 206 KB | ~1.0-1.4 s |
| `/blog/*` | H1 text | ~0.5 s |
| `/pricing`, `/faq`, etc. | H1 text | ~0.5 s |

After fixes 1-4: LCP drops to 0.8-1.2s on 4G mobile (firmly "Good"). Page weight: ~700 KB → ~120 KB cold.

### What's already done well
- font-display: swap on both faces
- LCP candidates marked loading=eager + fetchpriority=high
- Below-fold images loading=lazy + decoding=async
- Single inline CSS bundle (no render-blocking external CSS)
- Zero third-party JS
- Iframe map loading=lazy
- `Cache-Control: max-age=31536000, immutable` for fonts/photos/brand

---

## 6. AI Search Readiness / GEO (Score: 74 / 100)

### Platform-specific predicted performance
| Platform | Score | Why |
|---|---|---|
| Google AI Overviews | 78 | Excellent FAQ + Laundry LocalBusiness schema |
| ChatGPT web search | 72 | Crawler allowed, clean SSR, ideal passage structure |
| Perplexity | 80 | Loves the tables + list structure in blog posts |
| Bing Copilot | 65 | Missing phone + reviews + visible map hurts |

### AI crawler accessibility — PASS
Allowed: GPTBot, ChatGPT-User, ClaudeBot, PerplexityBot, Google-Extended.
Missing: OAI-SearchBot, Applebot-Extended (add to `public/robots.txt`).

### llms.txt — present, good but thin
28 lines / ~270 words. Missing: phone, blog content links, owner/founding story, Allston/Brookline/Cleveland Circle/Oak Square mentions, optional `/llms-full.txt`.

### Critical
**C1. Phone number missing.** Same finding as overall #2.

**C2. Placeholder reviews shipping to prod.** Same finding as overall #1.

**C3. Homepage doesn't mention Allston, Brookline, Cleveland Circle, Oak Square, BC, BU, Brighton Center.** 20 mentions of "Brighton" — zero of the others. Area pages exist but homepage doesn't reference them.

### High
- H1. Add Person-typed author + FAQPage schema to relevant blog posts (those with "Common questions" sections, frequency-pattern posts)
- H2. Enrich llms.txt: add `## Service area`, `## Featured guides`, phone number, optional `/llms-full.txt`
- H3. Add `sameAs` array (Google Maps with Place ID, Yelp, Facebook, Instagram) to LocalBusiness schema
- H4. Each area page needs 3+ additional H2 sections to reach 600-800 words
- H5. Make `welcome.md` longer or hide it (currently surfaces as "Latest post" on /blog)

### Medium
- M1. Add OAI-SearchBot + Applebot-Extended to robots.txt
- M2. Replace "Map coming soon" placeholder on 10 pages with actual embed (CSP frame-src already allows it)
- M3. Add owner first name + photo to About page
- M4. Real customer testimonial section to homepage (full attribution name + date)
- M5. Add aggregateRating once Places API integration ships (currently 4.8★ 217 reviews in JSON, unused)

### Citability strengths (already excellent)
- Direct-answer opening paragraphs in 14/16 blog posts
- Specific numbers everywhere ($6.25, 30 lb, 60-90 min, 1/4 cup vinegar)
- Tables in `best-time-to-visit.md` and `how-long-does-laundry-take.md`
- Question-shaped H2s ("How much is 'too much'?", "What if I only have cash?")
- All posts in the 134-167 words-per-section sweet spot

---

## Cross-Cutting Themes (flagged by multiple specialists)

| Theme | Severity | Flagged by |
|---|---|---|
| Placeholder reviews on production homepage | **Critical** | Content, GEO, Technical (M3) |
| Phone number missing site-wide | **Critical** | Content (M4), GEO (C1) |
| Trailing-slash inconsistency (links + canonicals + schema URLs) | **Critical** | Technical (C1+C2) |
| Image format/size optimization | **Critical** | Performance (C1), Technical (H2) |
| Area pages orphaned + thin + contradictory | **Critical + High** | Technical (C3), Content (H3+H4+H5), GEO (H4) |
| Inter font not subsetted | **High** | Performance (H1), Technical (H3) |
| Missing `<lastmod>` on sitemap URLs | **High** | Sitemap, Technical (H1) |
| Article author as Organization not Person | **High** | Content (H1), Schema (H1), GEO (H1) |
| `dateModified` missing on blog Article schema | **High** | Content (H2), Schema (H1) |
| 33 MB of unused images shipped to Cloudflare | **High** | Performance (H3) |

---

## What's Already Excellent (don't touch)

- robots.txt with explicit AI crawler permissions (top 1% of small business sites)
- All security headers (HSTS preload, CSP, X-Frame-Options, Permissions-Policy)
- llms.txt present (most sites don't have one)
- Schema.ts is type-safe, centralized, tested
- Blog content is genuinely well-written, voice-driven, factually correct, locally specific
- Readability scores 68-89.5 across all posts (very accessible)
- Direct-answer paragraph structure in 14/16 blog posts (ideal for AI citation)
- Sitemap clean (just missing lastmod)
- LocalBusiness/Laundry schema valid on every page
- One H1 per page, no skipped heading levels in blog
- Zero third-party JS (no GA, no tracking)
- 6 AM – 11 PM hours consistent across business.json, schema, llms.txt, footer
- 76 Washington St NAP consistent across all touchpoints

---

## Files Referenced (most-touched)

- `src/data/business.json` — phone, sameAs URLs to add
- `src/data/reviews.json` + `src/components/ReviewsBlock.astro` — placeholder reviews
- `src/lib/schema.ts` — multiple enhancements
- `src/pages/blog/[...slug].astro` — author, dateModified, BlogPosting
- `src/components/Header.astro` + `src/components/Footer.astro` — trailing slashes, area links
- `src/components/Hero.astro` + `src/components/PhotoStrip.astro` + `src/pages/gallery.astro` — astro:assets migration
- `src/styles/global.css` — font weight range
- `public/fonts/Inter.woff2` — subset to Latin
- `public/photos/wix-source/` + `public/photos/gmb-source/` — delete 33 MB
- `public/_headers` — connect-src additions
- `public/robots.txt` — OAI-SearchBot + Applebot-Extended
- `public/llms.txt` — enrich
- `astro.config.mjs` — trailingSlash + sitemap lastmod
- `src/content/areas/*.md` — extend all 5
- `src/content/blog/welcome.md` — soften claims, retitle
- `src/pages/about.astro` — extend to 400-500 words

See `ACTION-PLAN.md` for the prioritized fix order.
