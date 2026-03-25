# Agent 8: Renter Dashboard + Seller Dashboard

> **WAVE 2** — Run AFTER Agent 1 (foundation) has merged into main.

## YOUR FILES (you OWN these)

```
src/app/dashboard/renter/page.tsx
src/app/dashboard/renter/listings/page.tsx
src/app/dashboard/renter/calendar/page.tsx
src/app/dashboard/renter/balance/page.tsx
src/app/dashboard/renter/smart-match/page.tsx
src/app/dashboard/renter/profile/page.tsx
src/app/dashboard/seller/page.tsx
src/app/dashboard/seller/listings/page.tsx
```

## DO NOT TOUCH

- `src/components/**`, `src/lib/**` (Agent 1)
- `src/app/dashboard/layout.tsx` (Agent 7)
- `src/app/dashboard/guest/**`, `src/app/dashboard/cleaner/**` (Agent 7)
- `src/app/dashboard/admin/**` (Agent 9)
- `src/app/dashboard/service/**`, `src/app/dashboard/food/**` (Agent 10)

## INSTRUCTIONS

**Fetch Figma before each page:**

```
get_design_context(fileKey: "CmWL25icqZwDX4dtEqT5ZJ", nodeId: "NODE_ID")
```

### Renter Dashboard (გამქირავებელი) — Figma `5:37305` through `5:40641`

**Main `/dashboard/renter`** — Figma `5:37305`

- StatCards row: თვის შემოსავალი (monthly income), მისაღები/ვალი (receivable), დატვირთულობა (occupancy %), პროფილის ნახვები (profile views)
- Stat count-up animation on load
- My properties list (mini PropertyCards)
- Recent bookings
- Smart Match notification badge
- Subscription status

**Listings `/dashboard/renter/listings`** — Figma variants

- Table/grid of owner's properties
- StatusBadge for each: აქტიური, დაბლოკილი, მოლოდინში
- VIP/Super VIP badges
- Actions: edit, toggle status, boost (VIP)
- Views count per listing

**Calendar `/dashboard/renter/calendar`** — Figma `5:38154` through `5:39621`

- CalendarGrid for each property (or property selector)
- Color-coded dates: თავისუფალი (green), დაკავებული (red), დაბლოკილი (gray)
- Click to block/unblock dates
- Booking details on hover/click
- Dual month view on desktop, single on mobile

**Balance `/dashboard/renter/balance`** — Figma `5:39782` through `5:40641`

- Current balance display (X ₾)
- Top-up button (placeholder for TBC bank)
- **VIP Purchase section** — Figma `5:39997`:
  - VIP boost: 1.50 ₾/დღე
  - Super VIP: 5.00 ₾/24 საათი
  - Property selector for boost
- **SMS Package** — Figma `5:40426`:
  - 10.00 ₾ / 200 SMS
  - Current SMS remaining display
- **Discount Badge** — Figma `5:40641`:
  - 1.00 ₾/დღე
  - Badge preview
- Transaction history table

**Smart Match `/dashboard/renter/smart-match`** — Figma `5:37817`

- Incoming match requests from guests
- Guest preferences: dates, budget, guests, amenities
- Match score display
- Accept/respond buttons
- Real-time notifications

**Profile `/dashboard/renter/profile`**

- Profile editing
- Subscription management — Figma `5:37451`, `5:37635`
- Verification status
- Settings

### Seller Dashboard (გამყიდველი) — Figma `5:40873` through `5:42606`

**Main `/dashboard/seller`** — Figma `5:40873`

- StatCards: active sale listings, total views, inquiries this month
- Sale property list with:
  - Sale price, ROI %, construction status
  - Views count
  - Inquiry count
- Recent inquiries/messages

**Listings `/dashboard/seller/listings`** — Figma variants

- Grid/table of sale properties
- Status management
- VIP boost options
- Edit property details
- View inquiries per listing

## ALL TEXT IN GEORGIAN

## FINISH

```bash
npm run build
```

Commit: "feat: renter dashboard (calendar, balance, smart-match) and seller dashboard"

Output DONE when build passes.
