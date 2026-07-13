## Behavioral Principles (Karpathy-inspired)

Source: github.com/forrestchang/andrej-karpathy-skills. Bias toward caution over speed; use judgment on trivial tasks.

### 1. Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs.

- State assumptions explicitly; if uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop, name what's confusing, ask.

### 2. Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility"/"configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you wrote 200 lines and 50 would do, rewrite it.
- Ask: "Would a senior engineer call this overcomplicated?" If yes, simplify.

### 3. Surgical Changes

Touch only what you must. Clean up only your own mess.

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.
- Remove orphans your changes created (unused imports/vars). Don't remove pre-existing dead code unless asked.
- Test: every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

Define success criteria. Loop until verified.

- "Add validation" → write tests for invalid inputs, then make them pass.
- "Fix the bug" → write a reproducing test, then make it pass.
- "Refactor X" → ensure tests pass before and after.
- For multi-step tasks, state a brief plan with a verify-step per item.

---

## WHAT — Tech Stack

- **Framework**: Next.js 15.3 (App Router, Turbopack dev) + TypeScript 5.8
- **React**: 19.1 with Server Components
- **Styling**: Tailwind CSS 4 + shadcn/ui (New York style, Slate base, CSS variables)
- **Database**: Supabase (PostgreSQL) with RLS policies
- **Auth**: Supabase Phone OTP (+995 Georgian numbers) via `@supabase/ssr` 0.9
- **Backend**: Supabase Edge Functions (Deno)
- **Storage**: Supabase Storage (`property-photos` bucket)
- **Maps**: Leaflet.js via `react-leaflet` (CartoDB Positron tiles, no API key; OSM+CARTO attribution required)
- **Animations**: Framer Motion 12
- **Font**: Noto Sans Georgian (Google Fonts)
- **Deployment**: Vercel + Supabase Cloud
- Key dirs: `src/app/`, `src/components/`, `src/lib/`, `supabase/functions/`, `supabase/migrations/`

## WHY — Project Purpose

Premium real estate rental/sales + services marketplace for Bakuriani ski resort, Georgia (mybakuriani.ge). ALL UI text is in Georgian (ქართული).

## HOW — Workflows

### Commands

- Dev: `npm run dev` (uses Turbopack)
- Build: `npm run build`
- Lint: `npm run lint`
- Generate DB types: `npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/lib/types/database.ts`

### Design Source of Truth

- **Figma** is the primary design reference. `design.txt` in project root contains extracted design specs.
- A comprehensive Figma pixel-perfect audit was completed (65+ token fixes across 30+ files).
- When making UI changes, always verify against Figma tokens (colors, spacing, radii, typography).

### Key Conventions

- **Georgian text**: Copy exact Georgian strings from `.claude/prompts/mybakuriani-full-build.md` Section 10. Do NOT translate or transliterate.
- **Currency**: Georgian Lari (₾), displayed as `X ₾` (symbol after number)
- **Phone format**: +995 5XX XX XX XX
- **Figma**: File key `CmWL25icqZwDX4dtEqT5ZJ`. Always fetch design before building any page using `get_design_context(fileKey, nodeId)`. Node IDs are in `.claude/prompts/mybakuriani-full-build.md` Section 2.
- **Images**: Use Next.js `<Image>` component for all property photos
- **SEO**: Every public page needs `metadata` export with Georgian titles/descriptions
- **Protected routes**: `/dashboard/*` and `/create/*` require auth (middleware redirect to `/auth/login`)
- **Real-time**: Use Supabase Realtime for bookings, messages, smart match requests, notifications
- **Error handling**: Wrap route segments with `error.tsx` and `loading.tsx` (skeleton components)
- **Mobile**: All pages must work on 375px+. Min 44px touch targets.

### User Roles

guest, renter, seller, cleaner, food, entertainment, transport, employment, handyman, admin

### Build Phases & Current Status

1. ~~Project setup (Next.js + deps)~~ — DONE
2. ~~Shared components (Navbar, Footer, cards, forms)~~ — DONE
3. ~~Public pages (landing, listings, detail pages, search)~~ — DONE
4. ~~Auth (phone OTP login, registration)~~ — DONE
5. ~~Listing creation forms (multi-step, category-specific)~~ — DONE
6. ~~Dashboards (guest, renter, seller, cleaner, service, food, admin)~~ — DONE
7. ~~Edge functions (search, smart-match, bookings, balance, admin)~~ — DONE (9 functions deployed)
8. Animations & polish — IN PROGRESS (Figma pixel-perfect audit largely complete)

### What's Built

**Public pages**: landing, apartments, hotels, sales, food, services, entertainment, transport, employment, blog, FAQ, contact, terms, search
**Auth**: login (phone OTP), register, callback
**Create forms**: rental, sale, food, service, entertainment, transport, employment
**Dashboards**: guest (bookings/profile/reviews), renter (calendar/balance/listings/smart-match/profile), seller (listings), cleaner (schedule/earnings), food (orders), service (orders), admin (KPIs/verifications/clients/listings/analytics/settings)
**Components**: booking (sidebar/calendar/date-picker), cards (property/review/service/skeleton/smart-match/stat), detail (photo gallery), forms (listing/phone-input/photo-uploader), layout (navbar/footer/dashboard-sidebar/mobile-bottom-nav), search (filter-panel/rent-buy-toggle), maps (BakurianiMap with Google Maps + fallback), shared (bottom-sheet/modal/scroll-reveal)
**Edge functions**: admin-stats, balance-topup, booking-create, booking-manage, purchase-vip, search, smart-match, upload-photos, verify-listing
**DB migrations**: initial schema, RLS policies, functions

### Workflow Conventions

- Always use Context7 MCP for library documentation without being asked
- Use frontend-design skill for all UI/frontend work
- Run /code-review before merging any PR
- After fixing any bug or learning something new, suggest updating CLAUDE.md
- Prefer Plan mode (Shift+Tab) for complex features before implementing
- Use /clear between unrelated tasks to reset context
- Run /compact manually at 50% context usage rather than waiting for auto-compaction
- For long prompts: save to .claude/prompts/ and reference the file to avoid bash newline issues

### Known Issues / Cleanup Needed

- Some `.claude/prompts/` files have been deleted from working tree but may still be tracked

### Progressive Disclosure

- Full build spec: `.claude/prompts/mybakuriani-full-build.md`
- Figma node reference table: Section 2 of build spec
- Database schema (14 tables): Section 3 of build spec
- Georgian text reference: Section 10 of build spec
- Design tokens / Tailwind config: Section 9 of build spec
- File structure: Section 12 of build spec
- Extracted design specs: `design.txt` (project root)

### Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_SITE_URL
```

## Memory bank (always-loaded)

@memory-bank/INDEX.md
@memory-bank/contracts.md

The two imports above load every session: the project map + where "truth" lives,
and the cross-cutting contracts (string-keyed / generated / wire couplings a
call-graph tool can't see). Area detail (`memory-bank/areas/*.md`) and the symbol
inventory (`memory-bank/generated/symbols.md`) are **read on demand** — they are
plain links, not `@import`, so they don't bloat every session.

### Standing rules

- **Pre-modification ritual** (before editing any symbol): open the matching
  `memory-bank/areas/<area>.md`, scan `contracts.md` for that symbol, then grep the
  symbol repo-wide (string-keyed couplings won't show as imports). Full steps in
  `INDEX.md`.
- **Keep memory in sync in the SAME session:** if a change touches a participant of
  any contract, update that `contracts.md` section (and the area file if its blast
  radius changed) in the same session as the code change. If you add/rename/remove
  exported symbols, regenerate the inventory: `python3 scripts/gen_code_map.py`.
- **Validate anchors:** run `python3 scripts/gen_code_map.py --check` after editing
  anything under `memory-bank/`; fix dangling anchors before finishing.
- **Never `git commit` without asking the user.**

## Multi-session coordination

Multiple Claude sessions may run against this repo at once. Before editing, follow
`coordination/README.md`: register your session, claim the files you'll touch, and
check others' claims. **Uncommitted changes you did not make are NOT yours** — do
not revert or commit them. `coordination/` is git-ignored (local scratch only).
