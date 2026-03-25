# Agent 4: Property Pages — Apartments + Hotels + Sales

> **WAVE 2** — Run AFTER Agent 1 (foundation) has merged into main.

## YOUR FILES (you OWN these)

```
src/app/apartments/page.tsx
src/app/apartments/loading.tsx
src/app/apartments/[id]/page.tsx
src/app/apartments/[id]/loading.tsx
src/app/hotels/page.tsx
src/app/hotels/loading.tsx
src/app/sales/page.tsx
src/app/sales/loading.tsx
src/app/sales/[id]/page.tsx
src/app/sales/[id]/loading.tsx
```

## DO NOT TOUCH

- `src/components/**`, `src/lib/**` (Agent 1, already merged)
- `src/app/page.tsx` (Agent 3)
- `src/app/entertainment/**` through `src/app/food/**` (Agent 5)
- `src/app/auth/**`, `src/app/create/**` (Agent 6)
- `src/app/dashboard/**` (Agents 7-10)

## INSTRUCTIONS

**Fetch Figma design before each page:**

```
get_design_context(fileKey: "CmWL25icqZwDX4dtEqT5ZJ", nodeId: "NODE_ID")
```

### Page 1: All Apartments `/apartments` — Figma `5:30497`

- Grid of PropertyCards (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`)
- FilterPanel sidebar on desktop, BottomSheet on mobile
- Filters: location, price range, rooms, capacity, amenities, property type
- Sort: price, rating, newest
- Pagination
- Use `useProperties` hook with filters
- Each card links to `/apartments/[id]`

### Page 2: Apartment Detail `/apartments/[id]` — Figma `5:33666`

- **Photo gallery** — Lightbox with zoom. Main image + thumbnails. Framer Motion zoom transition.
- **Title + Location** — Property name, location text, rating stars
- **Description** — Full Georgian text
- **Amenities grid** — Icons for wifi, parking, ski_storage, fireplace, balcony, etc.
- **House rules** — Check-in/out times, smoking, pets policy
- **Location map** — Placeholder for Google Maps embed
- **Calendar availability** — CalendarGrid component showing available/booked dates
- **Reviews list** — ReviewCards with average rating
- **Booking sidebar** (sticky on desktop, bottom bar on mobile):
  - Price per night (X ₾ / ღამე)
  - DateRangePicker
  - Guest count selector
  - Total price calculation
  - "ჯავშანი" (Book) CTA button
  - Owner info: avatar, name, verified badge, response time
  - Min booking days display
- Call `increment_views` on page load
- SEO metadata with property title

### Page 3: All Hotels `/hotels` — Figma `5:30639`

- Similar grid layout to apartments
- Filter by: location, price range, rating, amenities
- PropertyCards filtered to type='hotel'

### Page 4: Sales Landing `/sales` — Figma `5:30772`

- **Investment header** — Market stats, ROI data
- **Market research section** — Charts placeholder, key metrics
- **Property grid** — Properties where `is_for_sale = true`
- Investment-specific filters: price range (sale_price), ROI, construction status, developer
- Each card shows sale_price, ROI %, construction status

### Page 5: Sale Detail `/sales/[id]` — Figma `5:31881`

- Photo gallery
- Property specs (area, rooms, cadastral code)
- **ROI calculator** — Input purchase price, expected rental income, see ROI %
- Construction status and updates
- Developer info
- Location + map
- Contact form / inquiry CTA

### Loading States

Each route gets a `loading.tsx` with SkeletonCard grids matching the page layout.

### SEO

```typescript
export const metadata = {
  title: "აპარტამენტები ბაკურიანში — MyBakuriani",
  description: "იქირავე აპარტამენტი ბაკურიანში...",
};
```

## ALL TEXT IN GEORGIAN

## FINISH

```bash
npm run build
```

Commit: "feat: apartments, hotels, and sales pages with detail views"

Output DONE when build passes.
