// Custom worker entry: wraps the Astro adapter's fetch handler so we can
// also export an email() handler (Cloudflare Email Routing) in Task 11.
// wrangler.jsonc `main` points here; @cloudflare/vite-plugin builds it.
import server from '@astrojs/cloudflare/entrypoints/server';

export default {
  fetch: server.fetch,
};
