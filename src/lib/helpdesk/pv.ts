export function isBotUA(ua: string | null): boolean {
  if (!ua) return true;
  // Substring match is intentional (catches HTTP-client CLIs); may also drop
  // rare in-app browsers mentioning these words — acceptable for rough analytics.
  return /bot|crawl|spider|slurp|lighthouse|pagespeed|headless|preview|monitor|fetch|curl|python/i.test(ua);
}

export function classifyDevice(ua: string | null): 'mobile' | 'desktop' {
  // Known limitation: modern iPadOS sends a "Macintosh" UA, so iPads count as desktop.
  return /Mobi|Android|iPhone|iPad/i.test(ua ?? '') ? 'mobile' : 'desktop';
}

export function referrerHost(referrer: string, selfHost: string): string {
  try {
    const host = new URL(referrer).host;
    return host === selfHost ? '' : host;
  } catch {
    return '';
  }
}

export function isValidPath(p: unknown): p is string {
  return typeof p === 'string'
    && p.startsWith('/')
    && p.length <= 200
    && !p.startsWith('/api')
    && !p.startsWith('/admin');
}

/** Calendar day (YYYY-MM-DD) of an instant in America/New_York. */
export function etDay(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

/** Calendar day + 0–23 hour of an instant, in America/New_York. */
export function etDayHour(d: Date): { day: string; hour: number } {
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: '2-digit', hour12: false,
  }).format(d)) % 24; // '24' → 0 guard
  return { day: etDay(d), hour };
}

const SEARCH_HOSTS = /(^|\.)(google|bing|duckduckgo|yahoo|ecosia|brave|startpage)\.[a-z.]+$/;
const SOCIAL_HOSTS = /(^|\.)(facebook|instagram|twitter|x|t|linkedin|reddit|tiktok|pinterest|youtube|threads|nextdoor)\.(com|co|org)$/;

/** Cookie-free channel classification from a referrer host. */
export function channelOf(referrerHost: string | null): 'Direct' | 'Search' | 'Social' | 'Referral' {
  const h = (referrerHost ?? '').toLowerCase();
  if (!h || h === '—') return 'Direct';
  if (SEARCH_HOSTS.test(h)) return 'Search';
  if (SOCIAL_HOSTS.test(h)) return 'Social';
  return 'Referral';
}
