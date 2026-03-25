# Agent 5: Service Category Pages — Entertainment, Services, Employment, Transport, Food

> **WAVE 2** — Run AFTER Agent 1 (foundation) has merged into main.

## YOUR FILES (you OWN these)

```
src/app/entertainment/page.tsx
src/app/entertainment/[id]/page.tsx
src/app/entertainment/loading.tsx
src/app/services/page.tsx
src/app/services/[id]/page.tsx
src/app/services/loading.tsx
src/app/employment/page.tsx
src/app/employment/[id]/page.tsx
src/app/employment/loading.tsx
src/app/transport/page.tsx
src/app/transport/[id]/page.tsx
src/app/transport/loading.tsx
src/app/food/page.tsx
src/app/food/[id]/page.tsx
src/app/food/loading.tsx
```

## DO NOT TOUCH

- `src/components/**`, `src/lib/**` (Agent 1)
- `src/app/page.tsx`, `src/app/search/**` (Agent 3)
- `src/app/apartments/**`, `src/app/hotels/**`, `src/app/sales/**` (Agent 4)
- `src/app/auth/**`, `src/app/create/**` (Agent 6)
- `src/app/dashboard/**` (Agents 7-10)

## INSTRUCTIONS

**Fetch Figma before each page:**

```
get_design_context(fileKey: "CmWL25icqZwDX4dtEqT5ZJ", nodeId: "NODE_ID")
```

### Entertainment `/entertainment` — Figma `5:32187`

- Grid of ServiceCards filtered to category='entertainment'
- Activities: skiing, snowmobiles, horse riding, etc.
- Filter by: price, activity type
- **Detail page** `/entertainment/[id]` — Photos, description, schedule, pricing, location, contact

### Services & Handymen `/services` — Figma `5:32445`

- "სერვისები და ხელოსნები" heading
- Grid of ServiceCards: cleaning, repairs, maintenance
- Filter by: service type, price range
- **Detail page** `/services/[id]` — Figma `5:33240` — Service description, pricing, schedule, owner info, contact

### Employment `/employment` — Figma `5:32558`

- "დასაქმება ბაკურიანში" heading
- Job listing cards: position, salary range, schedule, experience required
- Filter by: position type, salary range
- **Detail page** `/employment/[id]` — Figma `5:32922` — Full job description, requirements, salary, schedule, how to apply

### Transport `/transport` — Figma `5:32684`

- "ტრანსპორტი და ტრანსფერები" heading
- ServiceCards: drivers, routes, vehicles
- Filter by: route, capacity, price
- **Detail page** `/transport/[id]` — Figma `5:33378` — Driver info, vehicle details, route, capacity, pricing, booking CTA

### Food & Restaurants `/food` — Figma `5:32804`

- "კვება & რესტორნები" heading
- Restaurant/food service cards: cuisine type, delivery, operating hours
- Filter by: cuisine, delivery availability, price range
- **Detail page** — Menu display (from JSONB), operating hours, location, delivery info, contact

### Pattern for ALL service pages

Each listing page follows the same pattern:

1. Georgian heading
2. Filter bar (category-specific filters)
3. ServiceCard grid (responsive: 1/2/3/4 columns)
4. Pagination
5. Loading skeleton states

Each detail page:

1. Photo gallery
2. Title + category badge
3. Description
4. Category-specific info (schedule, pricing, menu, etc.)
5. Location
6. Contact / inquiry CTA
7. SEO metadata

## ALL TEXT IN GEORGIAN

## FINISH

```bash
npm run build
```

Commit: "feat: entertainment, services, employment, transport, and food pages"

Output DONE when build passes.
