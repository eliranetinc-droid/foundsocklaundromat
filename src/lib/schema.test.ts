import { test, expect, describe } from 'vitest';
import {
  generateLocalBusinessSchema,
  generateBreadcrumbSchema,
  generateFaqSchema,
  generateArticleSchema,
} from './schema';

describe('LocalBusiness schema', () => {
  test('includes core Laundry fields', () => {
    const s = generateLocalBusinessSchema();
    expect(s['@context']).toBe('https://schema.org');
    expect(s['@type']).toBe('Laundry');
    expect(s.name).toBe('The Found Sock Laundromat');
    expect(s.address['@type']).toBe('PostalAddress');
    expect(s.address.postalCode).toBe('02135');
    expect(s.openingHoursSpecification).toHaveLength(1);
    expect(s.openingHoursSpecification[0].opens).toBe('06:00');
    expect(s.openingHoursSpecification[0].closes).toBe('23:00');
    expect(s.priceRange).toBe('$');
  });

  test('includes aggregateRating when reviews are present', () => {
    const s = generateLocalBusinessSchema();
    // reviews.json placeholder ships with rating=4.8, count=217
    expect(s.aggregateRating).toBeDefined();
    expect(s.aggregateRating?.['@type']).toBe('AggregateRating');
    expect(s.aggregateRating?.ratingValue).toBeGreaterThan(0);
  });
});

describe('Breadcrumb schema', () => {
  test('builds a 2-item trail', () => {
    const s = generateBreadcrumbSchema([
      { name: 'Home', url: 'https://example.com/' },
      { name: 'Pricing', url: 'https://example.com/pricing' },
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

describe('Article schema', () => {
  test('includes required fields for blog posts', () => {
    const s = generateArticleSchema({
      title: 'How to wash a comforter',
      description: 'Step by step guide',
      slug: 'how-to-wash-a-comforter',
      datePublished: '2026-05-14',
      author: 'The Found Sock Laundromat',
    });
    expect(s['@type']).toBe('Article');
    expect(s.headline).toBe('How to wash a comforter');
    expect(s.url).toContain('/blog/how-to-wash-a-comforter');
  });
});
