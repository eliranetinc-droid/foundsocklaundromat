import { test, expect, vi, beforeEach } from 'vitest';
import { fetchReviews } from './fetch-google-reviews.mjs';

beforeEach(() => { global.fetch = vi.fn(); });

test('formats Places API (New) response correctly', async () => {
  global.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      rating: 4.8,
      userRatingCount: 217,
      reviews: [
        {
          rating: 5,
          text: { text: 'Great place', languageCode: 'en' },
          relativePublishTimeDescription: '2 weeks ago',
          authorAttribution: { displayName: 'Jane Doe' },
        },
        {
          rating: 4,
          text: { text: 'Pretty good', languageCode: 'en' },
          relativePublishTimeDescription: '1 month ago',
          authorAttribution: { displayName: 'John Doe' },
        },
      ],
    }),
  });

  const result = await fetchReviews({ apiKey: 'k', placeId: 'p' });
  expect(result.rating).toBe(4.8);
  expect(result.count).toBe(217);
  expect(result.reviews).toHaveLength(2);
  expect(result.reviews[0].author).toBe('Jane Doe');
  expect(result.reviews[0].text).toBe('Great place');
  expect(result.reviews[0].relativeTime).toBe('2 weeks ago');
  expect(result.fetchedAt).toBeTruthy();
});

test('passes API key + field mask via headers (not query string)', async () => {
  global.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ rating: 4.8, userRatingCount: 0, reviews: [] }),
  });

  await fetchReviews({ apiKey: 'secret_key', placeId: 'place_x' });

  expect(global.fetch).toHaveBeenCalledWith(
    'https://places.googleapis.com/v1/places/place_x',
    expect.objectContaining({
      headers: expect.objectContaining({
        'X-Goog-Api-Key': 'secret_key',
        'X-Goog-FieldMask': 'rating,userRatingCount,reviews',
      }),
    }),
  );
});

test('returns null on api error', async () => {
  global.fetch.mockResolvedValue({ ok: false, status: 403, text: async () => 'forbidden' });
  const result = await fetchReviews({ apiKey: 'k', placeId: 'p' });
  expect(result).toBeNull();
});
