export const prerender = false;

import type { APIRoute } from 'astro';
import { getHelpdeskEnv } from '../../../../lib/helpdesk/env';

export const GET: APIRoute = async ({ params }) => {
  // trailingSlash:'always' can hand us the key with a trailing slash — strip it.
  const key = (params.key ?? '').replace(/\/$/, '');
  // Only our two known prefixes are servable.
  if (!/^(form|inbound)\/[\w-]+\/[\w.\-]+$/.test(key)) return new Response('Not found', { status: 404 });

  const env = await getHelpdeskEnv();
  const obj = await env.PHOTOS.get(key);
  if (!obj) return new Response('Not found', { status: 404 });

  return new Response(obj.body as unknown as BodyInit, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
