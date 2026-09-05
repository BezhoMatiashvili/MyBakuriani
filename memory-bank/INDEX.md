# MyBakuriani — memory-bank INDEX

Premium real-estate rental/sales + services marketplace for the Bakuriani ski
resort (mybakuriani.ge). **All user-facing text is Georgian (ქართული)**; the app
is trilingual (ka default, en, ru). Next.js 15 App Router + React 19 RSC, Supabase
(Postgres + RLS + Deno edge functions), Tailwind 4 / shadcn, Mapbox GL maps.

This file + `contracts.md` are auto-loaded every session (via `@import` in the root
`CLAUDE.md`). Everything else here is **read on demand** — open the area file and
contract sections that match what you're about to touch.

## Where "truth" lives

| Concern                     | Source of truth                             | Notes                                                                           |
| --------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------- |
| DB schema, enums, RPCs      | `supabase/migrations/*.sql`                 | `src/lib/types/database.ts` is **generated** from it — never hand-edit (see C3) |
| User-facing copy            | `messages/{ka,en,ru}.json`                  | ka is authoritative; keys must be parity across all 3 (C1)                      |
| Public i18n bundle scope    | `src/i18n/namespaces.ts:PUBLIC_NAMESPACES`  | guarded by `prebuild` (C1)                                                      |
| Supported locales / routing | `src/i18n/routing.ts:routing`               | echoed by middleware + request config (C2)                                      |
| Security headers / CSP      | `next.config.ts:CSP`                        | external hosts also need `remotePatterns` (C6)                                  |
| Money/booking/search logic  | `supabase/functions/**`                     | invoked by bare string name from the client (C4)                                |
| Design tokens               | Figma (`design.txt`, `.claude/prompts/…`)   | per root `CLAUDE.md`                                                            |
| Product spec                | `.claude/prompts/mybakuriani-full-build.md` | phases, node ids, Georgian copy                                                 |

## Areas

| Area | What it owns                                                                   | File                           |
| ---- | ------------------------------------------------------------------------------ | ------------------------------ |
| web  | App Router routes ( `src/app/[locale]/` ) + all React UI ( `src/components/` ) | [areas/web.md](areas/web.md)   |
| lib  | Supabase clients, hooks, data fetchers, domain utils ( `src/lib/` )            | [areas/lib.md](areas/lib.md)   |
| i18n | Locale routing, message catalogs, namespace scoping                            | [areas/i18n.md](areas/i18n.md) |
| api  | Next route handlers ( `src/app/api/` ) + server actions                        | [areas/api.md](areas/api.md)   |
| edge | Deno edge functions ( `supabase/functions/` )                                  | [areas/edge.md](areas/edge.md) |
| db   | Migrations + generated types (schema truth)                                    | [areas/db.md](areas/db.md)     |

Full symbol inventory (module → exports + import edges, regenerable):
[generated/symbols.md](generated/symbols.md).

## Top invariants (one line each — details in [contracts.md](contracts.md))

| #   | Invariant                                                                               | Breaks silently when                                                    |
| --- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| C1  | 3 message catalogs stay key-parallel; public namespaces listed in `PUBLIC_NAMESPACES`   | key added to one locale only / public component uses unlisted namespace |
| C2  | Locale set defined once in `routing.ts`, echoed by middleware + request import          | locale added without a `messages/<locale>.json`                         |
| C3  | Migrations are schema truth; `database.ts` is generated, not hand-edited                | migration not followed by a types regen                                 |
| C4  | `functions.invoke("name", body)` matches a Deno handler by string + shape               | function/body renamed on one side only                                  |
| C5  | Storage bucket ids agree across upload code, migration/RLS, remotePatterns/CSP          | bucket renamed in code but not migration/config                         |
| C6  | External hosts listed in **both** CSP and `remotePatterns`                              | new CDN/endpoint added to only one                                      |
| C7  | Realtime subscriptions require the table in `supabase_realtime` publication             | new subscription on a table not in the publication                      |
| C8  | `/create` + `/dashboard` gated in middleware; admin via auth helpers; RLS via role enum | new protected segment not added to `isProtected`                        |
| C9  | `favorites` rows reference property_id XOR service_id; both must be handled             | new favorites read/write path only handles `property_id`                |
| C19 | Notification `dashboard_scope` agrees across CHECK, TS union, writers, readers, badges  | a writer omits the scope → NULL row is invisible in every cabinet feed  |

## Pre-modification ritual

Before changing any symbol:

1. **Open the matching area file** ( `areas/<area>.md` ) — read its Blast radius.
2. **Scan `contracts.md`** — if the symbol appears in any contract's participating
   list, open that section and honor its "Also check" / "Breaks silently when".
3. **Grep the symbol repo-wide** ( `rg <symbol>` ) — string-keyed couplings
   (namespace names, bucket ids, `invoke` slugs, role strings) won't show up as
   imports.
4. After editing, if you touched a contract's participants, **update that contract
   section in the SAME session**, then run
   `python3 scripts/gen_code_map.py --check`.
5. **Never `git commit` without asking the user.**
