# MyBakuriani — Complete Build Prompt (A to Z)

> **Instructions**: This is a complete specification for building the MyBakuriani platform. Execute each phase sequentially. Use the Figma MCP tools (`get_design_context`, `get_screenshot`) to fetch exact designs before building each page. The Figma file key is `CmWL25icqZwDX4dtEqT5ZJ`.

---

## 1. PROJECT OVERVIEW

- **Name**: MyBakuriani (mybakuriani.ge)
- **Purpose**: Premium real estate rental/sales + services marketplace for Bakuriani ski resort, Georgia
- **Language**: Georgian (ქართული) — ALL UI text must be in Georgian
- **Domain**: mybakuriani.ge

### Tech Stack

- **Framework**: Next.js 14+ (App Router) + TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Phone OTP (+995 Georgian numbers)
- **Backend**: Supabase Edge Functions (Deno)
- **Storage**: Supabase Storage (property photos, avatars, documents)
- **Animations**: Framer Motion
- **Deployment**: Vercel + Supabase Cloud

### Figma Reference

- **File Key**: `CmWL25icqZwDX4dtEqT5ZJ`
- **How to use**: Before building ANY page, call `get_design_context` with the node ID from the reference table below. This gives you exact colors, spacing, typography, and layout. Example:
  ```
  get_design_context(fileKey: "CmWL25icqZwDX4dtEqT5ZJ", nodeId: "5:28676")
  ```
- If rate-limited, call `get_screenshot` instead for visual reference.

---

## 2. FIGMA NODE REFERENCE TABLE

Every page/frame in the design with its Figma node ID. **Always fetch the design before coding the page.**

### Public Pages

| Page                   | Route                   | Figma Node ID | Size      |
| ---------------------- | ----------------------- | ------------- | --------- |
| Main Landing           | `/`                     | `5:28676`     | 1280x7978 |
| Location Picker        | `/location`             | `5:29050`     | 1280x7978 |
| Calendar               | `/calendar`             | `5:29463`     | 1280x7978 |
| Filters                | `/filters`              | `5:29964`     | 1280x7978 |
| All Rental Apartments  | `/apartments`           | `5:30497`     | 1280x3605 |
| All Hotels             | `/hotels`               | `5:30639`     | 1280x3329 |
| Apartment Detail       | `/apartments/[id]`      | `5:33666`     | 1280x3633 |
| Search Results         | `/search`               | `5:33984`     | 1280x2629 |
| Sales Landing          | `/sales`                | `5:30772`     | 1280x3715 |
| Sales Variant 2        | `/sales` (alt)          | `5:31038`     | 1280x3715 |
| Sales Variant 3        | `/sales` (alt)          | `5:31292`     | 1280x2963 |
| Sales Variant 4        | `/sales` (alt)          | `5:31502`     | 1280x2963 |
| Sales Compact          | `/sales` (alt)          | `5:31794`     | 1280x2090 |
| Sales Detail           | `/sales/[id]`           | `5:31881`     | 1280x3715 |
| Entertainment          | `/entertainment`        | `5:32187`     | 1280x2063 |
| Entertainment Extended | `/entertainment` (alt)  | `5:32320`     | 1280x2975 |
| Services & Handymen    | `/services`             | `5:32445`     | 1280x2664 |
| Employment             | `/employment`           | `5:32558`     | 1280x2471 |
| Transport & Transfers  | `/transport`            | `5:32684`     | 1280x2757 |
| Food & Restaurants     | `/food`                 | `5:32804`     | 1280x2535 |
| Employment Detail      | `/employment/[id]`      | `5:32922`     | 1280x3361 |
| Services Detail        | `/services/[id]`        | `5:33240`     | 1280x1757 |
| Transport Detail 1     | `/transport/[id]`       | `5:33378`     | 1280x2020 |
| Transport Detail 2     | `/transport/[id]` (alt) | `5:33519`     | 1280x2063 |
| Footer                 | (shared component)      | `5:33185`     | 1280x548  |
| Navbar                 | (shared component)      | `5:35532`     | 1280x91   |

### Auth & Registration

| Page                | Route                  | Figma Node ID | Size     |
| ------------------- | ---------------------- | ------------- | -------- |
| Login / Register    | `/auth/login`          | `5:35779`     | 1280x852 |
| Registration Step 2 | `/auth/register/step2` | `5:35821`     | 1280x852 |
| Registration Step 3 | `/auth/register/step3` | `5:35845`     | 1280x852 |

### Listing Creation Forms

| Page                          | Route                    | Figma Node ID | Size      |
| ----------------------------- | ------------------------ | ------------- | --------- |
| Add Listing (Category Select) | `/create`                | `5:34113`     | 1280x1150 |
| Real Estate - Rent            | `/create/rental`         | `5:34143`     | 1280x1150 |
| Real Estate - Sale            | `/create/sale`           | `5:34234`     | 1280x1150 |
| Employment                    | `/create/employment`     | `5:34442`     | 1280x1150 |
| Services                      | `/create/service`        | `5:34624`     | 1280x1150 |
| Transport                     | `/create/transport`      | `5:34769`     | 1280x1150 |
| Food                          | `/create/food`           | `5:34919`     | 1280x1150 |
| Entertainment                 | `/create/entertainment`  | `5:35078`     | 1280x1150 |
| Rental Form Step 2            | `/create/rental` (step2) | `5:35293`     | 1280x1150 |
| Rental Form Step 3            | `/create/rental` (step3) | `5:35445`     | 1280x1150 |

### Admin Dashboard

| Page                | Route                            | Figma Node ID | Size     |
| ------------------- | -------------------------------- | ------------- | -------- |
| Admin Main (KPIs)   | `/dashboard/admin`               | `5:35538`     | 1280x852 |
| Clients             | `/dashboard/admin/clients`       | `5:35870`     | 1280x850 |
| Client Detail 1     | `/dashboard/admin/clients/[id]`  | `5:35989`     | 1280x850 |
| Client Detail 2     | (alt view)                       | `5:36068`     | 1280x850 |
| Listings Mgmt 1     | `/dashboard/admin/listings`      | `5:36164`     | 1280x851 |
| Listings Mgmt 2     | (alt view)                       | `5:36222`     | 1280x850 |
| Analytics 1         | `/dashboard/admin/analytics`     | `5:36292`     | 1280x850 |
| Analytics 2         | (alt view)                       | `5:36425`     | 1280x850 |
| Settings 1          | `/dashboard/admin/settings`      | `5:36547`     | 1280x851 |
| Settings 2          | (alt view)                       | `5:36654`     | 1280x851 |
| Reports             | `/dashboard/admin/reports`       | `5:36761`     | 1280x850 |
| Verifications 1     | `/dashboard/admin/verifications` | `5:36884`     | 1280x850 |
| Verifications 2     | (detail)                         | `5:36974`     | 1280x850 |
| Verification Detail | (expanded)                       | `5:37159`     | 1280x850 |

### Renter Dashboard (გამქირავებელი)

| Page                | Route                            | Figma Node ID | Size     |
| ------------------- | -------------------------------- | ------------- | -------- |
| Main Dashboard      | `/dashboard/renter`              | `5:37305`     | 1280x850 |
| Subscription Button | `/dashboard/renter/subscription` | `5:37451`     | 1280x850 |
| Subscription Step 2 | (continued)                      | `5:37635`     | 1280x850 |
| Smart Match         | `/dashboard/renter/smart-match`  | `5:37817`     | 1280x850 |
| Cabinet Switch      | (dropdown)                       | `5:37979`     | 1280x850 |
| Dropdown Menu       | (absolute overlay)               | `5:38130`     | 239x533  |
| Calendar            | `/dashboard/renter/calendar`     | `5:38154`     | 1280x850 |
| View 1              | (variant)                        | `5:38492`     | 1280x850 |
| View 2              | (variant)                        | `5:38829`     | 1280x850 |
| View 3              | (variant)                        | `5:38920`     | 1280x850 |
| View 4              | (variant)                        | `5:38997`     | 1280x850 |
| View 5              | (variant)                        | `5:39110`     | 1280x850 |
| View 6              | (variant)                        | `5:39245`     | 1280x850 |
| View 7              | (variant)                        | `5:39344`     | 1280x850 |
| View 8              | (variant)                        | `5:39535`     | 1280x850 |
| View 9              | (variant)                        | `5:39621`     | 1280x850 |
| Balance 1           | `/dashboard/renter/balance`      | `5:39782`     | 1280x850 |
| Balance 2           | (VIP purchase)                   | `5:39997`     | 1280x850 |
| Balance 3           | (Super VIP)                      | `5:40211`     | 1280x850 |
| Balance 4           | (SMS package)                    | `5:40426`     | 1280x850 |
| Balance 5           | (discount badge)                 | `5:40641`     | 1280x850 |

### Seller Dashboard (გამყიდველი)

| Page           | Route               | Figma Node ID | Size     |
| -------------- | ------------------- | ------------- | -------- |
| Seller Main    | `/dashboard/seller` | `5:40873`     | 1280x848 |
| Seller View 2  | (variant)           | `5:41059`     | 1280x850 |
| Seller View 3  | (variant)           | `5:41269`     | 1280x850 |
| Seller View 4  | (variant)           | `5:41383`     | 1280x850 |
| Seller View 5  | (variant)           | `5:41603`     | 1280x850 |
| Seller View 6  | (variant)           | `5:41671`     | 1280x850 |
| Seller View 7  | (variant)           | `5:41809`     | 1280x850 |
| Seller View 8  | (variant)           | `5:41979`     | 1280x851 |
| Seller View 9  | (variant)           | `5:42055`     | 1280x851 |
| Seller View 10 | (variant)           | `5:42236`     | 1280x851 |
| Seller View 11 | (variant)           | `5:42387`     | 1280x851 |
| Seller View 12 | (variant)           | `5:42549`     | 1280x851 |
| Seller View 13 | (variant)           | `5:42606`     | 1280x851 |

### Service Cabinets (Entertainment/Transport/Employment/Services)

| Page                   | Route                | Figma Node ID | Size     |
| ---------------------- | -------------------- | ------------- | -------- |
| Service Cabinet Main   | `/dashboard/service` | `5:42738`     | 1280x851 |
| Service Cabinet Page 2 | (extended)           | `5:42914`     | 1280x851 |
| Food Cabinet 1         | `/dashboard/food`    | `5:43110`     | 1280x849 |
| Food Cabinet 2         | (variant)            | `5:43223`     | 1280x849 |
| Service View 1         | (variant)            | `5:43309`     | 1280x851 |
| Service View 2         | (variant)            | `5:43420`     | 1280x851 |
| Modal Container        | (overlay)            | `5:43520`     | 640x599  |
| Service View 3         | (variant)            | `5:43569`     | 1280x851 |
| Service View 4         | (variant)            | `5:43734`     | 1280x851 |
| Service View 5         | (variant)            | `5:43794`     | 1280x851 |

### Guest Dashboard (სტუმრის კაბინეტი)

| Page         | Route              | Figma Node ID | Size     |
| ------------ | ------------------ | ------------- | -------- |
| Guest Main   | `/dashboard/guest` | `5:43922`     | 1280x850 |
| Guest View 2 | (variant)          | `5:43994`     | 1280x850 |
| Guest View 3 | (variant)          | `5:44198`     | 1280x850 |
| Guest View 4 | (variant)          | `5:44352`     | 1280x850 |
| Guest View 5 | (variant)          | `5:44614`     | 1280x850 |
| Guest View 6 | (variant)          | `5:44692`     | 1280x850 |

### Cleaner Dashboard (დამლაგებლის კაბინეტი)

| Page           | Route                | Figma Node ID | Size     |
| -------------- | -------------------- | ------------- | -------- |
| Cleaner Main   | `/dashboard/cleaner` | `5:44792`     | 1280x850 |
| Cleaner View 2 | (variant)            | `5:44888`     | 1280x850 |
| Cleaner View 3 | (variant)            | `5:45059`     | 1280x850 |

---

## 3. DATABASE SCHEMA (Supabase PostgreSQL)

Run these as Supabase migrations. Create each table with proper foreign keys, indexes, and timestamps.

### Migration: `001_initial_schema.sql`

```sql
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- for fuzzy text search

-- ENUM types
CREATE TYPE user_role AS ENUM ('guest', 'renter', 'seller', 'cleaner', 'food', 'entertainment', 'transport', 'employment', 'handyman', 'admin');
CREATE TYPE property_type AS ENUM ('apartment', 'cottage', 'hotel', 'studio', 'villa');
CREATE TYPE listing_status AS ENUM ('active', 'blocked', 'pending', 'draft');
CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'cancelled', 'completed');
CREATE TYPE verification_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE service_category AS ENUM ('transport', 'cleaning', 'food', 'entertainment', 'employment', 'handyman');
CREATE TYPE transaction_type AS ENUM ('topup', 'vip_boost', 'super_vip', 'sms_package', 'discount_badge', 'withdrawal', 'commission');
CREATE TYPE calendar_status AS ENUM ('available', 'booked', 'blocked');

-- Users (extends Supabase auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  role user_role NOT NULL DEFAULT 'guest',
  bio TEXT,
  rating NUMERIC(2,1) DEFAULT 0,
  response_time_minutes INT,
  is_verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Properties (rental & sale)
CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type property_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT NOT NULL, -- e.g. "დიდველი, კრისტალ რეზორტი"
  location_lat NUMERIC(10,7),
  location_lng NUMERIC(10,7),
  cadastral_code TEXT, -- e.g. "01008060403"
  area_sqm NUMERIC(6,1),
  rooms INT,
  bathrooms INT,
  capacity INT, -- max guests
  price_per_night NUMERIC(10,2), -- for rental
  sale_price NUMERIC(12,2), -- for sale
  currency TEXT DEFAULT '₾',
  amenities JSONB DEFAULT '[]', -- ["wifi", "parking", "ski_storage", "fireplace", "balcony", "pool", "spa", "restaurant"]
  photos TEXT[] DEFAULT '{}',
  status listing_status DEFAULT 'pending',
  is_vip BOOLEAN DEFAULT FALSE,
  is_super_vip BOOLEAN DEFAULT FALSE,
  vip_expires_at TIMESTAMPTZ,
  discount_percent INT DEFAULT 0,
  views_count INT DEFAULT 0,
  house_rules JSONB DEFAULT '{}', -- {"smoking": false, "pets": true, "check_in": "14:00", "check_out": "12:00"}
  min_booking_days INT DEFAULT 1,
  is_for_sale BOOLEAN DEFAULT FALSE,
  roi_percent NUMERIC(4,1),
  construction_status TEXT, -- "დასრულებული", "მშენებარე"
  developer TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_properties_owner ON properties(owner_id);
CREATE INDEX idx_properties_status ON properties(status);
CREATE INDEX idx_properties_type ON properties(type);
CREATE INDEX idx_properties_location ON properties USING gin(location gin_trgm_ops);
CREATE INDEX idx_properties_cadastral ON properties(cadastral_code);
CREATE INDEX idx_properties_price ON properties(price_per_night);

-- Calendar blocks (availability)
CREATE TABLE calendar_blocks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status calendar_status NOT NULL DEFAULT 'available',
  booking_id UUID,
  UNIQUE(property_id, date)
);

CREATE INDEX idx_calendar_property_date ON calendar_blocks(property_id, date);

-- Bookings
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES properties(id),
  guest_id UUID NOT NULL REFERENCES profiles(id),
  owner_id UUID NOT NULL REFERENCES profiles(id),
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  guests_count INT NOT NULL DEFAULT 1,
  status booking_status DEFAULT 'pending',
  total_price NUMERIC(10,2) NOT NULL,
  currency TEXT DEFAULT '₾',
  guest_message TEXT,
  owner_response TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bookings_guest ON bookings(guest_id);
CREATE INDEX idx_bookings_owner ON bookings(owner_id);
CREATE INDEX idx_bookings_property ON bookings(property_id);

-- Reviews
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES bookings(id),
  guest_id UUID NOT NULL REFERENCES profiles(id),
  rating NUMERIC(2,1) NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reviews_property ON reviews(property_id);

-- Services (transport, cleaning, food, entertainment, employment, handyman)
CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category service_category NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2),
  price_unit TEXT, -- "/ საათი", "/ მარშრუტი", etc.
  currency TEXT DEFAULT '₾',
  photos TEXT[] DEFAULT '{}',
  location TEXT,
  schedule TEXT, -- "09:00 - 21:00"
  phone TEXT,
  discount_percent INT DEFAULT 0,
  status listing_status DEFAULT 'pending',
  is_vip BOOLEAN DEFAULT FALSE,
  views_count INT DEFAULT 0,
  -- Transport-specific
  driver_name TEXT,
  vehicle_capacity INT,
  route TEXT,
  -- Food-specific
  cuisine_type TEXT,
  has_delivery BOOLEAN DEFAULT FALSE,
  operating_hours TEXT,
  menu JSONB,
  -- Employment-specific
  position TEXT,
  salary_range TEXT,
  experience_required TEXT,
  employment_schedule TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_services_category ON services(category);
CREATE INDEX idx_services_owner ON services(owner_id);
CREATE INDEX idx_services_status ON services(status);

-- Smart Match requests
CREATE TABLE smart_match_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  guest_id UUID NOT NULL REFERENCES profiles(id),
  check_in DATE,
  check_out DATE,
  budget_min NUMERIC(10,2),
  budget_max NUMERIC(10,2),
  guests_count INT,
  preferences JSONB DEFAULT '{}', -- {"rooms": 2, "amenities": ["wifi", "parking"]}
  status TEXT DEFAULT 'active', -- active, matched, expired
  matched_properties UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_smart_match_guest ON smart_match_requests(guest_id);

-- Balances
CREATE TABLE balances (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) DEFAULT 0,
  sms_remaining INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transactions
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  amount NUMERIC(10,2) NOT NULL, -- positive = credit, negative = debit
  type transaction_type NOT NULL,
  description TEXT,
  reference_id UUID, -- property_id or booking_id
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transactions_user ON transactions(user_id);
CREATE INDEX idx_transactions_created ON transactions(created_at DESC);

-- SMS Messages (in-platform messaging)
CREATE TABLE sms_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_user_id UUID NOT NULL REFERENCES profiles(id),
  to_user_id UUID NOT NULL REFERENCES profiles(id),
  property_id UUID REFERENCES properties(id),
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sms_from ON sms_messages(from_user_id);
CREATE INDEX idx_sms_to ON sms_messages(to_user_id);

-- Verifications
CREATE TABLE verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  property_id UUID REFERENCES properties(id),
  status verification_status DEFAULT 'pending',
  documents JSONB DEFAULT '[]', -- [{url, type, uploaded_at}]
  admin_notes TEXT,
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_verifications_status ON verifications(status);

-- Notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'booking', 'review', 'verification', 'smart_match', 'system'
  title TEXT NOT NULL,
  message TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  action_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);

-- Blog posts
CREATE TABLE blog_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  content TEXT NOT NULL,
  excerpt TEXT,
  image_url TEXT,
  author_id UUID REFERENCES profiles(id),
  published BOOLEAN DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cleaning tasks
CREATE TABLE cleaning_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES properties(id),
  owner_id UUID NOT NULL REFERENCES profiles(id),
  cleaner_id UUID REFERENCES profiles(id),
  cleaning_type TEXT NOT NULL, -- 'სტანდარტული', 'გენერალური'
  scheduled_at TIMESTAMPTZ NOT NULL,
  price NUMERIC(10,2),
  status TEXT DEFAULT 'pending', -- pending, accepted, in_progress, completed
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cleaning_cleaner ON cleaning_tasks(cleaner_id);
CREATE INDEX idx_cleaning_owner ON cleaning_tasks(owner_id);
```

### Migration: `002_rls_policies.sql`

```sql
-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE smart_match_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cleaning_tasks ENABLE ROW LEVEL SECURITY;

-- Profiles: public read, own write
CREATE POLICY "Profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Properties: public read active, owner CRUD
CREATE POLICY "Active properties are viewable" ON properties FOR SELECT USING (status = 'active' OR owner_id = auth.uid());
CREATE POLICY "Owners can insert properties" ON properties FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owners can update own properties" ON properties FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "Owners can delete own properties" ON properties FOR DELETE USING (owner_id = auth.uid());

-- Calendar: public read, owner write
CREATE POLICY "Calendar is viewable" ON calendar_blocks FOR SELECT USING (true);
CREATE POLICY "Owners can manage calendar" ON calendar_blocks FOR ALL USING (
  EXISTS (SELECT 1 FROM properties WHERE id = calendar_blocks.property_id AND owner_id = auth.uid())
);

-- Bookings: participants only
CREATE POLICY "Booking participants can view" ON bookings FOR SELECT USING (guest_id = auth.uid() OR owner_id = auth.uid());
CREATE POLICY "Guests can create bookings" ON bookings FOR INSERT WITH CHECK (guest_id = auth.uid());
CREATE POLICY "Participants can update bookings" ON bookings FOR UPDATE USING (guest_id = auth.uid() OR owner_id = auth.uid());

-- Reviews: public read, guest write
CREATE POLICY "Reviews are viewable" ON reviews FOR SELECT USING (true);
CREATE POLICY "Guests can write reviews" ON reviews FOR INSERT WITH CHECK (guest_id = auth.uid());

-- Services: public read active, owner CRUD
CREATE POLICY "Active services are viewable" ON services FOR SELECT USING (status = 'active' OR owner_id = auth.uid());
CREATE POLICY "Owners can manage services" ON services FOR ALL USING (owner_id = auth.uid());

-- Smart Match: own only
CREATE POLICY "Users see own requests" ON smart_match_requests FOR SELECT USING (guest_id = auth.uid());
CREATE POLICY "Users create own requests" ON smart_match_requests FOR INSERT WITH CHECK (guest_id = auth.uid());

-- Balances: own only
CREATE POLICY "Users see own balance" ON balances FOR SELECT USING (user_id = auth.uid());

-- Transactions: own only
CREATE POLICY "Users see own transactions" ON transactions FOR SELECT USING (user_id = auth.uid());

-- SMS: sender/receiver
CREATE POLICY "Message participants can view" ON sms_messages FOR SELECT USING (from_user_id = auth.uid() OR to_user_id = auth.uid());
CREATE POLICY "Users can send messages" ON sms_messages FOR INSERT WITH CHECK (from_user_id = auth.uid());

-- Verifications: own view, admin manage
CREATE POLICY "Users see own verifications" ON verifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can submit verifications" ON verifications FOR INSERT WITH CHECK (user_id = auth.uid());

-- Notifications: own only
CREATE POLICY "Users see own notifications" ON notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE USING (user_id = auth.uid());

-- Blog: public read
CREATE POLICY "Published posts are viewable" ON blog_posts FOR SELECT USING (published = true);

-- Cleaning tasks: owner & cleaner
CREATE POLICY "Cleaning task participants" ON cleaning_tasks FOR SELECT USING (owner_id = auth.uid() OR cleaner_id = auth.uid());
CREATE POLICY "Owners can create tasks" ON cleaning_tasks FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Participants can update tasks" ON cleaning_tasks FOR UPDATE USING (owner_id = auth.uid() OR cleaner_id = auth.uid());

-- Admin override policies (for users with admin role)
CREATE POLICY "Admins full access profiles" ON profiles FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admins full access properties" ON properties FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admins full access verifications" ON verifications FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admins full access bookings" ON bookings FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admins full access notifications" ON notifications FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
```

### Migration: `003_functions.sql`

```sql
-- Function to update property view count
CREATE OR REPLACE FUNCTION increment_views(prop_id UUID)
RETURNS VOID AS $$
  UPDATE properties SET views_count = views_count + 1 WHERE id = prop_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- Function to update property rating from reviews
CREATE OR REPLACE FUNCTION update_property_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE profiles SET rating = (
    SELECT COALESCE(AVG(r.rating), 0)
    FROM reviews r
    JOIN properties p ON r.property_id = p.id
    WHERE p.owner_id = (SELECT owner_id FROM properties WHERE id = NEW.property_id)
  )
  WHERE id = (SELECT owner_id FROM properties WHERE id = NEW.property_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_review_insert
  AFTER INSERT ON reviews
  FOR EACH ROW EXECUTE FUNCTION update_property_rating();

-- Function to create calendar blocks for booking
CREATE OR REPLACE FUNCTION create_booking_calendar_blocks()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO calendar_blocks (property_id, date, status, booking_id)
  SELECT NEW.property_id, d::date, 'booked', NEW.id
  FROM generate_series(NEW.check_in, NEW.check_out - INTERVAL '1 day', INTERVAL '1 day') d
  ON CONFLICT (property_id, date) DO UPDATE SET status = 'booked', booking_id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_booking_confirmed
  AFTER UPDATE ON bookings
  FOR EACH ROW
  WHEN (NEW.status = 'confirmed')
  EXECUTE FUNCTION create_booking_calendar_blocks();

-- Auto-create balance row for new users
CREATE OR REPLACE FUNCTION create_user_balance()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO balances (user_id, amount, sms_remaining)
  VALUES (NEW.id, 0, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_profile_created
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION create_user_balance();
```

---

## 4. SUPABASE EDGE FUNCTIONS

Create these in `supabase/functions/`:

### `search/index.ts`

Full-text search with filters: location, dates (check availability), price range, rooms, capacity, property type, cadastral code. Returns paginated results with distance sorting.

### `smart-match/index.ts`

Takes guest preferences (dates, budget, guests, amenities) and matches against available properties. Notifies matching property owners. Uses scoring algorithm (price match 40%, date availability 30%, amenity match 20%, rating 10%).

### `booking-create/index.ts`

Validates date availability, calculates total price, creates booking record, sends notifications to owner. Checks for conflicts with calendar_blocks.

### `booking-manage/index.ts`

Owner accepts/rejects bookings. On accept: updates calendar_blocks, sends confirmation to guest. On reject: sends rejection notification.

### `balance-topup/index.ts`

Placeholder for TBC bank integration. Creates transaction record, updates balance.

### `purchase-vip/index.ts`

Deducts from balance, sets is_vip/is_super_vip with expiration, creates transaction. VIP = 1.50₾/day, Super VIP = 5.00₾/24h, SMS package = 10.00₾/200 SMS, Discount badge = 1.00₾/day.

### `admin-stats/index.ts`

Aggregates KPI data: net revenue, search conversion rate, active listings count, avg response time, sales funnel metrics, market health indicators.

### `verify-listing/index.ts`

Admin approves/rejects verification. Updates verification status, property status, sends notification to user.

### `upload-photos/index.ts`

Uploads to Supabase Storage bucket `property-photos`. Validates file type/size. Returns public URLs.

---

## 5. SHARED COMPONENTS

Build these first — they're used across all pages. **Fetch Figma design for each before building.**

### Layout Components

- `Navbar` — Figma: `5:35532`. Logo "MyBakuriani", Georgian nav menu (ყველა განცხადება, როგორ მუშაობს, ვერიფიკაცია, ფასები), search icon, user avatar/login CTA. Sticky top, blur backdrop on scroll. Hamburger on mobile.
- `Footer` — Figma: `5:33185`. Three columns: პლატფორმა (platform links), სერვისები (service links), დახმარება (help links). Bottom bar with copyright.
- `DashboardLayout` — Sidebar with avatar, role badge, nav menu, SMS counter, search. Becomes bottom tab bar on mobile.

### Data Display

- `PropertyCard` — Photo with carousel dots, VIP/Super VIP badge, discount badge (-20%), title, location, price/night, rating stars, capacity icons
- `ServiceCard` — Photo, category badge, title, price, discount, location
- `StatCard` — Icon, Georgian label, large number, change % with colored arrow
- `ReviewCard` — Avatar circle with initials, name, date, star rating, quoted comment
- `SmartMatchCard` — AI badge, notification count, CTA button

### Form Components

- `SearchBox` — Complex: 4 fields (ლოკაცია, თარიღი, სტუმრები, საკადასტრო კოდი) with search button. Dark shadow. Figma: embedded in `5:28676`.
- `RentBuyToggle` — Pill toggle: "ქირაობა" / "ყიდვა-გაყიდვა" with slide animation
- `DateRangePicker` — Dual calendar, 3 states per day: თავისუფალი (green), დაკავებული (red), არჩეული (blue)
- `FilterPanel` — Accordion sections: price range slider, rooms selector, area range, amenity checkboxes, property type pills
- `ListingForm` — Multi-step with progress bar, category-specific fields

### Feedback

- `Modal` — Centered card with backdrop blur, scale-up entrance animation
- `BottomSheet` — Mobile-only slide-up sheet for filters/modals
- `Toast` — Slide-in from top-right, auto-dismiss
- `StatusBadge` — Color-coded: აქტიური (green), დაბლოკილი (red), მოლოდინში (amber), ვერიფიცირებული (blue)
- `DiscountBadge` — Absolute positioned red badge with "-20%" text
- `VIPBadge` — Gold gradient badge for VIP, purple for Super VIP
- `SkeletonCard` — Loading placeholder matching PropertyCard shape

---

## 6. PAGE-BY-PAGE BUILD INSTRUCTIONS

### Phase 1: Project Setup

1. `npx create-next-app@latest mybakuriani --typescript --tailwind --app --src-dir`
2. `npx shadcn@latest init` (New York style, Slate base, CSS variables)
3. Install: `framer-motion @supabase/supabase-js @supabase/ssr date-fns lucide-react`
4. Set up `src/lib/supabase/client.ts` (browser client) and `src/lib/supabase/server.ts` (server client)
5. Set up `src/lib/supabase/middleware.ts` for auth session refresh
6. Configure Georgian font (Noto Sans Georgian from Google Fonts) in `layout.tsx`
7. Set up Tailwind design tokens matching Figma colors

### Phase 2: Shared Components

Build all components from Section 5. Test each independently.

### Phase 3: Public Pages (fetch Figma for each!)

Build in this order:

1. **Main `/`** — Fetch `5:28676`. Hero section with mountain background, search box, rent/buy toggle, 4 dark status cards, hot offers carousel, SMART MATCH section, advertising banners (DIDVELI), Transport section, Services section, Entertainment section, Food section, Employment section, Hotels section, Apartments section, Blog section, Footer.
2. **Apartments `/apartments`** — Fetch `5:30497`. Grid of PropertyCards with filters sidebar.
3. **Apartment Detail `/apartments/[id]`** — Fetch `5:33666`. Photo gallery (lightbox), description, amenities grid, location with map, house rules, calendar availability, reviews list, booking sidebar (price, min stay, owner info, CTA).
4. **Hotels `/hotels`** — Fetch `5:30639`. Similar grid layout to apartments.
5. **Sales `/sales`** — Fetch `5:30772`. Investment stats header, ROI data, market research, property grid with investment filters.
6. **Sales Detail `/sales/[id]`** — Fetch `5:31881`. Property specs, ROI calculator, construction updates.
7. **Services pages** — Fetch respective nodes. Each category: grid listing + detail page.
8. **Search `/search`** — Fetch `5:33984`. Filter sidebar + results grid.

### Phase 4: Auth

1. **Login `/auth/login`** — Fetch `5:35779`. Phone input with +995 prefix, OTP verification, terms link.
2. **Register steps** — Fetch `5:35821`, `5:35845`. Profile details, role selection.
3. Implement Supabase Phone OTP flow with `supabase.auth.signInWithOtp({ phone })`.

### Phase 5: Listing Creation

1. **Category Select `/create`** — Fetch `5:34113`. Card grid: უძრავი ქონება-ქირაობა, გაყიდვა, დასაქმება, სერვისები, ტრანსპორტი, კვება, გართობა.
2. **Rental form** — Fetch `5:34143`, `5:35293`, `5:35445`. 3-step: basic info → photos/amenities → pricing/rules.
3. **Other forms** — Fetch respective nodes. Category-specific fields.

### Phase 6: Dashboards

#### Guest Dashboard

Fetch `5:43922` through `5:44692`. Pages: Main (welcome, smart match alerts, recently viewed), Bookings, Reviews, Profile.

#### Renter Dashboard

Fetch `5:37305` through `5:40641`. Pages: Main (income stats, listings, smart match), Calendar management, Balance (VIP/SMS purchase), Smart Match inbox, Profile, Settings.

#### Seller Dashboard

Fetch `5:40873` through `5:42606`. Pages: Main (sale listings, views, inquiries), Listing management.

#### Cleaner Dashboard

Fetch `5:44792` through `5:45059`. Pages: Main (active task, new calls), Schedule, Earnings.

#### Service Cabinet

Fetch `5:42738` through `5:43794`. Shared layout for food/entertainment/transport/employment providers.

#### Admin Dashboard

Fetch `5:35538` through `5:37159`. Pages: KPI overview (funnel chart, revenue, conversion), Verifications queue, Clients management, Listings management, Analytics, Settings.

### Phase 7: Edge Functions

Deploy all functions from Section 4. Wire up to frontend via API routes or direct Supabase client calls.

### Phase 8: Animations & Polish

Apply all animations from the list below to their respective components.

---

## 7. ANIMATIONS & INTERACTIONS

Apply these with Framer Motion and Tailwind transitions:

| Element            | Animation                               | Implementation                                                                                      |
| ------------------ | --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Page transitions   | Fade + slide up                         | `framer-motion` `AnimatePresence` in layout                                                         |
| Card hover         | Scale 1.02, shadow increase, image zoom | `hover:scale-[1.02] hover:shadow-xl transition-all duration-300` + `group-hover:scale-110` on image |
| Hero carousel      | Auto-play with snap scroll              | `framer-motion` drag + snap + autoplay interval                                                     |
| Search box focus   | Expand + dropdown slide                 | `focus-within:shadow-2xl transition-shadow` + `motion.div` animate height                           |
| Filter accordion   | Height expand                           | `framer-motion` layout animation                                                                    |
| Modal open         | Backdrop fade + card scale up           | `motion.div` initial={opacity:0, scale:0.95} animate={opacity:1, scale:1}                           |
| Sidebar collapse   | Slide left/right                        | `motion.aside` animate width + translateX                                                           |
| Notification badge | Pulse                                   | `animate-pulse` on badge dot                                                                        |
| Stat numbers       | Count up                                | Custom hook with `requestAnimationFrame`                                                            |
| Calendar dates     | Hover highlight                         | `hover:bg-blue-100 transition-colors`                                                               |
| Buttons            | Press scale                             | `active:scale-[0.97] transition-transform`                                                          |
| Skeleton loading   | Shimmer                                 | `animate-pulse bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200`                             |
| Toast              | Slide in from right                     | `motion.div` initial={x:100, opacity:0}                                                             |
| Scroll reveal      | Fade in up                              | Intersection Observer + `motion.div` initial={y:30, opacity:0}                                      |
| Toggle switch      | Slide + color                           | `motion.div` layoutId transition                                                                    |
| Gallery lightbox   | Zoom + fade                             | `motion.div` scale from thumbnail position                                                          |
| Mobile menu        | Slide from right                        | `motion.nav` initial={x:'100%'}                                                                     |
| Bottom sheet       | Slide up with drag                      | `motion.div` drag="y" dragConstraints                                                               |
| Discount badge     | Bounce in                               | `motion.span` initial={scale:0} animate={scale:1} spring                                            |

---

## 8. MOBILE RESPONSIVENESS

Every page must work perfectly on mobile (375px+). Key patterns:

- **Navbar**: Hamburger menu → full-screen slide-in nav on mobile
- **Search box**: Stack fields vertically, full-width on mobile
- **Property cards**: 1 column on mobile (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`)
- **Dashboard**: Sidebar → bottom tab navigation bar on mobile
- **Filters**: Slide-up bottom sheet on mobile instead of sidebar
- **Calendar**: Single month on mobile, dual on desktop
- **Detail pages**: Stack sidebar below content on mobile
- **Forms**: Full-width inputs, step indicator simplified
- **Modals**: Bottom sheet on mobile, centered on desktop
- **Tables**: Horizontal scroll or card view on mobile
- **Touch targets**: Minimum 44px tap targets everywhere
- **Carousels**: Swipe gesture support with `framer-motion` drag

---

## 9. DESIGN TOKENS

```typescript
// tailwind.config.ts extend
{
  colors: {
    primary: {
      DEFAULT: '#1a1a2e',  // Deep navy (dark sections, cards)
      light: '#16213e',
      dark: '#0f0f1a',
    },
    accent: {
      DEFAULT: '#3b82f6',  // Bright blue (CTAs, links)
      hover: '#2563eb',
      light: '#dbeafe',
    },
    success: '#22c55e',     // Verified, positive stats
    warning: '#f59e0b',     // Alerts, pending
    error: '#ef4444',       // Blocked, negative
    vip: {
      DEFAULT: '#f59e0b',   // Gold VIP badge
      super: '#8b5cf6',     // Purple Super VIP
    },
    surface: {
      DEFAULT: '#ffffff',
      muted: '#f8fafc',
      border: '#e2e8f0',
    },
  },
  fontFamily: {
    sans: ['Noto Sans Georgian', 'sans-serif'],
  },
  borderRadius: {
    card: '12px',
  },
  boxShadow: {
    card: '0 2px 8px rgba(0,0,0,0.08)',
    'card-hover': '0 8px 24px rgba(0,0,0,0.12)',
    search: '0 4px 20px rgba(0,0,0,0.15)',
  },
}
```

---

## 10. GEORGIAN TEXT REFERENCE

All UI labels must use these exact Georgian translations:

### Navigation

- ყველა განცხადება = All listings
- როგორ მუშაობს = How it works
- ვერიფიკაცია = Verification
- ფასები = Prices
- სერვისები = Services
- ტრანსფერი = Transfer
- თხილამურები = Skis
- ბურანები = Snowmobiles
- რესტორნები = Restaurants
- დახმარება = Help
- კონტაქტი = Contact
- ხშირად დასმული კითხვები = FAQ
- წესები და პირობები = Terms & conditions

### Main Page Sections

- ყველაზე სანდო გზამკვლევი ბაკურიანში = The most trusted guide in Bakuriani
- ცხელი შეთავაზებები = Hot offers
- მხოლოდ ვერიფიცირებული და სანდო მესაკუთრეები = Only verified and trusted owners
- სტუმრების მოთხოვნები = Guest requests
- ნახე რას ეძებენ ახლა = See what they're looking for now
- ტრანსპორტი და ტრანსფერები = Transport and transfers
- სერვისები და ხელოსნები = Services and handymen
- გართობა და აქტივობები = Entertainment and activities
- კვება & რესტორნები = Food & restaurants
- დასაქმება ბაკურიანში = Employment in Bakuriani
- სასტუმროები = Hotels
- აპარტამენტები და კოტეჯები = Apartments and cottages
- ბლოგი და სიახლეები = Blog and news

### Search & Filters

- ლოკაცია = Location
- თარიღი = Date
- სტუმრები = Guests
- საკადასტრო კოდით = By cadastral code
- ქირაობა = Rent
- ყიდვა-გაყიდვა = Buy-Sell
- ფასის მიხედვით = By price
- ოთახები = Rooms
- ფართობი = Area (m²)

### Dashboard

- გამარჯობა = Hello
- თვის შემოსავალი = Monthly income
- მისაღები (ვალი) = Receivable (debt)
- დატვირთულობა = Occupancy
- პროფილის ნახვები = Profile views
- ჩემი ობიექტები = My properties
- აქტიური = Active
- დაბლოკილი = Blocked
- მოლოდინში = Pending
- ვერიფიცირებული = Verified
- ბალანსი = Balance
- ტრანზაქციები = Transactions

### Booking

- თავისუფალი = Available
- დაკავებული = Occupied
- არჩეული = Selected
- / ღამე = / night
- მინ. ჯავშანი = Min. booking
- ვერიფიცირებული მესაკუთრე = Verified owner

### Footer

- პრემიუმ უძრავი ქონების და გაქირავების პლატფორმა ბაკურიანში = Premium real estate and rental platform in Bakuriani
- ჩვენ ვზრუნავთ თქვენს დაცულ დასვენებაზე = We care about your safe vacation

---

## 11. ENVIRONMENT VARIABLES

Create `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

---

## 12. FILE STRUCTURE

```
src/
├── app/
│   ├── layout.tsx                    # Root layout with Navbar, Footer, font
│   ├── page.tsx                      # Main landing page
│   ├── apartments/
│   │   ├── page.tsx                  # All apartments grid
│   │   └── [id]/page.tsx             # Apartment detail
│   ├── hotels/page.tsx
│   ├── sales/
│   │   ├── page.tsx                  # Investment landing
│   │   └── [id]/page.tsx             # Sale detail
│   ├── entertainment/
│   │   ├── page.tsx
│   │   └── [id]/page.tsx
│   ├── services/
│   │   ├── page.tsx
│   │   └── [id]/page.tsx
│   ├── employment/
│   │   ├── page.tsx
│   │   └── [id]/page.tsx
│   ├── transport/
│   │   ├── page.tsx
│   │   └── [id]/page.tsx
│   ├── food/
│   │   ├── page.tsx
│   │   └── [id]/page.tsx
│   ├── search/page.tsx
│   ├── blog/page.tsx
│   ├── faq/page.tsx
│   ├── terms/page.tsx
│   ├── auth/
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── create/
│   │   ├── page.tsx                  # Category selector
│   │   ├── rental/page.tsx
│   │   ├── sale/page.tsx
│   │   ├── employment/page.tsx
│   │   ├── service/page.tsx
│   │   ├── transport/page.tsx
│   │   ├── food/page.tsx
│   │   └── entertainment/page.tsx
│   └── dashboard/
│       ├── layout.tsx                # Dashboard layout with sidebar
│       ├── guest/
│       │   ├── page.tsx
│       │   ├── bookings/page.tsx
│       │   ├── reviews/page.tsx
│       │   └── profile/page.tsx
│       ├── renter/
│       │   ├── page.tsx
│       │   ├── listings/page.tsx
│       │   ├── calendar/page.tsx
│       │   ├── balance/page.tsx
│       │   ├── smart-match/page.tsx
│       │   └── profile/page.tsx
│       ├── seller/
│       │   ├── page.tsx
│       │   └── listings/page.tsx
│       ├── cleaner/
│       │   ├── page.tsx
│       │   ├── schedule/page.tsx
│       │   └── earnings/page.tsx
│       ├── service/
│       │   ├── page.tsx
│       │   └── orders/page.tsx
│       ├── food/
│       │   ├── page.tsx
│       │   └── orders/page.tsx
│       └── admin/
│           ├── page.tsx
│           ├── verifications/page.tsx
│           ├── clients/
│           │   ├── page.tsx
│           │   └── [id]/page.tsx
│           ├── listings/page.tsx
│           ├── analytics/page.tsx
│           └── settings/page.tsx
├── components/
│   ├── layout/
│   │   ├── Navbar.tsx
│   │   ├── Footer.tsx
│   │   ├── DashboardSidebar.tsx
│   │   └── MobileBottomNav.tsx
│   ├── cards/
│   │   ├── PropertyCard.tsx
│   │   ├── ServiceCard.tsx
│   │   ├── StatCard.tsx
│   │   ├── ReviewCard.tsx
│   │   ├── SmartMatchCard.tsx
│   │   └── SkeletonCard.tsx
│   ├── search/
│   │   ├── SearchBox.tsx
│   │   ├── FilterPanel.tsx
│   │   └── RentBuyToggle.tsx
│   ├── booking/
│   │   ├── DateRangePicker.tsx
│   │   ├── BookingSidebar.tsx
│   │   └── CalendarGrid.tsx
│   ├── forms/
│   │   ├── ListingForm.tsx
│   │   ├── PhotoUploader.tsx
│   │   └── PhoneInput.tsx
│   ├── ui/                           # shadcn/ui components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── input.tsx
│   │   ├── select.tsx
│   │   ├── sheet.tsx
│   │   ├── skeleton.tsx
│   │   ├── tabs.tsx
│   │   ├── toast.tsx
│   │   └── ...
│   └── shared/
│       ├── StatusBadge.tsx
│       ├── DiscountBadge.tsx
│       ├── VIPBadge.tsx
│       ├── Modal.tsx
│       ├── BottomSheet.tsx
│       └── ScrollReveal.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts
│   │   ├── server.ts
│   │   └── middleware.ts
│   ├── types/
│   │   └── database.ts               # Generated from Supabase
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useProfile.ts
│   │   ├── useProperties.ts
│   │   ├── useBookings.ts
│   │   ├── useBalance.ts
│   │   ├── useSmartMatch.ts
│   │   └── useNotifications.ts
│   └── utils/
│       ├── format.ts                  # Price formatting, date formatting
│       └── animations.ts             # Shared animation variants
├── middleware.ts                       # Auth middleware
└── styles/
    └── globals.css                    # Tailwind + Georgian font import
```

---

## 13. CRITICAL IMPLEMENTATION NOTES

1. **Always fetch Figma design before building a page** — use `get_design_context(fileKey: "CmWL25icqZwDX4dtEqT5ZJ", nodeId: "NODE_ID")` with the node IDs from the reference table in Section 2.

2. **Georgian text** — Copy exact Georgian strings from Section 10. Do NOT translate or transliterate. Use the exact Unicode Georgian characters.

3. **Phone auth** — Georgian numbers are +995 5XX XX XX XX format. Use Supabase `signInWithOtp({ phone: '+995...' })`.

4. **Currency** — Georgian Lari (₾). Always display as `X ₾` with the symbol after the number.

5. **Supabase types** — Generate TypeScript types from your Supabase schema: `npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/lib/types/database.ts`

6. **Image optimization** — Use Next.js `<Image>` component for all property photos. Store in Supabase Storage bucket `property-photos` with public access.

7. **SEO** — Every public page needs proper `metadata` export with Georgian titles and descriptions for Google indexing.

8. **Error boundaries** — Wrap each route segment with `error.tsx` and `loading.tsx` (with skeleton components).

9. **Middleware** — Protect `/dashboard/*` and `/create/*` routes. Redirect unauthenticated users to `/auth/login`.

10. **Real-time** — Use Supabase Realtime subscriptions for: new bookings (owner dashboard), new messages (SMS), new smart match requests, notification updates.
