# Found Sock Laundromat

Marketing website for The Found Sock Laundromat in Brighton, MA.

## Stack
- Astro 5 (static SSG, zero JS by default)
- Tailwind CSS v4
- TypeScript (strict)
- Deployed to Cloudflare Pages

## Commands
| Command | Action |
|---|---|
| `npm run dev` | Start dev server at http://localhost:4321 |
| `npm run build` | Build static site to `./dist/` |
| `npm run preview` | Preview built site locally |
| `npm run test` | Run unit tests (Vitest) |
| `npm run test:e2e` | Run Playwright smoke tests |
| `npm run check` | Type-check via `astro check` |
| `npm run lh` | Run Lighthouse CI |

## Single source of truth
`src/data/business.json` contains NAP, hours, phone. Every page reads from it.
Update once → updates schema, hero, footer, and everything else.
