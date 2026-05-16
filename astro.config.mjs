import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://www.foundsocklaundromat.com',
  trailingSlash: 'always',

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