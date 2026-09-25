-- Clear discounts that can never expire.
--
-- The 2026 price list (MyBakuriani_ფასების_ცხრილი_და_განმარტებები_2026.docx, §2.2)
-- sells the discount badge for 24 hours (2.50 ₾). The retired legacy purchase path
-- (purchase_vip RPC's discount_badge branch, reachable through the purchase-vip
-- edge function until its `purchase_type` fallback was removed on 2026-09-25) set
-- discount_percent WITHOUT discount_expires_at, and isDiscountActive() treats a
-- NULL expiry as active — so those listings advertise a discount forever. The
-- landing "ცხელი შეთავაზებები" section now also lists discounted listings, so a
-- permanent badge would pin a listing there indefinitely.
--
-- Staging at authoring time: 4 properties (3 sales, 1 rental), 0 services, each
-- traced to legacy 1 ₾ "ფასდაკლების ბეჯი (1 დღე)" discount_badge transactions.
-- The live purchase paths (purchase_package's discount tier,
-- self_service_activate_menu_item_discount for menu items) always write an
-- expiry, but admin tooling (ListingAuditPanel → /api/admin/listings/update) can
-- still set discount_percent WITHOUT one. On PROD, list the affected rows and
-- check each for a matching discount_badge transaction before applying: keep
-- admin-granted discounts out of this cleanup, and remember paid rows may belong
-- to real users.

UPDATE public.properties
SET discount_percent = 0,
    updated_at = now()
WHERE discount_percent > 0
  AND discount_expires_at IS NULL;

UPDATE public.services
SET discount_percent = 0,
    updated_at = now()
WHERE discount_percent > 0
  AND discount_expires_at IS NULL;
