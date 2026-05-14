# The Found Sock Laundromat — New Website Design Spec

**Date:** 2026-05-14
**Status:** Draft — pending user approval
**Owner:** Elirannderei (business owner) + Claude (build partner)

---

## 1. Project goals

Build a brand-new website for **The Found Sock Laundromat** (Brighton, MA) that:

1. **Replaces the current Wix site** (`https://www.foundsocklaundromat.com/`) — full migration off Wix.
2. **Achieves 100/100 on Google PageSpeed Insights** for Core Web Vitals (LCP, INP, CLS).
3. **Modernizes the visual look** — current Wix site feels dated.
4. **Drives walk-in traffic** via local SEO + AI-search citations (no e-commerce, no booking).
5. **Preserves SEO equity** during migration via 301 redirects.
6. **Costs ~$0/month after migration** (only ~$10/year for domain renewal).

---

## 2. Business context (confirmed via current site)

| Field | Value |
|---|---|
| Business name | The Found Sock Laundromat |
| Address | 76 Washington St., Brighton, MA 02135 |
| Hours | Daily 6:00 AM – 11:00 PM |
| Service | Self-service laundromat (no wash & fold, no pickup/delivery, no commercial accounts) |
| Payment | Credit card, Apple Pay, Google Pay, **loyalty card** (no coins). **Cash accepted indirectly:** customers load cash onto a loyalty card at the in-store touchscreen kiosk, then tap to pay at any machine. |
| Payment system | **Card Concepts / CCI (FasCard)** — kiosk + reader on every machine + mobile app |
| Loyalty card | $1.50 one-time fee, $1 minimum load, no maximum, **never expires**, reloadable forever |
| Mobile app | **CCI/FasCard app** (iOS + Android, free). Full customer feature set: |
| · Quick Start | Scan the machine's QR code with phone camera → starts the machine remotely |
| · Real-time availability | See which washers and dryers are open / in use at our location before walking in |
| · Cycle notifications | Push notification + optional email when your wash or dry cycle finishes |
| · Reload from app | Top up your loyalty card balance with credit card from inside the app — no kiosk needed |
| · Balance & history | View card balance and full transaction history any time |
| · App Store | iOS: <https://apps.apple.com/us/app/fascard/id971906763> |
| · Play Store | Android: <https://play.google.com/store/apps/details?id=com.fascard.mobile> |
| Loyalty | 10% cashback program |
| Logo | Existing (blue `#2864A0` + red `#C80014` — washing machine icon + wordmark) |
| Photos | Owner has personal photos + Google Business Profile photos available |
| GMB | Owner has access to Google Business Profile |

### Current Wix machine pricing (to carry over)
- 20 lb (Wascomat) washer: $6.00
- 30 lb (LG) washer: $6.25
- 35 lb (LG) washer: $6.50
- 45 lb (Electrolux) washer: $7.75
- Wascomat dryers (30 lb): $0.50 / 4 minutes

---

## 3. Decisions locked in (from brainstorming session)

| Decision | Choice | Rationale |
|---|---|---|
| Visual direction | Bold & Confident | Trustworthy, conversion-focused, modern |
| Services scope | Self-service only | Matches reality — no need for booking/checkout |
| Helpdesk for issue reporting | **Freshdesk free tier** | Free forever, hides owner's email/phone, mobile app with push notifications — same UX as Wix Inbox |
| Content management | **No CMS** — direct AI-drafted blog posts via git | User prefers Claude to draft posts on demand; can add Decap CMS later if needed |
| Tech stack | **Astro 5 + Tailwind CSS v4** | Gold standard for SEO-critical static sites in 2026 |
| Hosting | **Cloudflare Pages** (free) | Fastest global edge, perfect for SEO, $0/month |
| Domain registrar | **Cloudflare Registrar** (transferred from Wix) | At-cost pricing (~$10/yr), free DNS/SSL/DNSSEC |
| Analytics | **Cloudflare Web Analytics** (free) | Privacy-first, no cookie banners, replaces Google Analytics |
| Brand palette | Pulled from existing logo: `#2864A0` blue + `#C80014` red + variations + cream | Brand consistency with logo |
| Typography | Inter (variable, self-hosted) + Instrument Serif (italic accents) | Zero external font requests = Core Web Vitals win |

---

## 4. Sitemap & page structure

Site has **11 pages**, organized in 4 tiers:

### Tier 1 — Conversion engine
- **`/`** — Home (hero, "Open now" status, services snapshot, photos, reviews, map, primary CTA: "Get Directions")
- **`/visit`** — Location, map, parking, "what to expect" first-timer guide
- **`/pricing`** — Full machine pricing, payment methods, loyalty info

### Tier 2 — Trust & community
- **`/about`** — Story, sustainability, locally-owned
- **`/loyalty`** — 10% cashback program details + how the touchscreen kiosk works (load card with cash or credit, tap-to-pay at any machine) + **mobile app** explanation (start machines remotely, reload card via app), sign-up. Card details: $1.50 one-time fee, $1 minimum load, never expires.
- **`/app`** *(new — see Open Question §11.7)* — Dedicated page for the CCI/FasCard app. Features highlighted:
  - **Quick Start** with your phone's camera (scan QR on the machine reader)
  - **See which machines are open right now** before you come in
  - **Get notified when your cycle is done** (push or email)
  - **Reload your loyalty card from your phone** (credit card, $1 minimum)
  - **View balance and full transaction history**
  - Big App Store + Play Store badge buttons; QR codes for tap-to-install in-store
- **`/gallery`** — Photo gallery (owner + GMB photos)
- **`/faq`** — Common questions (detergent? holiday hours? kids?) — wins featured snippets

### Tier 3 — SEO content engine (unlimited URLs)
- **`/blog`** — Blog index
- **`/blog/[slug]`** — Individual posts, AI-drafted, owner-approved
  - Examples: `/blog/how-to-wash-a-down-comforter`, `/blog/best-way-to-remove-red-wine-stains`
- **`/area/[neighborhood]`** — Per-neighborhood local SEO pages
  - Proposed slugs: `/area/allston`, `/area/oak-square`, `/area/cleveland-circle`, `/area/brookline-village`, `/area/brighton-center`
  - (Confirm/adjust list in Open Questions §11.3)

### Tier 4 — Support
- **`/report-issue`** — Freshdesk-backed form
- **`/contact`** — Same form, general inquiry framing

### Technical files (behind the scenes)
- `/sitemap.xml` — auto-generated
- `/robots.txt` — explicitly allows GPTBot, ClaudeBot, PerplexityBot
- `/llms.txt` — plain-English business summary for AI crawlers
- Branded `/404` page

---

## 5. Homepage structure (the conversion engine)

Mobile-first layout (where 70%+ of local searches happen). Blocks, top-to-bottom:

1. **Nav** — Logo (existing brand image) on white, hamburger menu
2. **Hero** — Deep blue gradient background. Pill badge: "Open now · closes 11 PM" (computed live from current time). Headline: "Brighton's *cleanest* laundromat." Subhead: "Brand-new card-operated machines. No quarters, no hassle. Free Wi-Fi and plenty of family-size washers." Primary CTA (red pill): "Get Directions →". Secondary link: "Pricing"
3. **Why us** — 5 vertical list rows with outline Lucide-style SVG icons:
   - **Start machines from your phone** — Download our app (CCI/FasCard), tap to start, walk in when it's done
   - Card, Apple Pay, or loyalty card — No quarters, no hunting for change. **Cash welcome too:** load it onto a loyalty card at our touchscreen kiosk
   - Spotless, every day — We clean floors, folding tables, machines daily
   - Free Wi-Fi & comfy seating — TV, fast Wi-Fi, clean place to work
   - 10% cashback rewards — Every dollar earns toward your next wash
4. **Photo strip** — Full-bleed, asymmetric (middle photo is wider) — owner photos
5. **Pricing teaser** — Top 4 prices visible, link to `/pricing` for full table
6. **Reviews** — Google rating aggregate ("4.8 ★ 217 reviews"), 2 featured review cards (pulled from Google Places API)
7. **Location** — Embedded map, address, hours, "Open in Maps" CTA (uses platform-native maps app)
8. **Footer** — Logo on white pill against navy background, NAP, links column

---

## 6. Visual system

### Color tokens
```
--brand-blue:        #2864A0  // primary, structural
--brand-blue-deep:   #1A4677  // hover states
--brand-blue-darker: #0F2A4A  // hero gradient, body text
--brand-red:         #C80014  // primary action (CTAs, accents)
--cream:             #FAFAF7  // quiet section backgrounds
--line:              #E5E5DD  // borders, dividers
```

**Usage rule:** Blue = structure (headings, body, hero, footer). Red = action (CTAs, accents, links, map pin). Cream = quiet section backgrounds. Never red on blue or blue on red as text — always against white/cream.

### Typography (Inter + Instrument Serif, both self-hosted)
```
h1   48 / 700 / -3.5% tracking
h2   30 / 700 / -2.5% tracking
h3   20 / 600
h4   16 / 600
body 15 / 400 / 1.6 leading
sm   13 / 400
lbl  11 / 700 / +20% tracking (uppercase eyebrows)
mono 14 / 400 (ui-monospace stack, for prices)
```

Italic accents (e.g., the word "*cleanest*" in the hero) use **Instrument Serif** italic 400. Both fonts shipped as woff2 variable fonts subset to Latin — total font payload < 60KB.

### Spacing scale (4px base)
`space-1` 4px, `space-2` 8px, `space-3` 12px, `space-4` 16px, `space-6` 24px, `space-8` 32px, `space-12` 48px, `space-16` 64px, `space-24` 96px. Every padding/margin/gap on the site uses one of these values.

### Component patterns
- **Buttons:** Primary (red pill, white text, soft shadow) / Secondary (white pill, blue outline, blue text) / Ghost (transparent, blue text, "→" suffix)
- **Status badges:** Open-now (green dot + green text on green tint), Info (blue tint), Warn (yellow tint), Red (red tint)
- **Form fields:** Label + input/textarea + help text. 1.5px border `--line`, focus border `--brand-blue`, 10px radius
- **Cards:** White bg, 1px `--line` border, 12px radius, 20px padding

---

## 7. SEO architecture

### Layer 1 — Technical foundation (Core Web Vitals targets)
| Metric | Target | Wix baseline |
|---|---|---|
| LCP (Largest Contentful Paint) | < 1.2s | ~3–4s |
| INP (Interaction to Next Paint) | < 100ms | ~300ms+ |
| CLS (Cumulative Layout Shift) | < 0.05 | ~0.15+ |
| TBT (Total Blocking Time) | 0ms | ~500ms+ |

### Layer 2 — Schema.org structured data (JSON-LD)
Each page injects appropriate schema:
- **Homepage:** `Laundry` (LocalBusiness subtype) with `name`, `image[]`, `address`, `geo`, `openingHoursSpecification`, `priceRange`, `paymentAccepted`, `aggregateRating`
- **FAQ page:** `FAQPage` with `Question`/`Answer` pairs (wins "People also ask" boxes)
- **Blog posts:** `Article` with `author`, `datePublished`, `image`
- **All pages:** `BreadcrumbList` for nav hierarchy

### Layer 3 — Meta tags
Every page has hand-tuned `<title>` and `<meta description>`. Template patterns:
- Homepage: `"Laundromat in Brighton, MA · Open 6am–11pm Daily · The Found Sock"`
- Service pages: `"[Topic] in Brighton, MA — [benefit]"`
- Blog: `"[How-to title] (Without [common mistake])"` + location anchor in description

OG/Twitter card tags on every page for social previews.

### Layer 4 — Keyword strategy (3 clusters)

1. **Local intent** (homepage + /area pages) — *laundromat brighton ma, laundromat near me, brighton laundromat, allston laundromat, laundromat 02135, card laundromat boston, no coin laundromat*
2. **Service intent** (pricing/visit/app) — *laundromat prices brighton, apple pay laundromat, **cash laundromat brighton, laundromat that takes cash near me, laundromat app brighton, start laundry from phone, fascard laundromat boston, see available washers brighton, laundromat with notification brighton, laundromat machine availability app**, family size washer brighton, 45lb washer near me, free wifi laundromat*
3. **Informational** (blog) — *how to wash down comforter, remove red wine stain, wash blanket laundromat, how many quarters laundromat, comforter washer size, laundromat etiquette*

### Layer 5 — Local SEO + AI search readiness
- **NAP consistency** across site, GMB, Yelp, Bing Places, Apple Maps, BBB
- **GMB optimization** — categories, services, hours, photos, weekly posts
- **Reviews pulled live** from GMB onto site (Google Places API at build time)
- **Local citations** built on Yelp, Apple Maps, Bing Places, Yellow Pages, BBB
- **`llms.txt` published** with plain-English business summary
- **`robots.txt` allows** `GPTBot`, `ClaudeBot`, `PerplexityBot` (many sites accidentally block these)
- **Passage-level citability** — short factual paragraphs AI can quote
- **FAQ formatted as Q&A** — AI's preferred citation format

---

## 8. Tech architecture

### Stack
- **Edge / hosting:** Cloudflare Pages (free, ~300 global PoPs)
- **Domain / DNS:** Cloudflare Registrar (~$10/yr) + Cloudflare DNS + free DNSSEC + free SSL
- **Framework:** Astro 5 (static-site generator, zero JS by default)
- **Styles:** Tailwind CSS v4 (utility-first, scoped, ~8KB final CSS)
- **Content:** Markdown + Astro Content Collections (type-safe, validated at build)
- **Images:** Astro `<Image>` component + Cloudflare Image Resizing (auto WebP/AVIF, lazy loading)
- **CI/CD:** GitHub → Cloudflare Pages (webhook on push to main, ~30s rebuild)
- **Analytics:** Cloudflare Web Analytics (cookie-free, GDPR-friendly, free)

### Repo structure
```
foundsocklaundromat/
├── src/
│   ├── pages/
│   │   ├── index.astro            # Home
│   │   ├── pricing.astro
│   │   ├── visit.astro
│   │   ├── about.astro
│   │   ├── loyalty.astro
│   │   ├── gallery.astro
│   │   ├── faq.astro
│   │   ├── contact.astro
│   │   ├── report-issue.astro
│   │   ├── blog/
│   │   │   ├── index.astro        # Blog listing
│   │   │   └── [slug].astro       # Dynamic blog post route
│   │   └── area/
│   │       └── [neighborhood].astro
│   ├── components/
│   │   ├── Hero.astro
│   │   ├── PriceTable.astro
│   │   ├── ReviewCard.astro
│   │   └── SEO.astro              # Meta + schema injector
│   ├── content/
│   │   ├── blog/                  # AI-drafted markdown posts
│   │   └── areas/                 # Neighborhood md files
│   ├── data/
│   │   ├── business.json          # NAP, hours, social — single source of truth
│   │   ├── pricing.json
│   │   └── reviews.json           # Generated at build time
│   └── styles/
│       └── global.css
├── public/
│   ├── photos/                    # Store photos
│   ├── robots.txt
│   ├── llms.txt
│   └── favicon.svg
├── scripts/
│   └── fetch-google-reviews.mjs   # Pre-build script
├── astro.config.mjs
└── package.json
```

**Single source of truth:** `business.json` contains NAP/hours/phone — every page reads from it. Update once → updates schema, footer, hero badge, etc.

### Performance budget (homepage)
| Asset | Budget | Wix current |
|---|---|---|
| HTML | < 50 KB | ~350 KB |
| CSS | < 15 KB | ~800 KB |
| JS | < 10 KB | ~2,400 KB |
| Fonts | < 60 KB | ~250 KB |
| Hero image (LCP) | < 120 KB | ~800 KB |
| **Total page weight** | **< 300 KB** | **~4,500 KB** |

≈ 15× lighter than current Wix site.

### External integrations (only 3)

1. **Freshdesk (free tier)** — Customer support inbox
   - Custom form on `/report-issue` and `/contact` POSTs to Freshdesk's REST API
   - Owner gets push notification in Freshdesk mobile app
   - Replies sent from `support@foundsocklaundromat.com` alias — customer never sees owner's personal email/phone
2. **Google Places API (free tier)** — Reviews + aggregate rating
   - Pre-build script `scripts/fetch-google-reviews.mjs` calls Place Details endpoint
   - Writes latest 5 reviews + aggregate to `src/data/reviews.json`
   - Static HTML rebakes weekly via Cloudflare Worker cron trigger
   - Free tier covers ~100K requests/month; we use ~52/year
3. **Google Maps Embed (free)** — Map on homepage + /visit
   - Lazy-loaded iframe (doesn't impact LCP)
   - "Open in Maps" button uses platform-native `maps:` URL scheme

### Security & reliability
- Free SSL/TLS via Cloudflare, HTTPS everywhere, auto-renewed
- Free DDoS protection
- HSTS + security headers (CSP, X-Frame-Options, Referrer-Policy) via `public/_headers`
- 99.99%+ uptime — Cloudflare edge serves cached site even if build environment is down
- Backups built into git — every commit is a recoverable snapshot
- Preview deploys per branch

### Cost summary
- Hosting / DNS / SSL / Analytics / Freshdesk / Google APIs: **$0/month**
- Domain renewal: **~$10/year** (Cloudflare Registrar at-cost)
- **Savings vs Wix (~$23/mo = $276/yr): ~$266/yr forever**

---

## 9. Migration plan

5 phases over ~4–5 weeks. **Zero downtime** — Wix stays live until cutover.

### Phase 0 — Preparation (~3 days, no risk)
- [ ] Verify Wix domain is older than 60 days and has no transfer lock (owner)
- [ ] Create Cloudflare account (owner)
- [ ] Create GitHub account if needed (owner)
- [ ] Audit current Wix URLs, build redirect map (me)
- [ ] Set up Freshdesk free account + `support@foundsocklaundromat.com` alias + install mobile app (me with owner's login)
- [ ] Collect assets: photos, Google Place ID, GMB ownership confirmation (me with owner)

### Phase 1 — Build on temporary URL (2–3 weeks, no risk, Wix untouched)
- [ ] Scaffold Astro project, push to GitHub, deploy to `foundsock-new.pages.dev`
- [ ] Build all 11 pages per design
- [ ] Embed Freshdesk form on `/report-issue` and `/contact`, test end-to-end
- [ ] Write 8 launch blog posts targeting keyword clusters (4 informational + 4 local/Brighton-specific)
- [ ] Build per-neighborhood `/area/*` pages
- [ ] Run full Lighthouse audit — confirm 100/100 mobile
- [ ] Owner reviews on phone, requests changes, iterate

### Phase 2 — Domain transfer (5–7 days, medium risk, Wix still live)
- [ ] Owner unlocks domain in Wix
- [ ] Owner requests EPP/auth code from Wix, forwards to me
- [ ] Owner disables domain privacy in Wix (ICANN requirement)
- [ ] I initiate transfer at Cloudflare Registrar (~$10)
- [ ] Owner approves transfer email from Wix to skip 5-day wait
- [ ] Transfer completes in 12–72h. **Nameservers still point at Wix — Wix site still live**

### Phase 3 — Cutover (1 day, the one-shot, scheduled for low-traffic window like 10pm Sunday)
- [ ] Point `foundsocklaundromat.com` DNS to Cloudflare Pages (A/AAAA records)
- [ ] Verify new site loads on `www.` and root, mobile + desktop, incognito
- [ ] Activate 301 redirects:
  | Old (Wix) | New |
  |---|---|
  | `/services` | `/visit` |
  | `/location` | `/visit` |
  | `/loyalty-program` | `/loyalty` |
  | `/report-an-issue` | `/report-issue` |
  | `/blog/[old-slug]` | `/blog/[new-slug]` (case-by-case) |
  | (anything else) | `/` |
- [ ] Submit new `sitemap.xml` to Google Search Console + Bing Webmaster Tools
- [ ] Update Google Business Profile website URL (same domain, ensures re-crawl)
- [ ] End-to-end test of Freshdesk form on live URL
- [ ] Owner verifies everything on their phone

**Rollback plan:** If anything breaks badly, change DNS back to Wix IPs (kept on file). Restored within ~5 minutes. We do not cancel Wix until Phase 4 confirms stability.

### Phase 4 — Monitor & cleanup (30 days, low risk)
- [ ] Monitor Google Search Console daily for first week, weekly after
- [ ] Watch for crawl errors, 404 spikes, ranking dips (expect 3–5 day dip during re-crawl, then recovery)
- [ ] After 14 days of stable operation → owner cancels Wix subscription
- [ ] Set up weekly content cadence: I draft 1–2 blog posts/week, owner approves, I publish
- [ ] Three-month checkpoint: review rankings, traffic, GMB call volume

---

## 10. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Wix makes domain transfer difficult | Medium | Low (just annoying) | Document each step, screenshare during the transfer process |
| Google rankings drop during cutover | Medium | Medium | 301 redirects from old URLs, sitemap resubmission, monitor Search Console daily |
| Customer can't find a moved page | Medium | Low | Comprehensive 301 map; catch-all redirect to homepage; branded 404 page with links |
| Freshdesk form is unreliable | Low | High (lost customer issues) | Test end-to-end before cutover; also expose `support@` email as a fallback |
| Google Reviews API quota exceeded | Very Low | Low | Free tier is 100K/month; we use ~52/year. Cache aggressively |
| Site is broken at moment of DNS flip | Low | High | Cutover at 10pm Sunday (lowest traffic); rollback plan tested before DNS change |
| Owner needs to publish content while I'm unavailable | Low | Low | Plain markdown in git is easy to inspect; can add Decap CMS later |

---

## 11. Open questions / decisions for the user

Before kicking off implementation, please confirm or answer:

1. **Phone number** — current Wix site doesn't show a phone. Do you want one displayed (e.g., for the schema markup and "Tap to call" on mobile)? Or keep contact form-only?
2. **Google Reviews count** — design currently mocks "4.8 ★ 217 reviews". I'll pull the real numbers via Places API once we have your Place ID. Want to share it now or during Phase 0?
3. **Neighborhood `/area/*` pages** — proposed list: Allston, Oak Square, Cleveland Circle, Brookline Village, Brighton Center. Any to add/remove?
4. **About page content** — do you want to write the "story" section yourself, or have me draft it from what's on the current site + a brief conversation?
5. **Blog post topics for launch** — 8 posts (4 informational like "how to wash a down comforter" + 4 local like "best laundromats in Allston"). I'll propose the exact list at start of Phase 1, but if you have must-include topics ("Why we don't take coins", "What to bring for first-time visitors"), flag them now.

6. **Wix cost confirmation** — I've estimated ~$23/mo for your current Wix plan. If you're on a different tier (Wix has plans from $17 to $59+/mo), the savings number changes but the recommendation doesn't.

7. **Dedicated `/app` page or fold into `/loyalty`?** — The CCI/FasCard app is a big feature (start machines from phone, reload card from phone). A dedicated `/app` page captures different SEO traffic ("laundromat app brighton") and has its own conversion goal (download). Alternative: keep one combined `/loyalty` page that covers both. I lean dedicated; what do you prefer?

8. **App branding** — The app is officially branded "FasCard" by CCI. Is it labeled that way in your kiosk/signage, or do you ever call it something else with customers? Want the site to say "the FasCard app" or "our app" or "the Found Sock app powered by FasCard"?

9. ~~**App Store + Play Store links**~~ — Resolved. iOS: `apps.apple.com/us/app/fascard/id971906763` · Android: `play.google.com/store/apps/details?id=com.fascard.mobile`. Confirmed via search.

10. **App headline copy** — proposed: "Start your laundry from your phone." Alternatives I'm considering: "Skip the wait. Start a machine from anywhere." / "See open machines before you come in." / "Get notified when your laundry's done." Which angle do you want to lead with?

---

## 12. Success criteria

The project is successful when:

- [ ] New site fully replaces Wix, foundsocklaundromat.com points to Cloudflare Pages
- [ ] Lighthouse mobile score 95+ on all 11 page types (homepage, pricing, blog post, area page, etc.)
- [ ] Google Search Console shows no significant ranking drop 30 days post-launch
- [ ] Freshdesk receives test ticket from a non-owner phone, owner gets push notification, can reply
- [ ] Wix subscription canceled
- [ ] Site builds and deploys automatically from `main` branch push in < 60 seconds
- [ ] Total monthly cost is $0 (excluding ~$10/yr domain)
