export const prerender = false;

import type { APIRoute } from 'astro';
import { getHelpdeskEnv } from '../../lib/helpdesk/env';
import { insertPageview } from '../../lib/helpdesk/db';
import { isBotUA, classifyDevice, referrerHost, isValidPath } from '../../lib/helpdesk/pv';

const NO_CONTENT = () => new Response(null, { status: 204 });

export const POST: APIRoute = async ({ request }) => {
  try {
    const ua = request.headers.get('user-agent');
    if (isBotUA(ua)) return NO_CONTENT();

    let data: { p?: unknown; r?: unknown };
    try {
      data = JSON.parse(await request.text());
    } catch {
      return NO_CONTENT();
    }
    if (!isValidPath(data.p)) return NO_CONTENT();

    const env = await getHelpdeskEnv();
    const selfHost = new URL(request.url).host;
    // request.cf is present on Cloudflare; absent in local dev.
    const country = ((request as unknown as { cf?: { country?: string } }).cf?.country) ?? '';

    await insertPageview(env.DB, {
      path: data.p,
      referrerHost: referrerHost(typeof data.r === 'string' ? data.r : '', selfHost),
      country,
      device: classifyDevice(ua),
    });
    return NO_CONTENT();
  } catch {
    return NO_CONTENT(); // never fail the page over analytics
  }
};
