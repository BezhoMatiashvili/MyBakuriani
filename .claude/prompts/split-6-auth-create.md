# Agent 6: Auth + Listing Creation Forms

> **WAVE 2** — Run AFTER Agent 1 (foundation) has merged into main.

## YOUR FILES (you OWN these)

```
src/app/auth/login/page.tsx
src/app/auth/register/page.tsx
src/app/auth/callback/route.ts
src/app/create/page.tsx
src/app/create/rental/page.tsx
src/app/create/sale/page.tsx
src/app/create/employment/page.tsx
src/app/create/service/page.tsx
src/app/create/transport/page.tsx
src/app/create/food/page.tsx
src/app/create/entertainment/page.tsx
```

## DO NOT TOUCH

- `src/components/**`, `src/lib/**`, `src/middleware.ts` (Agent 1)
- All other `src/app/` directories (other agents)

## INSTRUCTIONS

**Fetch Figma before each page:**

```
get_design_context(fileKey: "CmWL25icqZwDX4dtEqT5ZJ", nodeId: "NODE_ID")
```

### Auth: Login `/auth/login` — Figma `5:35779`

- PhoneInput with +995 prefix (Georgian format: +995 5XX XX XX XX)
- Step 1: Enter phone number → call `supabase.auth.signInWithOtp({ phone })`
- Step 2: OTP verification input (6 digits) → call `supabase.auth.verifyOtp({ phone, token, type: 'sms' })`
- Terms & conditions link
- Clean centered card layout
- Loading state on submit

### Auth: Register `/auth/register` — Figma `5:35821`, `5:35845`

- Step 2 (after OTP): Profile details
  - Display name
  - Avatar upload (PhotoUploader)
  - Bio
- Step 3: Role selection
  - Card grid: სტუმარი (guest), გამქირავებელი (renter), გამყიდველი (seller), etc.
  - Each card has icon + Georgian label
  - Creates profile record in Supabase

### Auth: Callback `/auth/callback/route.ts`

- Exchange auth code for session
- Redirect to dashboard based on role

### Create: Category Select `/create` — Figma `5:34113`

- Card grid for listing categories:
  - უძრავი ქონება — ქირაობა (Real estate — Rent)
  - უძრავი ქონება — გაყიდვა (Real estate — Sale)
  - დასაქმება (Employment)
  - სერვისები (Services)
  - ტრანსპორტი (Transport)
  - კვება (Food)
  - გართობა (Entertainment)
- Each card links to its form page

### Create: Rental Form `/create/rental` — Figma `5:34143`, `5:35293`, `5:35445`

3-step form using ListingForm component:

**Step 1: Basic Info**

- Property type selector (apartment, cottage, hotel, studio, villa)
- Title, description
- Location (text + future map picker)
- Cadastral code
- Area (m²), rooms, bathrooms, capacity

**Step 2: Photos & Amenities**

- PhotoUploader (drag-drop, max 10 photos)
- Amenities checklist: wifi, parking, ski_storage, fireplace, balcony, pool, spa, restaurant
- House rules: smoking, pets, check-in time, check-out time

**Step 3: Pricing & Rules**

- Price per night (₾)
- Min booking days
- Discount percent (optional)
- Preview card showing how listing will look
- Submit → creates property with status='pending'

### Create: Sale Form `/create/sale` — Figma `5:34234`

Similar to rental but with:

- Sale price instead of nightly price
- ROI percent
- Construction status
- Developer name
- `is_for_sale = true`

### Create: Employment `/create/employment` — Figma `5:34442`

- Position, description
- Salary range
- Experience required
- Schedule
- Contact phone

### Create: Service `/create/service` — Figma `5:34624`

- Service title, description
- Category (cleaning, handyman, etc.)
- Price + unit
- Schedule
- Photos
- Contact

### Create: Transport `/create/transport` — Figma `5:34769`

- Driver name, vehicle info
- Route
- Vehicle capacity
- Price + unit
- Schedule

### Create: Food `/create/food` — Figma `5:34919`

- Restaurant name, description
- Cuisine type
- Menu (JSONB editor — simple form)
- Has delivery toggle
- Operating hours
- Photos

### Create: Entertainment `/create/entertainment` — Figma `5:35078`

- Activity name, description
- Price + unit
- Schedule
- Location
- Photos

## ALL TEXT IN GEORGIAN

## FINISH

```bash
npm run build
```

Commit: "feat: auth flow (phone OTP) and all listing creation forms"

Output DONE when build passes.
