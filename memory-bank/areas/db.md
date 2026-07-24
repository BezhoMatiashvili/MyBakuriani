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
- `public.road_conditions` — single-row-per-route live road status (public read,
  admin/service write). Written every 30 min by the `road-condition-refresh` edge
  function; read + overlaid onto the landing "road" status card by
  `src/lib/road-condition/server.ts` (`getRoadCondition` / `withLiveRoad`), same
  live-overlay pattern as the weather card.

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
- Applied against remote (Hobby auto-deploy is Vercel-only; migrations run via the
  Supabase CLI / MCP).
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
fan-out — two-transaction add, 2 compile tripwires + 7 silent participants).
