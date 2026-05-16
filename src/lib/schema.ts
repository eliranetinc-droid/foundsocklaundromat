import { getBusiness, getPricing } from './business';

const baseUrl = 'https://www.foundsocklaundromat.com';

/** Stable @id nodes so JSON-LD across pages references the same entities. */
const ORG_ID = `${baseUrl}/#organization`;
const WEBSITE_ID = `${baseUrl}/#website`;
const LAUNDRY_ID = `${baseUrl}/#laundry`;
const LOGO_ID = `${baseUrl}/#logo`;
const OG_DEFAULT = `${baseUrl}/photos/og/default.jpg`;

/** Organization — the legal entity. Referenced by publisher, sameAs, etc. */
export function generateOrganizationSchema() {
  const b = getBusiness();
  const social = b.social as { googleBusinessUrl?: string | null; yelp?: string | null; facebook?: string | null; instagram?: string | null };
  const sameAs: string[] = [];
  if (b.googlePlaceId) sameAs.push(`https://www.google.com/maps/place/?q=place_id:${b.googlePlaceId}`);
  if (social.yelp) sameAs.push(social.yelp);
  if (social.facebook) sameAs.push(social.facebook);
  if (social.instagram) sameAs.push(social.instagram);
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORG_ID,
    name: b.name,
    alternateName: b.shortName,
    url: baseUrl,
    logo: {
      '@type': 'ImageObject',
      '@id': LOGO_ID,
      url: OG_DEFAULT,
      width: 1200,
      height: 630,
    },
    foundingDate: '2015',
    ...(sameAs.length > 0 ? { sameAs } : {}),
  };
}

/** WebSite — connected entity graph. SearchAction omitted until /search exists. */
export function generateWebSiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    url: baseUrl,
    name: 'The Found Sock Laundromat',
    publisher: { '@id': ORG_ID },
    inLanguage: 'en-US',
  };
}

/** Laundry (LocalBusiness subtype) — enriched for local SEO + map pack. */
export function generateLocalBusinessSchema() {
  const b = getBusiness();
  const sameAs: string[] = [];
  if (b.googlePlaceId) sameAs.push(`https://www.google.com/maps/place/?q=place_id:${b.googlePlaceId}`);
  const social = b.social as { yelp?: string | null; facebook?: string | null; instagram?: string | null };
  if (social.yelp) sameAs.push(social.yelp);
  if (social.facebook) sameAs.push(social.facebook);
  if (social.instagram) sameAs.push(social.instagram);
  return {
    '@context': 'https://schema.org',
    '@type': 'Laundry',
    '@id': LAUNDRY_ID,
    name: b.name,
    alternateName: b.shortName,
    description: b.description,
    slogan: b.tagline,
    image: [`${baseUrl}/photos/storefront.jpg`],
    logo: { '@id': LOGO_ID },
    url: baseUrl,
    // Owner intentionally omits phone; all contact via /report-issue
    telephone: b.phone ?? undefined,
    email: b.email,
    address: {
      '@type': 'PostalAddress',
      streetAddress: b.address.streetAddress,
      addressLocality: b.address.addressLocality,
      addressRegion: b.address.addressRegion,
      postalCode: b.address.postalCode,
      addressCountry: b.address.addressCountry,
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: b.geo.latitude,
      longitude: b.geo.longitude,
    },
    ...(b.googlePlaceId ? { hasMap: `https://www.google.com/maps/place/?q=place_id:${b.googlePlaceId}` } : {}),
    openingHoursSpecification: [{
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      opens: b.hours.open,
      closes: b.hours.close,
    }],
    areaServed: [
      { '@type': 'City', name: 'Brighton, MA' },
      { '@type': 'City', name: 'Allston, MA' },
      { '@type': 'City', name: 'Brookline, MA' },
      { '@type': 'Neighborhood', name: 'Cleveland Circle' },
      { '@type': 'Neighborhood', name: 'Oak Square' },
      { '@type': 'Neighborhood', name: 'Brighton Center' },
      { '@type': 'Neighborhood', name: 'Brookline Village' },
    ],
    knowsLanguage: ['en'],
    priceRange: '$',
    currenciesAccepted: 'USD',
    paymentAccepted: b.paymentAccepted.join(', '),
    amenityFeature: [
      { '@type': 'LocationFeatureSpecification', name: 'Free Wi-Fi', value: true },
      { '@type': 'LocationFeatureSpecification', name: 'Self-service', value: true },
      { '@type': 'LocationFeatureSpecification', name: 'Card-operated machines', value: true },
      { '@type': 'LocationFeatureSpecification', name: 'Apple Pay / Google Pay accepted', value: true },
      { '@type': 'LocationFeatureSpecification', name: 'Mobile app (FasCard)', value: true },
      { '@type': 'LocationFeatureSpecification', name: 'Stainless steel folding tables', value: true },
      { '@type': 'LocationFeatureSpecification', name: 'Family-size washers (up to 45 lb)', value: true },
      { '@type': 'LocationFeatureSpecification', name: 'TV and seating area', value: true },
      { '@type': 'LocationFeatureSpecification', name: 'Loyalty card with 10% cashback', value: true },
    ],
    ...(sameAs.length > 0 ? { sameAs } : {}),
    // aggregateRating intentionally omitted: we don't claim an aggregate score
    // Google can verify against GMB. Add only once Places API integration ships.
  };
}

export function generateBreadcrumbSchema(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function generateFaqSchema(faqs: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(faq => ({
      '@type': 'Question',
      name: faq.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.a,
      },
    })),
  };
}

export type ArticleInput = {
  title: string;
  description: string;
  slug: string;
  datePublished: string;
  dateModified?: string;
  author: string;
  imageUrl?: string;
};

/** BlogPosting — more specific than Article. Includes dateModified, publisher, ImageObject. */
export function generateArticleSchema(article: ArticleInput) {
  const url = `${baseUrl}/blog/${article.slug}/`;
  const image = article.imageUrl
    ? (article.imageUrl.startsWith('http') ? article.imageUrl : `${baseUrl}${article.imageUrl}`)
    : OG_DEFAULT;
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    '@id': `${url}#blogposting`,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    headline: article.title,
    description: article.description,
    url,
    datePublished: article.datePublished,
    ...(article.dateModified && article.dateModified !== article.datePublished
      ? { dateModified: article.dateModified }
      : {}),
    author: {
      '@type': 'Organization',
      '@id': ORG_ID,
      name: article.author,
      url: baseUrl,
    },
    publisher: { '@id': ORG_ID },
    image: {
      '@type': 'ImageObject',
      url: image,
      width: 1200,
      height: 630,
    },
    isPartOf: { '@id': WEBSITE_ID },
  };
}

/** Blog index — ItemList of all posts. */
export function generateBlogListSchema(posts: { title: string; slug: string; description: string; datePublished: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    '@id': `${baseUrl}/blog/#blog`,
    name: 'The Found Sock Laundromat Blog',
    description: 'Practical laundry guides written by a Brighton laundromat.',
    url: `${baseUrl}/blog/`,
    publisher: { '@id': ORG_ID },
    blogPost: posts.map((p) => ({
      '@type': 'BlogPosting',
      headline: p.title,
      url: `${baseUrl}/blog/${p.slug}/`,
      description: p.description,
      datePublished: p.datePublished,
    })),
  };
}

/** OfferCatalog — washer/dryer/loyalty offerings. Goes on /pricing/ and /loyalty/. */
export function generateOfferCatalogSchema() {
  const { washers, dryers, loyalty } = getPricing();
  return {
    '@context': 'https://schema.org',
    '@type': 'OfferCatalog',
    name: 'Self-service laundry services',
    url: `${baseUrl}/pricing/`,
    itemListElement: [
      ...washers.map((w) => ({
        '@type': 'Offer',
        itemOffered: {
          '@type': 'Service',
          name: `${w.size} washer (${w.brand})`,
          serviceType: 'Self-service washing',
          provider: { '@id': LAUNDRY_ID },
        },
        price: w.price.toFixed(2),
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
      })),
      ...dryers.map((d) => ({
        '@type': 'Offer',
        itemOffered: {
          '@type': 'Service',
          name: `${d.size} dryer (${d.brand})`,
          serviceType: 'Self-service drying',
          provider: { '@id': LAUNDRY_ID },
        },
        price: d.pricePerInterval.toFixed(2),
        priceCurrency: 'USD',
        description: `$${d.pricePerInterval.toFixed(2)} per ${d.intervalMinutes} minutes`,
        availability: 'https://schema.org/InStock',
      })),
      {
        '@type': 'Offer',
        itemOffered: {
          '@type': 'Service',
          name: `Loyalty card — ${loyalty.cashbackPercent}% cashback`,
          serviceType: 'Loyalty program',
          provider: { '@id': LAUNDRY_ID },
        },
        price: loyalty.cardFee.toFixed(2),
        priceCurrency: 'USD',
        description: `One-time card fee. ${loyalty.cashbackPercent}% cashback on every wash. Never expires.`,
      },
    ],
  };
}
