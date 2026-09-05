# Area: db

Database schema, policies, and the generated type mirror.

## Roots

- `supabase/migrations/*.sql` — ~130 ordered migrations. Early numeric-prefixed
  (`001…014`), then timestamp-prefixed (`20260415…` onward). Cover schema, RLS,
  RPCs, triggers, seed data, storage buckets, realtime publication, and security
  hardening passes.
- `src/lib/types/database.ts` — **generated** TypeScript mirror of the live schema
  (tables, `Enums` incl. `user_role`, RPC signatures). Consumed via the `Database`
  generic everywhere.
- `supabase/config.toml`, `supabase/seed/`.

## Responsibilities

- Own the schema, the `user_role` enum (10 roles: guest, renter, seller, cleaner,
  food, entertainment, transport, employment, handyman, admin), RLS policies, and
  the RPCs edge functions / API routes call.
- Realtime: the `supabase_realtime` publication membership lives here (**C7**).
- Storage bucket creation + `storage.objects` RLS live here (**C5**).

## Blast radius

- **Any** schema/enum/RPC change must be followed by regenerating `database.ts`
  (**C3**) — otherwise TS silently compiles against a stale schema.
  `npx supabase gen types typescript --project-id <id> > src/lib/types/database.ts`.
- Migrations are append-only and ordered; never rewrite an applied migration —
  add a new one. Some historical numeric prefixes collide (two `004_`, two `014_`)
  — preserve existing names, don't renumber.
- Applied against remote (DigitalOcean App Platform's autodeploy only ships the
  Next.js app; migrations run via the Supabase CLI / MCP, same as before the
  2026-09-05 move off Vercel).
- Manual-booking deposits and verified SMS consent are append-only in
  `20260804140000_manual_booking_finance_verified_sms_consent.sql`; its RPC signatures
  intentionally preserve the ignored legacy consent argument (**C3**, **C18**).
- `20260804160000_restore_own_platform_cleaner_directory.sql` restores same-owner
  active cleaner discovery/task creation after a later security migration regressed it.
- `20260804170000_booking_create_marketing_consent_contract.sql` is the current
  seven-argument online-booking RPC contract; `20260804180000_food_discount_admin_review.sql`
  converts restaurant discounts into quoted, admin-reviewed requests whose charge and
  activation happen atomically only on approval.
- `20260804190000_cleaner_manual_tasks_realtime.sql` publishes personal cleaner
  tasks with full replica identity for the overview/schedule subscriptions.
- `20260808121000_public_services_transport_fields.sql` is the latest
  `public_services` restatement. It preserves the computed `has_active_discount`
  contract and appends the public transport-card fields `vehicle_make`,
  `transport_type`, `routes`, and `equipment`.
- `20260808200000_cleaner_slot_and_vip_exclusivity.sql` is the latest invariant
  migration: it serializes exact cleaner slots across platform/manual task tables
  and makes standard VIP/SUPER VIP mutually exclusive on properties and services
  without rewriting either purchase RPC signature (**C17**, **C23**).
- `20260808201000_restore_admin_pageview_analytics.sql` restores the admin overview
  RPC's public-traffic counters and adds a same-cohort `completed_7d` funnel stage;
  its additive return field is mirrored in `database.ts` (**C3**).
- `20260818120000_production_security_hardening.sql` narrows client policies to
  explicit roles, removes anonymous access to authorization helpers, fixes two
  auth init-plan predicates, and constrains `content-change-media` to private
  10 MiB JPEG/PNG/WebP uploads. `20260818121000_closed_table_privilege_hardening.sql`
  revokes every client table privilege (especially non-RLS-governed `TRUNCATE`)
  from the 13 intentional RLS/no-policy internal tables. Both are applied live.
- `20260819122000_cleaner_call_details_and_cancellation_consent.sql` is the current
  cleaner call-out contract: it persists the entered address, snapshots the
  server-derived selected service id/title plus price/unit, and adds
  `cancellation_requested` plus cleaner approval/refusal transitions (**C24**).
  It remains local until explicitly applied.
- **Adding an enum value is a two-transaction operation.** `ALTER TYPE … ADD
VALUE` may run inside a transaction, but the new label cannot be _evaluated_
  until that transaction commits (`check_safe_enum_use` → `55P04`). Put the
  `ADD VALUE` in its own migration file and anything that uses the label
  (backfill `UPDATE`, CHECK, default) in a second file, applied separately —
  `apply_migration` wraps each call in one transaction. End the enum migration
  with `notify pgrst, 'reload schema'`: PostgREST caches enum labels, so
  `?col=eq.<newvalue>` 400s until it reloads. Precedent:
  `20260724160000_property_type_add_land.sql` +
  `20260724160100_land_backfill.sql` (**C13**).
- An `ALTER COLUMN … TYPE` on a column referenced by a view requires dropping and
  recreating the view — and re-stating its grants and `security_invoker` setting.
  `public.public_properties` (created in
  `20260723000000_production_security_remediation.sql`) covers most listing
  columns, so most widenings hit this.

## Contracts touching this area

C3 (schema ↔ types), C5 (buckets/RLS), C7 (realtime publication), C8 (role enum +
RLS), C10 (discount badge duration/expiry — RPC + trigger; column on both
properties and services, only written on properties), C13 (`property_type` enum
fan-out — two-transaction add, 2 compile tripwires + 7 silent participants),
C20 (manual-booking soft cancellation, restore, audit, and SMS eligibility),
C21 (restaurant discount review, charging, and public ordering), C23 (standard
VIP/SUPER VIP exclusivity across both listing tables and purchase paths), C24
(cleaner call-out terms and consent-based cancellation).
