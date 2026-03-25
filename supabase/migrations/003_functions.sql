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
