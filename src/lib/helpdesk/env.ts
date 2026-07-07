import type { D1Database, R2Bucket } from '@cloudflare/workers-types';

export interface HelpdeskEnv {
  DB: D1Database;
  PHOTOS: R2Bucket;
  RESEND_API_KEY: string;
  NOTIFY_EMAIL: string;
  CF_ACCESS_TEAM_DOMAIN: string;
  CF_ACCESS_AUD: string;
  ANTHROPIC_API_KEY?: string;
}

/** Cast the Cloudflare runtime env to our typed shape (same pattern the API routes already use). */
export async function getHelpdeskEnv(): Promise<HelpdeskEnv> {
  const { env } = await import('cloudflare:workers');
  return env as unknown as HelpdeskEnv;
}

export const SITE_URL = 'https://www.foundsocklaundromat.com';
export const SUPPORT_DOMAIN = 'foundsocklaundromat.com';
export const SUPPORT_FROM = `The Found Sock Laundromat <support@${SUPPORT_DOMAIN}>`;
