# SEO Action Plan — The Found Sock Laundromat
**Date:** 2026-05-16
**Current SEO Health Score:** 76/100
**Projected after Critical+High fixes:** ~93/100

Fix items in order. Each has the estimated effort, the exact file(s), and the change to make. Items are independent unless noted.

---

## PHASE 1 — Critical (do before launch / domain migration)

### A1. Remove placeholder Google reviews from production homepage
**Effort:** 15 min
**Files:**
- `/Users/eliranderei/Found Sock Laundromat/src/data/reviews.json`
- `/Users/eliranderei/Found Sock Laundromat/src/components/ReviewsBlock.astro`

**Why:** `dist/client/index.html` currently shows two 5-star reviews with body text *"Real reviews will be fetched from Google Places API at build time"* and *"Will be replaced once owner provides Google Place ID"* attributed to "Placeholder" and "Placeholder 2". Catastrophic trust hit.

**Options (pick one):**
1. **Best:** Wire up Google Places API at build time using the existing `business.json:30` `googlePlaceId: "ChIJx5gWvrR544kRRoSB7J-59qw"` and `PUBLIC_MAPS_API_KEY` env var. Fetch top 3 reviews server-side and populate `reviews.json`.
2. **Fast:** Manually copy 3 real Google reviews into `reviews.json` and update each entry's `author`, `text`, `rating`, `date` fields.
3. **Quickest stopgap:** In `ReviewsBlock.astro`, filter out placeholder entries:
   ```astro
   const visibleReviews = reviews.recent.filter(r => !r.author.startsWith('Placeholder'));
   ```
   And hide the entire section if `visibleReviews.length === 0`.

---

### A2. Add a phone number
**Effort:** 1 min (after you decide on a number)
**File:** `/Users/eliranderei/Found Sock Laundromat/src/data/business.json:19`

**Current:** `"phone": null`
**Change to:** `"phone": "+1-617-XXX-XXXX"` (E.164 format)

**Why:** Auto-flows into `LocalBusiness` JSON-LD `telephone`, contact page, footer, llms.txt (after A14). Biggest single trust signal for a local business. Without it, Bing Copilot won't cite you and AI Overviews deprioritize.

**Also update:** Add the same number to `public/llms.txt` Quick Facts section.

If you don't have a dedicated business line, set up Google Voice (free) or a Twilio number (~$1/month) that forwards to your phone.

---

### A3. Fix trailing-slash inconsistency
**Effort:** 15 min
**Files:**
- `/Users/eliranderei/Found Sock Laundromat/astro.config.mjs`
- `/Users/eliranderei/Found Sock Laundromat/src/components/Header.astro:3-9`
- `/Users/eliranderei/Found Sock Laundromat/src/components/Footer.astro:22-40`
- Plus any inline link in `src/pages/*.astro` that points to internal URLs without trailing slash

**Change 1:** In `astro.config.mjs`, add `trailingSlash: 'always'` to the default config export.

**Change 2:** Update Header.astro navItems to:
```ts
const navItems = [
  { href: '/visit/', label: 'Visit' },
  { href: '/pricing/', label: 'Pricing' },
  { href: '/loyalty/', label: 'Loyalty' },
  { href: '/app/', label: 'App' },
  { href: '/blog/', label: 'Blog' },
  { href: '/faq/', label: 'FAQ' },
  { href: '/report-issue/', label: 'Help' },
];
```

**Change 3:** Update Footer.astro link `href` values to add trailing slash. Same for any `<a href="/contact">` etc. in page components.

**Why:** Built canonicals + sitemap all use trailing slash. Cloudflare static-asset workers issue 301 on non-slashed paths. Every nav click = redirect = wasted crawl + ~100ms latency hit.

---

### A4. Fix Article + Breadcrumb schema URLs to use trailing slash
**Effort:** 30 min
**Files:**
- `/Users/eliranderei/Found Sock Laundromat/src/lib/schema.ts:86`
- All `generateBreadcrumbSchema` callers: `src/pages/blog/[...slug].astro:48-50`, `src/pages/blog/index.astro:25-26`, `src/pages/faq.astro:9-10`, `src/pages/loyalty.astro:10-11`, `src/pages/pricing.astro:10-11`, `src/pages/visit.astro:10-11`, `src/pages/contact.astro:8-9`, `src/pages/gallery.astro:6-8`, `src/pages/about.astro:6-8`, `src/pages/app.astro:7-9`, `src/pages/report-issue.astro:7-9`, `src/pages/area/[neighborhood].astro:17-18`

**Change 1:** `schema.ts:86` →
```ts
url: `${baseUrl}/blog/${article.slug}/`,
```

**Change 2:** Every breadcrumb caller — append trailing slash to each `url`. Example for `src/pages/visit.astro:10-11`:
```ts
{ name: 'Visit', url: 'https://www.foundsocklaundromat.com/visit/' },
```

**Why:** Mismatched canonical/schema URLs trigger "Invalid URL in field 'url'" warnings and can skip Article rich-result eligibility.

---

### A5. Un-orphan the 5 area pages
**Effort:** 15 min
**Files:**
- `/Users/eliranderei/Found Sock Laundromat/src/components/Footer.astro`
- `/Users/eliranderei/Found Sock Laundromat/src/pages/index.astro` (optional, add to home too)

**Change:** Add a "Service area" column to the footer:
```astro
<div>
  <h3 class="text-xs uppercase tracking-widest opacity-55 font-semibold mb-3">Service area</h3>
  <ul class="space-y-2 opacity-75">
    <li><a href="/area/allston/">Allston</a></li>
    <li><a href="/area/brighton-center/">Brighton Center</a></li>
    <li><a href="/area/brookline-village/">Brookline Village</a></li>
    <li><a href="/area/cleveland-circle/">Cleveland Circle</a></li>
    <li><a href="/area/oak-square/">Oak Square</a></li>
  </ul>
</div>
```

**Why:** All 5 `/area/*` pages currently have ZERO internal links. They're in the sitemap but unreachable through navigation, so Google rarely crawls them and they can't rank.

---

### A6. Remove `public/photos/wix-source/` and `public/photos/gmb-source/` (33 MB)
**Effort:** 1 min
**Command:**
```bash
cd "/Users/eliranderei/Found Sock Laundromat"
mkdir -p _archive
mv public/photos/wix-source _archive/
mv public/photos/gmb-source _archive/
echo "_archive/" >> .gitignore
```

**Why:** These directories total 33 MB, are never referenced in any built HTML, but get copied into `dist/client/photos/` on every build and deployed to Cloudflare. Slows deploys, wastes storage, and theoretically indexable if anyone discovers the path.

---

### A7. Fix area-page content contradictions
**Effort:** 5 min
**Files:**
- `/Users/eliranderei/Found Sock Laundromat/src/content/areas/brighton-center.md:13`
- `/Users/eliranderei/Found Sock Laundromat/src/content/areas/allston.md:25-26`

**brighton-center.md line 13** —
- Current: `- **Walk over, drop off, walk home.** Or wait with free Wi-Fi and a TV.`
- Change to: `- **Walk over, start a load, walk home.** Use the FasCard app to get notified when it's done — or wait with free Wi-Fi and a TV.`

**allston.md line 25** —
- Current: `- Use a 45 lb washer to do a full month of laundry in one cycle. Way cheaper per pound than washing weekly.`
- Change to: `- A 45 lb washer handles 2-3 weeks of regular laundry in one cycle — much cheaper per pound than weekly small loads.`

**allston.md line 26** —
- Current: `- Sunday mornings (9-11 AM) and Wednesday afternoons are our quietest times.`
- Change to: `- Tuesday and Wednesday mornings are our quietest times. Avoid Sunday 11 AM-4 PM (peak hours).`

**Why:** "Drop off" implies wash-and-fold service (you don't offer it). The "month of laundry in one cycle" advice contradicts your overload warnings in `laundromat-etiquette.md`. The Allston quiet-times tip contradicts your own `best-time-to-visit.md` table.

---

## PHASE 2 — High Priority (within 1 week)

### B1. Migrate hero + gallery images to `astro:assets <Picture>` (AVIF/WebP + responsive srcset)
**Effort:** 2-3 hours
**Files:**
- `/Users/eliranderei/Found Sock Laundromat/astro.config.mjs` (add image config)
- `/Users/eliranderei/Found Sock Laundromat/src/components/Hero.astro:35`
- `/Users/eliranderei/Found Sock Laundromat/src/components/PhotoStrip.astro`
- `/Users/eliranderei/Found Sock Laundromat/src/pages/gallery.astro:24`
- Move hero photos from `public/photos/*.jpg` → `src/assets/photos/*.jpg`

**Change 1:** Update `astro.config.mjs`:
```js
export default defineConfig({
  // ...
  image: {
    service: { entrypoint: 'astro/assets/services/sharp' },
  },
});
```

**Change 2:** Replace `<img>` with `<Picture>`:
```astro
---
import { Picture } from 'astro:assets';
import storefront from '../assets/photos/storefront.jpg';
---
<Picture src={storefront} formats={['avif', 'webp']}
  widths={[400, 800, 1200]} sizes="(max-width: 768px) 100vw, 50vw"
  alt="..." loading="eager" fetchpriority="high" />
```

**Why:** Cuts homepage LCP image from 328 KB → ~25 KB. Drops total gallery payload from 5.4 MB → ~700 KB. Single biggest CWV win available.

---

### B2. Subset Inter font to Latin + the punctuation actually used
**Effort:** 1 hour
**Files:**
- `/Users/eliranderei/Found Sock Laundromat/public/fonts/Inter.woff2`
- `/Users/eliranderei/Found Sock Laundromat/src/styles/global.css:5` (consider narrowing weight range to 400-700)

**Command:**
```bash
cd "/Users/eliranderei/Found Sock Laundromat/public/fonts"
npx glyphhanger --formats=woff2 --subset=Inter.woff2 \
  --whitelist=U+0000-00FF,U+2013,U+2014,U+2018-201A,U+201C-201E,U+2022,U+2026,U+00B7
mv Inter-subset.woff2 Inter.woff2
```

Also: optionally narrow the `@font-face` weight range from `font-weight: 100 900` to `font-weight: 400 700` since you don't use the extreme weights.

**Why:** Inter.woff2 is currently 344 KB covering all weights + Latin-Ext + Cyrillic. Site is English-only with ~4 weights. Subsetting → ~50 KB. Saves 290 KB on every cold page load.

---

### B3. Add `<lastmod>` to sitemap URLs
**Effort:** 30 min
**Files:**
- `/Users/eliranderei/Found Sock Laundromat/astro.config.mjs`

**Change:** Configure `@astrojs/sitemap` to derive `lastmod` from content collection frontmatter:
```js
import sitemap from '@astrojs/sitemap';

sitemap({
  serialize: async (item) => {
    // Default lastmod = today
    item.lastmod = new Date().toISOString();
    // For blog posts, use the updatedAt or publishedAt from frontmatter
    if (item.url.includes('/blog/') && !item.url.endsWith('/blog/')) {
      // load the post by slug and override lastmod
    }
    return item;
  },
}),
```

A simpler version: set a global `lastmod: new Date()` — better than nothing.

**Why:** Google uses `lastmod` as a recrawl hint. Without it, freshness signals come only from internal links or content-hash diffs (slower).

---

### B4. Add `dateModified` + switch `Article` → `BlogPosting` + add named author + `publisher` + `ImageObject`
**Effort:** 1 hour
**Files:**
- `/Users/eliranderei/Found Sock Laundromat/src/lib/schema.ts:80-94`
- `/Users/eliranderei/Found Sock Laundromat/src/pages/blog/[...slug].astro:39-46`
- `/Users/eliranderei/Found Sock Laundromat/src/lib/schema.test.ts:55-68`

**Change:** Replace `generateArticleSchema`:
```ts
export type ArticleInput = {
  title: string;
  description: string;
  slug: string;
  datePublished: string;
  dateModified?: string;
  author: string;
  imageUrl?: string;
};

export function generateArticleSchema(article: ArticleInput) {
  const url = `${baseUrl}/blog/${article.slug}/`;
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    headline: article.title,
    description: article.description,
    url,
    datePublished: article.datePublished,
    ...(article.dateModified && article.dateModified !== article.datePublished
      ? { dateModified: article.dateModified } : {}),
    author: {
      '@type': 'Person',
      name: article.author,
      url: `${baseUrl}/about/`,
    },
    publisher: {
      '@type': 'Organization',
      name: 'The Found Sock Laundromat',
      url: baseUrl,
      logo: {
        '@type': 'ImageObject',
        url: `${baseUrl}/photos/og/default.jpg`,
        width: 1200, height: 630,
      },
    },
    image: {
      '@type': 'ImageObject',
      url: article.imageUrl ?? `${baseUrl}/photos/og/default.jpg`,
      width: 1200, height: 630,
    },
  };
}
```

In `[...slug].astro:39-46`:
```ts
const articleSchema = generateArticleSchema({
  title: post.data.title,
  description: post.data.description,
  slug,
  datePublished: post.data.publishedAt.toISOString().slice(0, 10),
  dateModified: post.data.updatedAt?.toISOString().slice(0, 10),
  author: 'Eliran Derei',  // or whichever name you want bylined
  imageUrl: post.data.image,
});
```

Update `schema.test.ts:64` to `expect(s['@type']).toBe('BlogPosting')`.

**Why:** `BlogPosting` is more specific than `Article`. `dateModified` is a freshness signal. Named `Person` author boosts E-E-A-T per Sept 2025 QRG. `publisher` and `ImageObject` improve Article rich-card eligibility.

---

### B5. Enrich `Laundry` schema with sameAs, hasMap, areaServed, amenityFeature
**Effort:** 30 min
**Files:**
- `/Users/eliranderei/Found Sock Laundromat/src/data/business.json` (add social URLs)
- `/Users/eliranderei/Found Sock Laundromat/src/lib/schema.ts:5-41`

**business.json — add:**
```json
"social": {
  "googleBusinessUrl": "https://www.google.com/maps/place/?q=place_id:ChIJx5gWvrR544kRRoSB7J-59qw",
  "yelp": null,        // fill in if you have these
  "facebook": null,
  "instagram": null
}
```

**schema.ts:** Add to the `Laundry` return object:
```ts
'@id': `${baseUrl}/#laundry`,
hasMap: `https://www.google.com/maps/place/?q=place_id:${b.googlePlaceId}`,
sameAs: [
  `https://www.google.com/maps/place/?q=place_id:${b.googlePlaceId}`,
  ...(b.social.yelp ? [b.social.yelp] : []),
  ...(b.social.facebook ? [b.social.facebook] : []),
  ...(b.social.instagram ? [b.social.instagram] : []),
],
areaServed: [
  { '@type': 'City', name: 'Brighton, MA' },
  { '@type': 'City', name: 'Allston, MA' },
  { '@type': 'City', name: 'Brookline, MA' },
  { '@type': 'Neighborhood', name: 'Cleveland Circle' },
  { '@type': 'Neighborhood', name: 'Oak Square' },
],
currenciesAccepted: 'USD',
amenityFeature: [
  { '@type': 'LocationFeatureSpecification', name: 'Free Wi-Fi', value: true },
  { '@type': 'LocationFeatureSpecification', name: 'Self-service', value: true },
  { '@type': 'LocationFeatureSpecification', name: 'Card-operated machines', value: true },
  { '@type': 'LocationFeatureSpecification', name: 'Mobile app (FasCard)', value: true },
  { '@type': 'LocationFeatureSpecification', name: 'Folding tables', value: true },
  { '@type': 'LocationFeatureSpecification', name: 'TV / seating', value: true },
  { '@type': 'LocationFeatureSpecification', name: 'Family-size washers (up to 45 lb)', value: true },
],
knowsLanguage: ['en'],
slogan: b.tagline,
```

**Why:** `sameAs` lets Google reconcile your site with your Google Business Profile. `hasMap` qualifies you for map pack. `areaServed` matches local-intent queries. `amenityFeature` differentiates you in the local pack.

---

### B6. Add homepage neighborhood mentions
**Effort:** 15 min
**File:** `/Users/eliranderei/Found Sock Laundromat/src/pages/index.astro`

**Change:** Add a "Service area" line above the fold or in the hero subhead area:
> "Serving Brighton, Allston, Brookline, Cleveland Circle, Oak Square, and the BC and BU student communities."

Place this both above-the-fold AND in a structured `<ul>` block somewhere on the page. Internal-link to each `/area/*` page.

**Why:** Homepage currently mentions "Brighton" 20 times and zero of: Allston, Brookline, Cleveland Circle, Oak Square, BC, BU. For queries like "laundromat in Allston" or "laundromat near BU", AI engines can't surface Found Sock because the homepage doesn't mention these.

---

### B7. Verify TV/seating physical reality, OR remove the claims
**Effort:** 5 min (verification) or 10 min (copy edit)
**Files (if claims are accurate):** No change needed.
**Files (if claims are wrong):**
- `src/components/WhyUs.astro:21`
- `src/data/faqs.json:24`
- `src/content/areas/cleveland-circle.md:16`
- `src/content/areas/brighton-center.md:13`
- `src/content/blog/how-to-use-coinless-payment.md:55`

**Why:** Five different pages claim a TV is on-premises. If physically not true, that's a QRG "Lowest" page-quality trigger. Verify in person, then either leave the claims or update all 5 files.

---

### B8. Add OAI-SearchBot + Applebot-Extended to robots.txt
**Effort:** 1 min
**File:** `/Users/eliranderei/Found Sock Laundromat/public/robots.txt`

**Add:**
```
User-agent: OAI-SearchBot
Allow: /

User-agent: Applebot-Extended
Allow: /
```

**Why:** Emerging AI search bots (ChatGPT browse, Apple Intelligence). Currently covered by your `User-agent: *` Allow rule, but explicit listing is the convention these crawlers look for.

---

### B9. Add CSP `connect-src` entries for future Places API
**Effort:** 1 min
**File:** `/Users/eliranderei/Found Sock Laundromat/public/_headers:7`

**Change:** Update the CSP `connect-src` directive from `'self'` to:
```
connect-src 'self' https://maps.googleapis.com https://places.googleapis.com
```
And add `https://lh3.googleusercontent.com` to `img-src` for Google review photos:
```
img-src 'self' data: https://lh3.googleusercontent.com https://maps.gstatic.com
```

**Why:** Pre-emptively unblock the Places API integration we discussed for A1.

---

## PHASE 3 — Medium (within 1 month)

### C1. Trim long blog post titles to ≤ 50 chars
12/16 blog titles are 72-98 chars. Google truncates at ~60 (plus the ` | Found Sock` auto-append adds 14). Shorten each post's `title:` in frontmatter.

### C2. Trim home page meta description to ≤ 160 chars
Currently 182. `src/pages/index.astro:17`.

### C3. Add FAQPage schema to /loyalty/, /pricing/, /visit/, /app/
These pages have Q&A-shaped content. Refactor each page's Q&A list into a `faqs` array and call `generateFaqSchema()`.

### C4. Add Blog/ItemList schema to /blog/ index
List each post by URL, title, datePublished.

### C5. Use Astro.site instead of hard-coded baseUrl in schema.ts
So preview deploys don't ship prod URLs.

### C6. Replace pricing.astro:24 image alt from "25 lb" → "30 lb"
That size doesn't exist. Your sizes are 20/30/35/45.

### C7. Add OfferCatalog + Service schemas
On `/pricing` and `/loyalty`. See full-audit-report Schema H2 for the exact JSON-LD.

### C8. Add global Organization + WebSite schema
In SEO.astro. Enables SiteLinks Search Box (when /search exists) and builds connected entity graph.

### C9. Enrich llms.txt
Add `## Service area` section listing all 5 neighborhoods. Add `## Featured guides` linking to blog posts with one-line summaries. Add phone number once set. Consider creating `/llms-full.txt` (long-form concatenation of key page content).

### C10. Extend each area page to 400-500 words
Add genuinely neighborhood-specific content. Examples:
- **Allston:** BU dorm proximity, Sep 1 move-in week, 57 bus, Comm Ave
- **Cleveland Circle:** BC families, 57 bus stop schedule, weekend BC traffic
- **Brookline Village:** specific apartment buildings, T stops
- **Oak Square:** parking advantage over Brighton Center
- **Brighton Center:** Washington Square, St. Elizabeth's, foot traffic

Add 1-2 customer scenarios per page ("Sunday after the BC game, we typically see...").

### C11. Extend about page to 400-500 words
Add owner first name, founding story, what's changed since 2015, photos with people.

### C12. Suspend OpenNowBadge setInterval on visibilitychange
`src/components/OpenNowBadge.astro:53`. Use Page Visibility API to free bfcache eligibility.

### C13. Replace report-issue time `<select>` with `<input type="time" step="900">`
`src/components/IssueForm.astro`. Saves 7 KB HTML, better INP on iOS.

### C14. Convert logo PNG → SVG
`public/brand/logo-horizontal.png` (25 KB) → SVG (~1-2 KB).

### C15. Sweep blog posts for missing internal links
Add at least one link to `/pricing`, one to `/loyalty` or `/app`, one to `/visit` in each blog post. Especially:
- `loyalty-card-benefits.md` (0 links to /pricing)
- `scratchy-towels-fix.md` (0 to /pricing)
- `how-to-wash-workout-clothes.md` (0 to /pricing, /loyalty, /visit)
- `best-time-to-visit.md` (0 to /pricing)

### C16. Tighten scratchy-towels-fix.md "Fix 4" section
Reduce overlap with `too-much-detergent.md`. Use a 2-sentence summary + an in-text link to that post.

### C17. Tag taxonomy: add 1-2 more granular tags per post
Add tags like `bedding`, `seasonal`, `payment`, `equipment` so related-posts ranking is sharper.

### C18. Soften welcome.md unsubstantiated claims
"100/100 Google mobile speed", "faster than 99% of laundromats". Rewrite per Content M1.

### C19. Demote welcome.md from "featured" position OR retitle it
Currently the newest post → surfaces as "Latest" on /blog. Either backdate it, hide news tag from featured filter, or retitle to something customer-facing.

### C20. Replace "Map coming soon" placeholder on 10 pages
With actual `<iframe>` embed (CSP already allows it).

### C21. Add Person + photo to about page
Owner first name, founding year, "since 2015" prominent.

### C22. Add real testimonial section to homepage
After A1 ships, surface 3 quoted Google reviews with full attribution (name + date).

---

## PHASE 4 — Low (backlog)

- L1. Add IndexNow key file + cron ping for Bing/Yandex/Naver discovery
- L2. Add `aria-current` to active nav link
- L3. Mobile menu toggle should update `aria-expanded`
- L4. Add explicit `width`/`height` to gallery + PhotoStrip `<img>` tags (even with aspect-ratio parent)
- L5. Re-encode `/photos/og/default.jpg` to ≤ 70 KB
- L6. Drop unused XML namespaces from sitemap (news/xhtml/video) — or use the `image:` extension on gallery URLs
- L7. Substantiate or soften "Brighton's cleanest" superlative
- L8. Add aggregateRating once Places API ships and pulls real GMB rating
- L9. Update `paymentAccepted` to ensure all gateway names are listed
- L10. Rename the CSS bundle from "LocationBlock.css" → "global.css" via Vite asset config (cosmetic)

---

## Expected Score Trajectory

| Stage | Estimated Score |
|---|---|
| Today | 76 |
| After Phase 1 (Critical, 1-2 hours of work) | 86 |
| After Phase 2 (High, ~6 hours of work) | 93 |
| After Phase 3 (Medium, ~10 hours of work) | 96 |
| After Phase 4 (Low, polish) | 98 |

The 76→86 jump comes almost entirely from Phase 1 (removing trust-killing fake reviews, adding phone, fixing redirect-on-every-click, un-orphaning area pages, deleting the 33 MB dead images).
