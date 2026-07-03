import { defineMiddleware } from 'astro:middleware';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const PROTECTED = (path: string) => path.startsWith('/admin') || path.startsWith('/api/admin');

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  if (!PROTECTED(pathname)) return next();

  // Local dev: no Access in front of localhost.
  if (import.meta.env.DEV) return next();

  const forbidden = () => new Response('Forbidden', { status: 403 });
  try {
    const { env } = await import('cloudflare:workers');
    const teamDomain = (env as Record<string, unknown>).CF_ACCESS_TEAM_DOMAIN as string | undefined;
    const aud = (env as Record<string, unknown>).CF_ACCESS_AUD as string | undefined;
    if (!teamDomain || !aud) return forbidden(); // fail closed on misconfig

    const token = context.request.headers.get('Cf-Access-Jwt-Assertion');
    if (!token) return forbidden();

    jwks ??= createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
    // algorithms pin = defense-in-depth vs future JWKS content changes (Access signs RS256)
    await jwtVerify(token, jwks, { audience: aud, issuer: `https://${teamDomain}`, algorithms: ['RS256'] });
    return next();
  } catch {
    return forbidden();
  }
});
