import { test, expect, vi, beforeEach } from 'vitest';
import { fetchReviews } from './fetch-google-reviews.mjs';

beforeEach(() => { global.fetch = vi.fn(); });

test('formats Google Places response correctly', async () => {
  global.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      result: {
        rating: 4.8,
        user_ratings_total: 217,
        reviews: [
          { author_name: 'Jane Doe', rating: 5, text: 'Great place', relative_time_description: '2 weeks ago' },
          { author_name: 'John Doe', rating: 4, text: 'Pretty good', relative_time_description: '1 month ago' },
        ],
      },
    }),
  });

  const result = await fetchReviews({ apiKey: 'k', placeId: 'p' });
  expect(result.rating).toBe(4.8);
  expect(result.count).toBe(217);
  expect(result.reviews).toHaveLength(2);
  expect(result.reviews[0].author).toBe('Jane Doe');
  expect(result.fetchedAt).toBeTruthy();
});

test('returns null on api error', async () => {
  global.fetch.mockResolvedValue({ ok: false, status: 403 });
  const result = await fetchReviews({ apiKey: 'k', placeId: 'p' });
  expect(result).toBeNull();
});
