import { test, expect, describe } from 'vitest';
import {
  generateLocalBusinessSchema,
  generateOrganizationSchema,
  generateWebSiteSchema,
  generateBreadcrumbSchema,
  generateFaqSchema,
  generateArticleSchema,
  generateBlogListSchema,
  generateOfferCatalogSchema,
} from './schema';

describe('LocalBusiness schema', () => {
  test('includes core Laundry fields', () => {
    const s = generateLocalBusinessSchema();
    expect(s['@context']).toBe('https://schema.org');
    expect(s['@type']).toBe('Laundry');
    expect(s['@id']).toContain('#laundry');
    expect(s.name).toBe('The Found Sock Laundromat');
    expect(s.address['@type']).toBe('PostalAddress');
    expect(s.address.postalCode).toBe('02135');
    expect(s.openingHoursSpecification).toHaveLength(1);
    expect(s.openingHoursSpecification[0].opens).toBe('06:00');
    expect(s.openingHoursSpecification[0].closes).toBe('23:00');
    expect(s.priceRange).toBe('$');
    expect(s.currenciesAccepted).toBe('USD');
  });

  test('includes enriched local-SEO fields', () => {
    const s = generateLocalBusinessSchema() as Record<string, any>;
    expect(s.hasMap).toContain('place_id');
    expect(s.areaServed.length).toBeGreaterThanOrEqual(5);
    expect(s.amenityFeature.length).toBeGreaterThanOrEqual(5);
    expect(s.slogan).toBeTruthy();
  });

  test('does NOT include aggregateRating (curated review display, not Google-aggregate)', () => {
    const s = generateLocalBusinessSchema() as Record<string, unknown>;
    expect(s.aggregateRating).toBeUndefined();
  });
});

describe('Organization schema', () => {
  test('has stable @id, logo, founding date', () => {
    const s = generateOrganizationSchema();
    expect(s['@type']).toBe('Organization');
    expect(s['@id']).toContain('#organization');
    expect(s.logo['@type']).toBe('ImageObject');
    expect(s.foundingDate).toBe('2015');
  });
});

describe('WebSite schema', () => {
  test('links to Organization via @id reference', () => {
    const s = generateWebSiteSchema();
    expect(s['@type']).toBe('WebSite');
    expect(s.publisher['@id']).toContain('#organization');
    expect(s.inLanguage).toBe('en-US');
  });
});

describe('Breadcrumb schema', () => {
  test('builds a 2-item trail', () => {
    const s = generateBreadcrumbSchema([
      { name: 'Home', url: 'https://example.com/' },
      { name: 'Pricing', url: 'https://example.com/pricing/' },
    ]);
    expect(s['@type']).toBe('BreadcrumbList');
    expect(s.itemListElement).toHaveLength(2);
    expect(s.itemListElement[0].position).toBe(1);
    expect(s.itemListElement[1].name).toBe('Pricing');
  });
});

describe('FAQ schema', () => {
  test('maps Q+A pairs', () => {
    const s = generateFaqSchema([
      { q: 'Do you accept cash?', a: 'Yes, via the kiosk → loyalty card.' },
      { q: 'Open Christmas?', a: 'Yes, daily 6am to 11pm.' },
    ]);
    expect(s['@type']).toBe('FAQPage');
    expect(s.mainEntity).toHaveLength(2);
    expect(s.mainEntity[0].name).toBe('Do you accept cash?');
    expect(s.mainEntity[0].acceptedAnswer.text).toContain('kiosk');
  });
});

describe('Article (BlogPosting) schema', () => {
  test('emits BlogPosting type with required fields', () => {
    const s = generateArticleSchema({
      title: 'How to wash a comforter',
      description: 'Step by step guide',
      slug: 'how-to-wash-a-comforter',
      datePublished: '2026-05-14',
      author: 'The Found Sock Laundromat',
    });
    expect(s['@type']).toBe('BlogPosting');
    expect(s.headline).toBe('How to wash a comforter');
    expect(s.url).toContain('/blog/how-to-wash-a-comforter/');
    expect(s.url.endsWith('/')).toBe(true);
    expect(s.image['@type']).toBe('ImageObject');
    expect(s.publisher['@id']).toContain('#organization');
  });

  test('emits dateModified when updatedAt differs from datePublished', () => {
    const s = generateArticleSchema({
      title: 'X',
      description: 'Y',
      slug: 'x',
      datePublished: '2026-05-10',
      dateModified: '2026-05-15',
      author: 'A',
    }) as Record<string, any>;
    expect(s.dateModified).toBe('2026-05-15');
  });

  test('omits dateModified when it equals datePublished', () => {
    const s = generateArticleSchema({
      title: 'X',
      description: 'Y',
      slug: 'x',
      datePublished: '2026-05-10',
      dateModified: '2026-05-10',
      author: 'A',
    }) as Record<string, any>;
    expect(s.dateModified).toBeUndefined();
  });
});

describe('Blog list schema', () => {
  test('emits Blog with embedded BlogPosting entries', () => {
    const s = generateBlogListSchema([
      { title: 'A', slug: 'a', description: 'a desc', datePublished: '2026-05-10' },
      { title: 'B', slug: 'b', description: 'b desc', datePublished: '2026-05-11' },
    ]);
    expect(s['@type']).toBe('Blog');
    expect(s.blogPost).toHaveLength(2);
    expect(s.blogPost[0]['@type']).toBe('BlogPosting');
    expect(s.blogPost[0].url).toContain('/blog/a/');
  });
});

describe('OfferCatalog schema', () => {
  test('emits washer + dryer + loyalty offers', () => {
    const s = generateOfferCatalogSchema();
    expect(s['@type']).toBe('OfferCatalog');
    expect(s.itemListElement.length).toBeGreaterThanOrEqual(5);
    const types = new Set(s.itemListElement.map((o: any) => o['@type']));
    expect(types.has('Offer')).toBe(true);
    expect(s.itemListElement[0].priceCurrency).toBe('USD');
  });
});
