import { getBusiness } from './business';

const baseUrl = 'https://www.foundsocklaundromat.com';

export function generateLocalBusinessSchema() {
  const b = getBusiness();
  return {
    '@context': 'https://schema.org',
    '@type': 'Laundry',
    name: b.name,
    image: [`${baseUrl}/photos/storefront.jpg`],
    url: baseUrl,
    telephone: b.phone ?? undefined,
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
    openingHoursSpecification: [{
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: [
        'Monday', 'Tuesday', 'Wednesday', 'Thursday',
        'Friday', 'Saturday', 'Sunday',
      ],
      opens: b.hours.open,
      closes: b.hours.close,
    }],
    priceRange: '$',
    paymentAccepted: b.paymentAccepted.join(', '),
    // aggregateRating intentionally omitted: we curate which reviews display on the
    // homepage and never claim an aggregate score Google can verify against GMB.
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
  author: string;
  imageUrl?: string;
};

export function generateArticleSchema(article: ArticleInput) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.description,
    url: `${baseUrl}/blog/${article.slug}`,
    datePublished: article.datePublished,
    author: {
      '@type': 'Organization',
      name: article.author,
    },
    image: article.imageUrl ? [article.imageUrl] : [`${baseUrl}/photos/og/default.jpg`],
  };
}
