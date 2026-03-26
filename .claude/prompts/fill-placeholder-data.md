# Fill MyBakuriani Website with Figma-Matching Placeholder Data

## Context

- All listing/detail pages query Supabase but the database is likely empty/sparse
- Landing page has mock data fallbacks already in src/app/\_landing/LandingPage.tsx
- No public/ directory exists — need to create it with placeholder images
- Figma file key: CmWL25icqZwDX4dtEqT5ZJ

## Phase 1: Fetch Figma Design Context

- Use get_design_context and get_screenshot on key Figma pages (landing, listings, detail pages) to capture exact placeholder text, image styles, property names, prices, and layout data
- Reference node IDs from .claude/prompts/mybakuriani-full-build.md Section 2

## Phase 2: Create Placeholder Images

- Add realistic ski resort / mountain property placeholder images to public/images/
- Categories needed: apartments, hotels, cottages, villas, services, food, transport, entertainment, blog posts, avatars
- Use high-quality Unsplash/placeholder URLs or download representative images
- Name files descriptively: apartment-1.jpg, hotel-1.jpg, service-cleaning-1.jpg

## Phase 3: Seed Supabase with Placeholder Data

- Insert placeholder data into Supabase tables matching Figma designs:
  - properties table: 12-16 listings (mix of apartments, hotels, cottages, villas, studios) with Georgian titles, Bakuriani locations, realistic prices (80-500 lari/night for rentals, 80000-350000 lari for sales), amenities, photos
  - services table: 10-15 services across all categories (cleaner, food, transport, entertainment, handyman, employment) with Georgian descriptions
  - reviews table: 15-20 reviews spread across properties/services
  - blog_posts table: 3-4 blog posts with Georgian content about Bakuriani
- Use mcp supabase execute_sql for INSERT statements
- All text in Georgian — copy style from Figma or existing mock data
- Photo arrays should reference the public/images/ paths or Supabase Storage URLs
- Include VIP and Super VIP listings with discount percentages
- Set status active on all listings

## Phase 4: Update Landing Page Mock Data

- Update MOCK_PROPERTIES, MOCK_HOTELS, MOCK_SALE_APARTMENTS in LandingPage.tsx to match Figma exactly (names, prices, images, badges)
- Update MOCK_BLOG_POSTS with Figma-matching content
- Update makeServiceCards() to match Figma service categories

## Phase 5: Verification

- Run npm run build — must pass with zero errors
- Start dev server and visually confirm:
  - Landing page shows populated cards with images
  - /apartments, /hotels, /sales show listings
  - /services, /food, /transport, /entertainment, /employment show services
  - Detail pages render full content when clicking a card
- Confirm no broken image references

## Constraints

- All Georgian text must be authentic — no transliteration or English placeholders
- Currency: X lari format (symbol after number)
- Prices must be realistic for Bakuriani market
- Do NOT delete any existing data — only INSERT new rows
- Use owner_id from an existing user or create a placeholder owner profile
