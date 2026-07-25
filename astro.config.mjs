import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://www.foundsocklaundromat.com',
  trailingSlash: 'always',

  // The contact page invited vague machine reports (and spam) — everything
  // now funnels through the structured /report-issue/ form. 301 keeps old
  // search results and bookmarks working.
  redirects: {
    '/contact/': { status: 301, destination: '/report-issue/' },
  },

  // Pre-bake all image variants at build time via Sharp (instead of the
  // Cloudflare runtime `/_image/` endpoint). Ships static AVIF/WebP files
  // — faster + cheaper than runtime transforms.
  image: {
    service: { entrypoint: 'astro/assets/services/sharp' },
  },

  integrations: [
    sitemap({
      // Use the source file's mtime as a fallback lastmod so Google/Bing get a freshness hint.
      // Per-post lastmod from frontmatter could be added later via serialize().
      lastmod: new Date(),
      // Admin pages are noindex + robots-disallowed; advertising them in the
      // sitemap would trigger "indexed though blocked" warnings in GSC.
      // /contact/ is a 301 to /report-issue/ — keep it out of the sitemap too.
      filter: (page) => !page.includes('/admin') && !page.includes('/contact'),
    }),
  ],

  vite: {
    plugins: [tailwindcss()],
  },

  adapter: cloudflare({
    // Use Sharp at build time so AVIF/WebP variants ship as static files in
    // /_astro/ instead of being generated at runtime by Cloudflare Workers.
    imageService: 'compile',
  }),
});