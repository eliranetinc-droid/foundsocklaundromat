# Found Sock Laundromat

Marketing website for The Found Sock Laundromat in Brighton, MA.

## Stack
- Astro 5 (static SSG, zero JS by default)
- Tailwind CSS v4
- TypeScript (strict)
- Deployed to Cloudflare Pages

## Commands
| Command | Action | Status |
|---|---|---|
| `npm run dev` | Start dev server at http://localhost:4321 | ✓ available |
| `npm run build` | Build static site to `./dist/` | ✓ available |
| `npm run preview` | Preview built site locally | ✓ available |
| `npm run test` | Run unit tests (Vitest) | wired in Task 4 |
| `npm run test:e2e` | Run Playwright smoke tests | wired in Task 4 |
| `npm run check` | Type-check via `astro check` | wired in Task 4 |
| `npm run lh` | Run Lighthouse CI | wired in Task 4 |

## Single source of truth
`src/data/business.json` contains NAP, hours, phone. Every page reads from it.
Update once → updates schema, hero, footer, and everything else.

## Environment variables

| Variable | Purpose | Set in |
|---|---|---|
| `RESEND_API_KEY` | Resend API key for outbound helpdesk email | Worker secret (dashboard) |
| `NOTIFY_EMAIL` | Owner's private address for new-ticket notifications | Worker secret (dashboard) |
| `CF_ACCESS_TEAM_DOMAIN` | Cloudflare Access team domain guarding `/admin` | `wrangler.jsonc` vars |
| `CF_ACCESS_AUD` | Cloudflare Access application AUD tag | `wrangler.jsonc` vars |
| `GOOGLE_PLACES_API_KEY` | For build-time review fetch | GitHub Actions secret |
| `PUBLIC_MAPS_API_KEY` | For Google Maps embed | Cloudflare Pages env |
| `GOOGLE_PLACE_ID` | Your laundromat's Place ID | `src/data/business.json` |

Local dev: add to `.env.local` (gitignored).
