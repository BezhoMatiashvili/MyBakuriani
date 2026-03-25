# Agent 3: Main Landing + Search + Blog + FAQ + Terms

> **WAVE 2** — Run AFTER Agent 1 (foundation) has merged into main.

## YOUR FILES (you OWN these)

```
src/app/page.tsx
src/app/search/page.tsx
src/app/blog/page.tsx
src/app/faq/page.tsx
src/app/terms/page.tsx
src/app/loading.tsx
src/app/error.tsx
```

## DO NOT TOUCH

- `src/components/**` (owned by Agent 1, already merged)
- `src/lib/**` (owned by Agent 1, already merged)
- `src/app/apartments/**` (Agent 4)
- `src/app/sales/**` (Agent 4)
- `src/app/hotels/**` (Agent 4)
- `src/app/entertainment/**`, `src/app/services/**`, `src/app/employment/**`, `src/app/transport/**`, `src/app/food/**` (Agent 5)
- `src/app/auth/**`, `src/app/create/**` (Agent 6)
- `src/app/dashboard/**` (Agents 7-10)
- `supabase/**` (Agent 2)

## INSTRUCTIONS

**IMPORTANT**: Before building each page, fetch the Figma design:

```
get_design_context(fileKey: "CmWL25icqZwDX4dtEqT5ZJ", nodeId: "NODE_ID")
```

### Page 1: Main Landing `/` — Figma `5:28676`

This is the most complex page (1280x7978). Sections in order:

1. **Hero** — Mountain background image, overlay gradient, main heading "ყველაზე სანდო გზამკვლევი ბაკურიანში", SearchBox component, RentBuyToggle
2. **4 Dark Status Cards** — Stats row (verified owners count, active listings, happy guests, years operating)
3. **Hot Offers Carousel** — "ცხელი შეთავაზებები" — horizontal scroll of PropertyCards with VIP badges, auto-play
4. **Smart Match Section** — "სტუმრების მოთხოვნები" / "ნახე რას ეძებენ ახლა" — SmartMatchCards
5. **Advertising Banner** — DIDVELI resort banner
6. **Transport Section** — "ტრანსპორტი და ტრანსფერები" — ServiceCards grid (transport category)
7. **Services Section** — "სერვისები და ხელოსნები" — ServiceCards grid
8. **Entertainment Section** — "გართობა და აქტივობები" — ServiceCards grid
9. **Food Section** — "კვება & რესტორნები" — ServiceCards grid
10. **Employment Section** — "დასაქმება ბაკურიანში" — ServiceCards grid
11. **Hotels Section** — "სასტუმროები" — PropertyCards grid
12. **Apartments Section** — "აპარტამენტები და კოტეჯები" — PropertyCards grid
13. **Blog Section** — "ბლოგი და სიახლეები" — Blog post cards
14. **Footer** (already in layout, but may need section-specific CTA above it)

Use ScrollReveal for each section. Use mock data for now (Supabase queries can be wired later).

### Page 2: Search `/search` — Figma `5:33984`

- FilterPanel sidebar (left) + results grid (right)
- URL query params for filters (location, dates, price range, rooms, type)
- PropertyCard grid for results
- Pagination
- Mobile: filters in BottomSheet, full-width results

### Page 3: Blog `/blog`

- Grid of blog post cards (image, title, excerpt, date)
- Simple layout, Georgian headings
- Mock data for now

### Page 4: FAQ `/faq`

- "ხშირად დასმული კითხვები" heading
- Accordion sections with Framer Motion height animation
- Common questions about rental, booking, verification, payment

### Page 5: Terms `/terms`

- "წესები და პირობები" heading
- Static Georgian legal text
- Simple prose layout

### SEO

Every page needs `metadata` export:

```typescript
export const metadata = {
  title: "MyBakuriani — ...",
  description: "...",
};
```

### Loading/Error

- `src/app/loading.tsx` — SkeletonCard grid
- `src/app/error.tsx` — Georgian error message with retry button

## ALL TEXT IN GEORGIAN

Use exact strings from spec Section 10.

## FINISH

```bash
npm run build
```

Commit: "feat: main landing page, search, blog, FAQ, and terms pages"

Output DONE when build passes.
