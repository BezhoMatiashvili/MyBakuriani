# MyBakuriani — Full QA Audit & Figma Design Compliance Fix

## CONTEXT

- Project: MyBakuriani (Next.js 14+ / TypeScript / Tailwind / Supabase)
- Build spec: .claude/prompts/mybakuriani-full-build.md
- Figma file key: CmWL25icqZwDX4dtEqT5ZJ
- 45 files currently modified (uncommitted). Prior QA work was done but issues remain.
- All UI text is Georgian.

## PHASE 1: FUNCTIONAL BUG FIXES (Priority — must work before design polish)

### 1A. Search Flow (Landing to /search)

Files: src/components/search/SearchBox.tsx, src/app/search/page.tsx, src/app/search/SearchPageClient.tsx

- Open the site in browser (Playwright MCP). Type a location in the search box on the landing page, select dates, set guests, and click search.
- Verify URL params are populated: ?location=X&check_in=YYYY-MM-DD&check_out=YYYY-MM-DD&guests=N&mode=rent|sale
- Verify SearchPageClient reads those params and passes them to SearchBox as defaults
- Verify the Supabase edge function call at /functions/v1/search fires with correct payload
- Verify client-side fallback activates gracefully if edge function fails
- Fix any broken link in the chain. Test both rent and sale modes.

### 1B. Filter Panel

Files: src/components/search/FilterPanel.tsx, src/app/search/SearchPageClient.tsx

- Click each filter category (property type, amenities, rooms, price range, area range)
- Verify filter state updates propagate to the search/fetch function
- Verify price range inputs accept Lari values and filter correctly
- Verify amenities checkboxes toggle and accumulate properly
- Verify "clear filters" resets all state
- Verify mobile: filters should open as BottomSheet, not sidebar

### 1C. Date Picker / Calendar

Files: src/components/search/SearchBox.tsx, src/components/booking/DateRangePicker.tsx, src/components/booking/CalendarGrid.tsx

- Click the date field in SearchBox — calendar should appear
- Select a check-in date, then a check-out date — range should highlight
- Dates should persist when navigating to /search page
- On detail pages (/apartments/[id]), DateRangePicker should show blocked dates from calendar_blocks
- Single month on mobile (less than 768px), dual month on desktop
- Georgian locale for month/day names (date-fns/locale/ka)

### 1D. Rent/Buy Toggle

Files: src/components/search/RentBuyToggle.tsx, src/app/search/SearchPageClient.tsx

- Toggle between Rent and Buy-Sell modes
- Verify mode change triggers re-fetch with correct is_for_sale filter
- Verify price field switches: price_per_night (rent) vs sale_price (buy)
- Verify toggle state persists via URL param (?mode=rent|sale)

## PHASE 2: FIGMA DESIGN COMPLIANCE (Visual 1:1 match)

For EACH page below, fetch the Figma design using get_design_context or get_screenshot, then compare against current code and fix discrepancies:

### Critical Pages (fetch Figma, compare, fix):

1. Landing Page / — Node 5:28676
   - Hero section, search box placement, status cards, section order, spacing
2. Search Results /search — Node 5:33984
   - Filter sidebar layout, result grid, card styling, pagination
3. Apartment Detail /apartments/[id] — Node 5:33666
   - Photo gallery, booking sidebar, amenities grid, reviews
4. Navbar — Node 5:35532
   - Logo, nav links, mobile hamburger, auth button
5. Footer — Node 5:33185
   - Column layout, links, social icons, copyright text

### Design Token Verification (Section 9 of build spec):

- primary: #1a1a2e (dark sections), accent: #3b82f6 (CTAs), accent-hover: #2563eb
- Card border-radius: 12px, shadow: 0 2px 8px rgba(0,0,0,0.08)
- Font: Noto Sans Georgian
- VIP badge: gold #f59e0b, Super VIP: purple #8b5cf6
- Verify NO hardcoded blue-500/blue-600/blue-700 remains (should all use brand tokens)

## PHASE 3: SPECIFICATION COMPLIANCE CHECKS

### Georgian Text (Section 10)

Spot-check 10+ key labels against the spec to confirm exact match:

- Nav labels, Search labels, Dashboard labels

### Mobile Responsiveness (Section 8)

- Cards: grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4
- Touch targets: minimum 44px
- Navbar: hamburger on mobile
- Filters: BottomSheet on mobile

### Animations (Section 7)

- Card hover: scale-[1.02] + shadow increase + image scale-110
- Filter accordion: Framer Motion height animation
- Modal: backdrop fade + scale-up entrance
- Scroll reveal on landing page sections

## VERIFICATION GATES (must all pass before done)

1. npm run build — 0 errors, 0 warnings
2. npm run lint — 0 errors
3. Browser test via Playwright: navigate landing to search to detail page to back
4. Search with location text returns filtered results
5. Date picker opens, selects range, persists to search page
6. Filters apply and results update
7. Rent/Buy toggle switches mode correctly
8. No hardcoded blue-N classes remaining (grep verification)
9. All Georgian labels match spec Section 10

## ABORT CONDITIONS

- If Supabase edge function is unreachable: verify client-side fallback works, document the issue, continue with other fixes
- If Figma MCP is rate-limited: use get_screenshot as fallback, or reference build spec Section 9 tokens directly
- If a fix breaks the build: revert immediately, try alternative approach

## APPROACH

- Use Playwright MCP to test in actual browser where possible
- Fix code issues first (Phase 1), then design (Phase 2), then verify (Phase 3)
- Run npm run build after each phase to catch regressions
- Make minimal, targeted changes — do not refactor unrelated code
