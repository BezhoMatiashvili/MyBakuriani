-- C61 follow-up: a placeholder DEFAULT so inserts may omit listing_number
-- (the generated Insert types then mark it optional). The value is never
-- stored: listing_number_guard() always assigns nextval() BEFORE INSERT.
-- Not nextval() itself: a column default runs with the inserting role's
-- rights, which would need a client grant on the sequence (C34).
ALTER TABLE public.properties ALTER COLUMN listing_number SET DEFAULT 0;
ALTER TABLE public.services ALTER COLUMN listing_number SET DEFAULT 0;
