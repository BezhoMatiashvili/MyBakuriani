# Agent 7: Dashboard Layout + Guest Dashboard + Cleaner Dashboard

> **WAVE 2** — Run AFTER Agent 1 (foundation) has merged into main.

## YOUR FILES (you OWN these)

```
src/app/dashboard/layout.tsx
src/app/dashboard/guest/page.tsx
src/app/dashboard/guest/bookings/page.tsx
src/app/dashboard/guest/reviews/page.tsx
src/app/dashboard/guest/profile/page.tsx
src/app/dashboard/cleaner/page.tsx
src/app/dashboard/cleaner/schedule/page.tsx
src/app/dashboard/cleaner/earnings/page.tsx
```

## DO NOT TOUCH

- `src/components/**`, `src/lib/**` (Agent 1)
- `src/app/dashboard/renter/**`, `src/app/dashboard/seller/**` (Agent 8)
- `src/app/dashboard/admin/**` (Agent 9)
- `src/app/dashboard/service/**`, `src/app/dashboard/food/**` (Agent 10)
- All other `src/app/` directories

## INSTRUCTIONS

**Fetch Figma before each page:**

```
get_design_context(fileKey: "CmWL25icqZwDX4dtEqT5ZJ", nodeId: "NODE_ID")
```

### Dashboard Layout `/dashboard/layout.tsx`

- DashboardSidebar on desktop (left side)
- MobileBottomNav on mobile (bottom tab bar)
- Role-based nav items (detect user role from profile)
- Avatar + display name at top
- SMS counter badge
- Search input
- Main content area to the right
- Cabinet switch dropdown (role switcher) — Figma `5:37979`, `5:38130`

### Guest Dashboard — Figma `5:43922` through `5:44692`

**Main `/dashboard/guest`** — Figma `5:43922`

- Welcome message: "გამარჯობა, {name}"
- Smart Match alerts (SmartMatchCards) — recent matches
- Recently viewed properties (PropertyCard row)
- Quick action buttons: browse, create smart match request

**Bookings `/dashboard/guest/bookings`** — Figma `5:43994`, `5:44198`

- Tabs: upcoming, past, cancelled
- Booking cards: property photo, title, dates, status badge, total price
- Click to expand: full booking details, owner contact, cancellation option
- Real-time updates via Supabase Realtime

**Reviews `/dashboard/guest/reviews`** — Figma `5:44352`

- List of reviews guest has written
- Option to write review for completed bookings
- Star rating selector + comment form

**Profile `/dashboard/guest/profile`** — Figma `5:44614`, `5:44692`

- Display name, phone, avatar
- Edit form
- Notification preferences
- Account settings

### Cleaner Dashboard — Figma `5:44792` through `5:45059`

**Main `/dashboard/cleaner`** — Figma `5:44792`

- Active task card (current cleaning assignment)
- New incoming calls/requests
- Quick stats: tasks completed this month, earnings
- Status toggle (available/busy)

**Schedule `/dashboard/cleaner/schedule`** — Figma `5:44888`

- Calendar view of scheduled cleanings
- Task cards with: property, owner, cleaning type (სტანდარტული/გენერალური), time, price
- Accept/decline incoming tasks

**Earnings `/dashboard/cleaner/earnings`** — Figma `5:45059`

- Monthly earnings chart
- Transaction list
- Total earned, pending payments

## ALL TEXT IN GEORGIAN

## FINISH

```bash
npm run build
```

Commit: "feat: dashboard layout, guest dashboard, and cleaner dashboard"

Output DONE when build passes.
