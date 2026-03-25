# Agent 1: Foundation — Project Setup + Shared Components + Hooks + Utils

> **WAVE 1** — This agent runs FIRST. All other page agents depend on this completing.

## YOUR FILES (you OWN these — create them all)

```
package.json, tsconfig.json, next.config.ts, tailwind.config.ts, postcss.config.mjs
.env.local (template only — no real keys)
src/app/layout.tsx
src/app/globals.css (or src/styles/globals.css)
src/lib/supabase/client.ts
src/lib/supabase/server.ts
src/lib/supabase/middleware.ts
src/middleware.ts
src/lib/types/database.ts
src/lib/hooks/useAuth.ts
src/lib/hooks/useProfile.ts
src/lib/hooks/useProperties.ts
src/lib/hooks/useBookings.ts
src/lib/hooks/useBalance.ts
src/lib/hooks/useSmartMatch.ts
src/lib/hooks/useNotifications.ts
src/lib/utils/format.ts
src/lib/utils/animations.ts
src/components/layout/Navbar.tsx
src/components/layout/Footer.tsx
src/components/layout/DashboardSidebar.tsx
src/components/layout/MobileBottomNav.tsx
src/components/cards/PropertyCard.tsx
src/components/cards/ServiceCard.tsx
src/components/cards/StatCard.tsx
src/components/cards/ReviewCard.tsx
src/components/cards/SmartMatchCard.tsx
src/components/cards/SkeletonCard.tsx
src/components/search/SearchBox.tsx
src/components/search/FilterPanel.tsx
src/components/search/RentBuyToggle.tsx
src/components/booking/DateRangePicker.tsx
src/components/booking/BookingSidebar.tsx
src/components/booking/CalendarGrid.tsx
src/components/forms/ListingForm.tsx
src/components/forms/PhotoUploader.tsx
src/components/forms/PhoneInput.tsx
src/components/shared/StatusBadge.tsx
src/components/shared/DiscountBadge.tsx
src/components/shared/VIPBadge.tsx
src/components/shared/Modal.tsx
src/components/shared/BottomSheet.tsx
src/components/shared/ScrollReveal.tsx
src/components/ui/* (shadcn/ui components)
```

## DO NOT TOUCH

- `supabase/**` (owned by Agent 2)
- `src/app/apartments/**`, `src/app/hotels/**`, `src/app/sales/**` (owned by Agent 4)
- `src/app/entertainment/**`, `src/app/services/**`, `src/app/employment/**`, `src/app/transport/**`, `src/app/food/**` (owned by Agent 5)
- `src/app/auth/**`, `src/app/create/**` (owned by Agent 6)
- `src/app/dashboard/**` (owned by Agents 7-10)
- `src/app/search/**`, `src/app/blog/**`, `src/app/faq/**`, `src/app/terms/**` (owned by Agent 3)

## INSTRUCTIONS

### Step 1: Create Next.js project

```bash
npx create-next-app@latest . --typescript --tailwind --app --src-dir --no-git
```

(Use `--no-git` since we already have a git repo)

### Step 2: Install dependencies

```bash
npm install framer-motion @supabase/supabase-js @supabase/ssr date-fns lucide-react
npx shadcn@latest init
```

Choose: New York style, Slate base, CSS variables.

Install shadcn components:

```bash
npx shadcn@latest add button card dialog dropdown-menu input select sheet skeleton tabs toast
```

### Step 3: Configure Tailwind design tokens

In `tailwind.config.ts`, extend with these exact tokens:

```typescript
colors: {
  primary: { DEFAULT: '#1a1a2e', light: '#16213e', dark: '#0f0f1a' },
  accent: { DEFAULT: '#3b82f6', hover: '#2563eb', light: '#dbeafe' },
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  vip: { DEFAULT: '#f59e0b', super: '#8b5cf6' },
  surface: { DEFAULT: '#ffffff', muted: '#f8fafc', border: '#e2e8f0' },
},
fontFamily: { sans: ['Noto Sans Georgian', 'sans-serif'] },
borderRadius: { card: '12px' },
boxShadow: {
  card: '0 2px 8px rgba(0,0,0,0.08)',
  'card-hover': '0 8px 24px rgba(0,0,0,0.12)',
  search: '0 4px 20px rgba(0,0,0,0.15)',
},
```

### Step 4: Set up globals.css

Import Noto Sans Georgian from Google Fonts. Set up Tailwind base/components/utilities.

### Step 5: Root layout (`src/app/layout.tsx`)

- Georgian HTML lang="ka"
- Noto Sans Georgian font
- Metadata: title "MyBakuriani — პრემიუმ გაქირავება ბაკურიანში"
- Include Navbar and Footer in layout

### Step 6: Supabase client setup

- `src/lib/supabase/client.ts` — browser client using `createBrowserClient`
- `src/lib/supabase/server.ts` — server client using `createServerClient` with cookies
- `src/lib/supabase/middleware.ts` — session refresh middleware helper

### Step 7: Auth middleware (`src/middleware.ts`)

- Protect `/dashboard/*` and `/create/*` routes
- Redirect unauthenticated users to `/auth/login`
- Use Supabase middleware helper for session refresh

### Step 8: TypeScript types (`src/lib/types/database.ts`)

Create manual type definitions matching the database schema from the spec (all tables: profiles, properties, calendar_blocks, bookings, reviews, services, smart_match_requests, balances, transactions, sms_messages, verifications, notifications, blog_posts, cleaning_tasks). Include all enums.

### Step 9: Hooks

Create all hooks with Supabase client integration:

- `useAuth` — signInWithOtp, signOut, session state
- `useProfile` — fetch/update profile
- `useProperties` — list, filter, single property fetch
- `useBookings` — list, create, manage bookings
- `useBalance` — fetch balance, topup
- `useSmartMatch` — create/view match requests
- `useNotifications` — fetch, mark read, real-time subscription

### Step 10: Utils

- `format.ts` — price formatting (X ₾), date formatting with Georgian locale
- `animations.ts` — Framer Motion variants (fadeIn, slideUp, scaleIn, staggerChildren)

### Step 11: Shared Components

**Fetch Figma designs before building!** Use `get_design_context(fileKey: "CmWL25icqZwDX4dtEqT5ZJ", nodeId: "NODE_ID")`.

**Layout:**

- `Navbar` — Figma `5:35532`. Logo "MyBakuriani", Georgian nav (ყველა განცხადება, როგორ მუშაობს, ვერიფიკაცია, ფასები), search icon, user avatar. Sticky, blur backdrop. Hamburger on mobile.
- `Footer` — Figma `5:33185`. Three columns: პლატფორმა, სერვისები, დახმარება. Copyright bar.
- `DashboardSidebar` — Avatar, role badge, nav menu, SMS counter. Collapsible.
- `MobileBottomNav` — Tab bar for dashboard on mobile.

**Cards:**

- `PropertyCard` — Photo carousel, VIP/Super VIP badge, discount badge, title, location, price/night, rating, capacity
- `ServiceCard` — Photo, category badge, title, price, discount, location
- `StatCard` — Icon, Georgian label, large number, change % arrow
- `ReviewCard` — Avatar initials, name, date, stars, comment
- `SmartMatchCard` — AI badge, notification count, CTA
- `SkeletonCard` — Shimmer loading placeholder

**Search:**

- `SearchBox` — 4 fields (ლოკაცია, თარიღი, სტუმრები, საკადასტრო კოდი) + search button. Figma embedded in `5:28676`.
- `FilterPanel` — Accordion: price range, rooms, area, amenities, property type
- `RentBuyToggle` — Pill toggle: "ქირაობა" / "ყიდვა-გაყიდვა"

**Booking:**

- `DateRangePicker` — Dual calendar, 3 states: თავისუფალი (green), დაკავებული (red), არჩეული (blue)
- `BookingSidebar` — Price, min stay, owner info, CTA
- `CalendarGrid` — Month grid with status colors

**Forms:**

- `ListingForm` — Multi-step with progress bar
- `PhotoUploader` — Drag-drop, preview, Supabase Storage upload
- `PhoneInput` — +995 prefix, Georgian format

**Shared:**

- `StatusBadge` — აქტიური (green), დაბლოკილი (red), მოლოდინში (amber), ვერიფიცირებული (blue)
- `DiscountBadge` — Red badge "-20%"
- `VIPBadge` — Gold gradient VIP, purple Super VIP
- `Modal` — Backdrop blur, scale-up animation
- `BottomSheet` — Mobile slide-up with drag
- `ScrollReveal` — Intersection Observer fade-in-up

### Step 12: Create a placeholder `src/app/page.tsx`

Simple placeholder that imports Navbar/Footer to verify layout works.

## ALL TEXT MUST BE IN GEORGIAN

Use exact strings from spec Section 10. Do NOT translate or transliterate.

## ANIMATIONS

Apply Framer Motion animations per spec Section 7 to all components.

## MOBILE

All components must be responsive (375px+). See spec Section 8.

## FINISH

```bash
npm run build
```

Fix any build errors. Commit: "feat: foundation — project setup, shared components, hooks, utils"

Output DONE when build passes.
