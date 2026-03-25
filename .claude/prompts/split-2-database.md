# Agent 2: Database Schema + Edge Functions

> **WAVE 1** — This agent runs in parallel with Agent 1. No file conflicts.

## YOUR FILES (you OWN these)

```
supabase/config.toml
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_rls_policies.sql
supabase/migrations/003_functions.sql
supabase/functions/search/index.ts
supabase/functions/smart-match/index.ts
supabase/functions/booking-create/index.ts
supabase/functions/booking-manage/index.ts
supabase/functions/balance-topup/index.ts
supabase/functions/purchase-vip/index.ts
supabase/functions/admin-stats/index.ts
supabase/functions/verify-listing/index.ts
supabase/functions/upload-photos/index.ts
```

## DO NOT TOUCH

- Everything in `src/` (owned by other agents)
- `package.json`, `tailwind.config.ts`, etc.

## INSTRUCTIONS

### Step 1: Apply database migrations via Supabase MCP

Use the Supabase MCP tool `apply_migration` to run each migration. If MCP is unavailable, create the SQL files locally.

### Migration 001: Initial Schema

```sql
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ENUM types
CREATE TYPE user_role AS ENUM ('guest', 'renter', 'seller', 'cleaner', 'food', 'entertainment', 'transport', 'employment', 'handyman', 'admin');
CREATE TYPE property_type AS ENUM ('apartment', 'cottage', 'hotel', 'studio', 'villa');
CREATE TYPE listing_status AS ENUM ('active', 'blocked', 'pending', 'draft');
CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'cancelled', 'completed');
CREATE TYPE verification_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE service_category AS ENUM ('transport', 'cleaning', 'food', 'entertainment', 'employment', 'handyman');
CREATE TYPE transaction_type AS ENUM ('topup', 'vip_boost', 'super_vip', 'sms_package', 'discount_badge', 'withdrawal', 'commission');
CREATE TYPE calendar_status AS ENUM ('available', 'booked', 'blocked');
```

Then create ALL tables exactly as specified in the build spec Section 3:

- profiles, properties, calendar_blocks, bookings, reviews, services
- smart_match_requests, balances, transactions, sms_messages
- verifications, notifications, blog_posts, cleaning_tasks

Include ALL indexes from the spec.

### Migration 002: RLS Policies

Enable RLS on all 14 tables. Create all policies exactly as in spec Section 3:

- Public read policies for profiles, properties (active), calendar_blocks, reviews, services (active), blog_posts (published)
- Owner CRUD for properties, services
- Participant access for bookings, sms_messages, cleaning_tasks
- Self-only for smart_match_requests, balances, transactions, notifications, verifications
- Admin override policies for profiles, properties, verifications, bookings, notifications

### Migration 003: Functions & Triggers

Create exactly:

- `increment_views(prop_id UUID)` — SQL function
- `update_property_rating()` — trigger after review insert
- `create_booking_calendar_blocks()` — trigger after booking confirmed
- `create_user_balance()` — trigger after profile created

### Step 2: Create Edge Functions

Create each edge function in `supabase/functions/`:

#### `search/index.ts`

Full-text search with filters: location (trigram), dates (check calendar_blocks availability), price range, rooms, capacity, property_type, cadastral_code. Paginated results. Distance sorting if lat/lng provided.

#### `smart-match/index.ts`

Scoring algorithm:

- Price match: 40% weight
- Date availability: 30% weight
- Amenity match: 20% weight
- Rating: 10% weight
  Takes guest preferences, returns matched properties, creates notifications for owners.

#### `booking-create/index.ts`

Validates: date availability (no conflicts in calendar_blocks), guest != owner, min_booking_days respected. Calculates total_price = nights \* price_per_night. Creates booking + notification.

#### `booking-manage/index.ts`

Owner accept: updates booking status, triggers calendar_blocks creation (via trigger), sends guest notification.
Owner reject: updates status, sends rejection notification.

#### `balance-topup/index.ts`

Placeholder for TBC bank. Creates transaction record (type='topup'), updates balance amount.

#### `purchase-vip/index.ts`

Pricing: VIP = 1.50₾/day, Super VIP = 5.00₾/24h, SMS package = 10.00₾/200 SMS, Discount badge = 1.00₾/day.
Validates balance >= cost. Deducts, sets flags + expiration, creates transaction.

#### `admin-stats/index.ts`

Aggregates: total revenue (SUM transactions), active listings (COUNT properties WHERE active), avg response time, search conversion, booking completion rate, new users this month.

#### `verify-listing/index.ts`

Admin-only. Updates verification status, property status on approval, creates notification to user.

#### `upload-photos/index.ts`

Validates: file type (jpg/png/webp), max size 5MB. Uploads to `property-photos` bucket. Returns public URLs.

### Step 3: Create Supabase Storage bucket

Use Supabase MCP or document that `property-photos` bucket needs to be created with public access.

## FINISH

Verify all SQL is valid. Commit: "feat: database schema, RLS policies, triggers, and edge functions"

Output DONE when complete.
