## WHAT — Tech Stack

- **Framework**: Next.js 14+ (App Router) + TypeScript
- **Styling**: Tailwind CSS + shadcn/ui (New York style, Slate base, CSS variables)
- **Database**: Supabase (PostgreSQL) with RLS policies
- **Auth**: Supabase Phone OTP (+995 Georgian numbers)
- **Backend**: Supabase Edge Functions (Deno)
- **Storage**: Supabase Storage (`property-photos` bucket)
- **Animations**: Framer Motion
- **Font**: Noto Sans Georgian (Google Fonts)
- **Deployment**: Vercel + Supabase Cloud
- Key dirs: `src/app/`, `src/components/`, `src/lib/`, `supabase/functions/`

## WHY — Project Purpose

Premium real estate rental/sales + services marketplace for Bakuriani ski resort, Georgia (mybakuriani.ge). ALL UI text is in Georgian (ქართული).

## HOW — Workflows

### Commands

- Dev: `npm run dev`
- Build: `npm run build`
- Lint: `npm run lint`
- Generate DB types: `npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/lib/types/database.ts`

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

### Build Phases (in order)

1. Project setup (Next.js + deps)
2. Shared components (Navbar, Footer, cards, forms)
3. Public pages (landing, listings, detail pages, search)
4. Auth (phone OTP login, registration)
5. Listing creation forms (multi-step, category-specific)
6. Dashboards (guest, renter, seller, cleaner, service, food, admin)
7. Edge functions (search, smart-match, bookings, balance, admin)
8. Animations & polish

### Workflow Conventions

- Always use Context7 MCP for library documentation without being asked
- Use frontend-design skill for all UI/frontend work
- Run /code-review before merging any PR
- After fixing any bug or learning something new, suggest updating CLAUDE.md
- Prefer Plan mode (Shift+Tab) for complex features before implementing
- Use /clear between unrelated tasks to reset context
- Run /compact manually at 50% context usage rather than waiting for auto-compaction
- For long prompts: save to .claude/prompts/ and reference the file to avoid bash newline issues

### Progressive Disclosure

- Full build spec: `.claude/prompts/mybakuriani-full-build.md`
- Figma node reference table: Section 2 of build spec
- Database schema (14 tables): Section 3 of build spec
- Georgian text reference: Section 10 of build spec
- Design tokens / Tailwind config: Section 9 of build spec
- File structure: Section 12 of build spec

### Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_SITE_URL
```
