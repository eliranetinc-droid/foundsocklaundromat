// Custom worker entry: wraps the Astro adapter's fetch handler and adds the
// email() handler that Cloudflare Email Routing (catch-all) delivers to.
// wrangler.jsonc `main` points here; @cloudflare/vite-plugin builds it.
import server from '@astrojs/cloudflare/entrypoints/server';
import type { ExecutionContext, ForwardableEmailMessage } from '@cloudflare/workers-types';
import { handleInboundEmail } from './lib/helpdesk/inbound';
import { sendWeeklyDigest } from './lib/helpdesk/digest';
import type { HelpdeskEnv } from './lib/helpdesk/env';

export default {
  fetch: server.fetch,
  async email(message: ForwardableEmailMessage, env: HelpdeskEnv, _ctx: ExecutionContext) {
    try {
      await handleInboundEmail(message, env);
    } catch (e) {
      console.error('[helpdesk] inbound email failed:', e);
      // Do not rethrow: rejecting would bounce the sender's email.
    }
  },
  async scheduled(_controller: unknown, env: unknown, _ctx: unknown) {
    await sendWeeklyDigest(env as Parameters<typeof sendWeeklyDigest>[0]);
  },
};
