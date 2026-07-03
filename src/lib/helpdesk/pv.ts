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
