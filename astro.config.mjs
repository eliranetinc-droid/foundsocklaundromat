import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://www.foundsocklaundromat.com',
  trailingSlash: 'always',

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

  adapter: cloudflare(),
});