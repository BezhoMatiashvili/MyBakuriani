# Area: web

App Router routes and all React UI.

## Roots

- `src/app/[locale]/` — every user-facing route, nested under the locale segment.
  Public: `apartments`, `hotels`, `sales`, `food`, `services`, `entertainment`,
  `transport`, `employment`, `blog`, `faq`, `contact`, `terms`, `privacy`,
  `search`, `_landing`, `checkout`. Auth-gated: `create/*`, `dashboard/*`, `auth/*`.
- `src/components/` — shared UI by concern: `booking`, `cards`, `calendar`,
  `detail`, `forms`, `layout`, `maps`, `search`, `admin`, `dashboard`, `renter`,
  `seller`, `guest`, `payments`, `notifications`, `shared`, `ui` (shadcn
  primitives).

## Responsibilities

- Server Components fetch via `lib` data helpers; Client Components (`"use client"`)
  own interactivity and call Supabase directly or `functions.invoke`.
- Route trees carry `layout.tsx` / `loading.tsx` / `error.tsx` and `metadata`
  exports (Georgian SEO — required on public pages).
- Every page must work at 375px+, 44px min touch targets.

## Blast radius

- A component that becomes client-reachable from a **public** route may pull in a
  new message namespace → must be added to `PUBLIC_NAMESPACES` (**C1**); `prebuild`
  will fail otherwise.
- Adding a top-level protected segment requires updating middleware `isProtected`
  (**C8**).
- `functions.invoke("…")` call sites in dashboard clients are the client half of
  **C4**.
- New external image host in any component → `next.config.ts` CSP + remotePatterns
  (**C5/C6**).

## Contracts touching this area

C1 (namespaces), C4 (invoke callers), C5 (uploads), C6 (image hosts), C7 (realtime
subscribers), C8 (protected routes).

## Note

`src/app/[locale]/appartments/` (double-p) exists alongside `apartments/` — likely
a legacy/redirect alias; confirm before assuming either is dead.

`src/components/layout/AdminTopbar.tsx` hosts the admin-wide global search
dropdown (debounced fetch to `/api/admin/search`; client results deep-link to
`/dashboard/admin/clients?q=…`, which the clients page reads via
`useSearchParams`).
