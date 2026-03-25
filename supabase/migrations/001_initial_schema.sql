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
  location TEXT NOT NULL,
  location_lat NUMERIC(10,7),
  location_lng NUMERIC(10,7),
  cadastral_code TEXT,
  area_sqm NUMERIC(6,1),
  rooms INT,
  bathrooms INT,
  capacity INT,
  price_per_night NUMERIC(10,2),
  sale_price NUMERIC(12,2),
  currency TEXT DEFAULT '₾',
  amenities JSONB DEFAULT '[]',
  photos TEXT[] DEFAULT '{}',
  status listing_status DEFAULT 'pending',
  is_vip BOOLEAN DEFAULT FALSE,
  is_super_vip BOOLEAN DEFAULT FALSE,
  vip_expires_at TIMESTAMPTZ,
  discount_percent INT DEFAULT 0,
  views_count INT DEFAULT 0,
  house_rules JSONB DEFAULT '{}',
  min_booking_days INT DEFAULT 1,
  is_for_sale BOOLEAN DEFAULT FALSE,
  roi_percent NUMERIC(4,1),
  construction_status TEXT,
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
  price_unit TEXT,
  currency TEXT DEFAULT '₾',
  photos TEXT[] DEFAULT '{}',
  location TEXT,
  schedule TEXT,
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
  preferences JSONB DEFAULT '{}',
  status TEXT DEFAULT 'active',
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
  amount NUMERIC(10,2) NOT NULL,
  type transaction_type NOT NULL,
  description TEXT,
  reference_id UUID,
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
  documents JSONB DEFAULT '[]',
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
  type TEXT NOT NULL,
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
  cleaning_type TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  price NUMERIC(10,2),
  status TEXT DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cleaning_cleaner ON cleaning_tasks(cleaner_id);
CREATE INDEX idx_cleaning_owner ON cleaning_tasks(owner_id);
