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
