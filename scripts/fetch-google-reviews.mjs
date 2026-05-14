import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, '..', 'src', 'data', 'reviews.json');

export async function fetchReviews({ apiKey, placeId }) {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=rating,user_ratings_total,reviews&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const r = data.result;
  if (!r) return null;
  return {
    rating: r.rating,
    count: r.user_ratings_total,
    fetchedAt: new Date().toISOString(),
    reviews: (r.reviews ?? []).slice(0, 5).map(rv => ({
      author: rv.author_name,
      rating: rv.rating,
      text: rv.text,
      relativeTime: rv.relative_time_description,
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
