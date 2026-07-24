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

## Contracts touching this area

C3 (schema ↔ types), C5 (buckets/RLS), C7 (realtime publication), C8 (role enum +
RLS), C10 (discount badge duration/expiry — RPC + trigger; column on both
properties and services, only written on properties).
