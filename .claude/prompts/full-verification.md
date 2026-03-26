# MyBakuriani Full Platform Verification & Gap Remediation

## Objective

Systematically verify every layer of the MyBakuriani platform against the build spec
(.claude/prompts/mybakuriani-full-build.md) and fix all gaps found — frontend routes,
backend database schema, Supabase edge functions, and API integrations.

## Phase 1: Frontend Route Audit (ALL 63+ routes)

Verify every route from Section 12 exists and renders without errors.

### 1A: Public Pages (check file exists + builds + fetches real data)

- [ ] `/` (landing) — hero, search box, rent/buy toggle, 8 category sections, blog
- [ ] `/apartments` — grid with PropertyCards, filters
- [ ] `/apartments/[id]` — photo gallery, amenities, calendar, reviews, booking sidebar
- [ ] `/hotels` — hotel grid
- [ ] `/sales` + `/sales/[id]` — investment stats, ROI data
- [ ] `/entertainment` + `/entertainment/[id]`
- [ ] `/services` + `/services/[id]`
- [ ] `/employment` + `/employment/[id]`
- [ ] `/transport` + `/transport/[id]`
- [ ] `/food` + `/food/[id]`
- [ ] `/search` — filter sidebar + results from Supabase
- [ ] `/blog` — blog posts from Supabase
- [ ] `/faq`, `/terms`

### 1B: Auth Pages

- [ ] `/auth/login` — phone OTP with +995 prefix
- [ ] `/auth/register` — multi-step registration with role selection

### 1C: Listing Creation (protected)

- [ ] `/create` — category selector
- [ ] `/create/rental`, `/create/sale`, `/create/employment`, `/create/service`
- [ ] `/create/transport`, `/create/food`, `/create/entertainment`

### 1D: Dashboard Pages (protected, all 6 role dashboards)

- [ ] `/dashboard/guest` + bookings, reviews, profile sub-pages
- [ ] `/dashboard/renter` + listings, calendar, balance, smart-match, profile
- [ ] `/dashboard/seller` + listings
- [ ] `/dashboard/cleaner` + schedule, earnings
- [ ] `/dashboard/service` + orders
- [ ] `/dashboard/food` + orders
- [ ] `/dashboard/admin` + verifications, clients, clients/[id], listings, analytics, settings

### 1E: Shared Components Exist

- [ ] Navbar (sticky, hamburger mobile, Georgian nav items)
- [ ] Footer (3-column, Georgian links)
- [ ] DashboardSidebar + MobileBottomNav
- [ ] PropertyCard, ServiceCard, StatCard, ReviewCard, SmartMatchCard, SkeletonCard
- [ ] SearchBox, FilterPanel, RentBuyToggle
- [ ] DateRangePicker, BookingSidebar, CalendarGrid
- [ ] StatusBadge, DiscountBadge, VIPBadge, Modal, BottomSheet, ScrollReveal

## Phase 2: Database Schema Audit

Run SQL against Supabase to verify ALL 14 tables exist with correct columns:

- profiles, properties, calendar_blocks, bookings, reviews, services
- smart_match_requests, balances, transactions, sms_messages
- verifications, notifications, blog_posts, cleaning_tasks
- Verify all ENUM types exist (user_role, property_type, listing_status, etc.)
- Verify all indexes exist
- Verify RLS policies are enabled on ALL 14 tables
- Verify triggers: on_review_insert, on_booking_confirmed, on_profile_created
- Verify functions: increment_views, update_property_rating, create_booking_calendar_blocks, create_user_balance

## Phase 3: Edge Functions Audit

Verify all 9 edge functions are deployed and callable:

- search, smart-match, booking-create, booking-manage
- balance-topup, purchase-vip, admin-stats, verify-listing, upload-photos

## Phase 4: Integration Verification

- [ ] Landing page fetches REAL data from Supabase (properties, services, blog_posts)
- [ ] Search page queries Supabase with filters
- [ ] Detail pages fetch by ID from Supabase
- [ ] Auth flow: phone OTP -> profile creation -> role assignment -> dashboard redirect
- [ ] Protected routes redirect to /auth/login when unauthenticated
- [ ] Dashboard pages fetch role-specific data from Supabase

## Phase 5: Build Verification

- [ ] `npm run build` succeeds with zero errors
- [ ] No TypeScript type errors
- [ ] All imports resolve correctly

## Rules

- Fix gaps IN PLACE — don't just report, implement missing pieces
- For missing pages: create with proper Georgian text from Section 10 of mybakuriani-full-build.md
- For missing DB objects: create via Supabase MCP (execute_sql or apply_migration)
- For missing edge functions: deploy via Supabase MCP
- After ALL fixes, run final `npm run build` to confirm zero errors
- DO NOT delete any existing data or files
- Commit after each major phase completion

## Abort Conditions

- If Supabase connection fails, stop and report
- If more than 20 pages are missing, stop and propose a phased approach instead
- If build has more than 50 errors, stop and triage the top blockers first

## Success Criteria

- Every route from Section 12 exists and renders
- All 14 DB tables with correct schema, RLS, triggers
- All 9 edge functions deployed
- `npm run build` = 0 errors
- Landing page shows real Supabase data
