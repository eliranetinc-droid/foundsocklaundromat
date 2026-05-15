import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, '..', 'src', 'data', 'reviews.json');

export async function fetchReviews({ apiKey, placeId }) {
  const url = `https://places.googleapis.com/v1/places/${placeId}`;
  const res = await fetch(url, {
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'rating,userRatingCount,reviews',
    },
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.warn(`[fetch-google-reviews] Places API returned ${res.status}: ${errText.slice(0, 300)}`);
    return null;
  }
  const r = await res.json();
  if (!r || typeof r.rating !== 'number') return null;
  return {
    rating: r.rating,
    count: r.userRatingCount ?? 0,
    fetchedAt: new Date().toISOString(),
    reviews: (r.reviews ?? []).slice(0, 5).map(rv => ({
      author: rv.authorAttribution?.displayName ?? 'Anonymous',
      rating: rv.rating,
      text: rv.text?.text ?? rv.originalText?.text ?? '',
      relativeTime: rv.relativePublishTimeDescription ?? '',
    })),
  };
}

async function main() {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const businessJson = JSON.parse(await fs.readFile(path.join(__dirname, '..', 'src', 'data', 'business.json'), 'utf-8'));
  const placeId = businessJson.googlePlaceId;

  if (!apiKey || !placeId) {
    console.log('[fetch-google-reviews] Skipping — missing GOOGLE_PLACES_API_KEY or googlePlaceId in business.json. Existing reviews.json will be used.');
    return;
  }

  const data = await fetchReviews({ apiKey, placeId });
  if (!data) {
    console.warn('[fetch-google-reviews] API call failed. Keeping existing reviews.json.');
    return;
  }
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(data, null, 2));
  console.log(`[fetch-google-reviews] Wrote ${data.reviews.length} reviews (rating ${data.rating}, ${data.count} total).`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => { console.error(err); process.exit(1); });
}
