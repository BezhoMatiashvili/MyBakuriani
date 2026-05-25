# Tester Bug Report — MyBakuriani

**Date:** 2026-05-25
**Source:** Manual tester feedback (Georgian), analyzed against the codebase.
**Scope:** Each reported issue was investigated in source and verified. All 8 findings below
are confirmed real issues. This document is a report only — no code is changed by it.

---

## Summary

| #   | Tester complaint                                                | Type                                      | Severity    | Confirmed |
| --- | --------------------------------------------------------------- | ----------------------------------------- | ----------- | --------- |
| 1   | Sale apartment also shows in rentals                            | Logic bug (missing query filter)          | High        | ✅        |
| 2   | Lists don't distinguish sale vs rental                          | UX gap (no type badge)                    | Medium      | ✅        |
| 3   | Guests database has no "add" function                           | Unimplemented feature (mock data)         | High        | ✅        |
| 4   | Cleaner add/edit doesn't work in renter cabinet                 | Unimplemented feature (dead buttons)      | High        | ✅        |
| 5   | VIP activation list mixes sale+rental, only title distinguishes | UX gap + data dropped                     | Medium      | ✅        |
| 6   | "ადგილის ბრძოლა" — unclear what it means                        | Mislabeled field + unwired form           | Medium      | ✅        |
| 7   | "Next 7 days booked" — why 7?                                   | Arbitrary hardcoded value, no explanation | Low         | ✅        |
| 8   | "weekends only" but behaves oddly                               | Label says Sat–Sun, code includes Friday  | Low (label) | ✅        |

> Note on tester numbering: the tester's notes were numbered loosely (jumping to 11 and 12).
> The items map as: 11 → Bug 6 ("ადგილის ბრძოლა"), 12 → Bugs 7 & 8 ("next 7 days" + weekends).

---

## BUG 1 — Sale listings leak into the renter dashboard

**Tester (ka):** "გაყიდვებში ავტვირთე ბინა და გაქირავებაშიც მიჩანს, ასე უნდა იყოს?"
**Tester (en):** "I uploaded an apartment under Sales and it also shows up in Rentals — is that intended?"

**Severity:** High — listings appear where they should not.

**Analysis.** Listing type is stored on the `properties` table via the `is_for_sale` boolean
(`supabase/migrations/001_initial_schema.sql:59`). The creation forms set it correctly:

- Sale form → `is_for_sale: true` (`src/app/[locale]/create/sale/page.tsx:146`)
- Rental form → `is_for_sale: false` (`src/app/[locale]/create/rental/page.tsx:352`)

All **public** pages and the seller dashboard filter correctly:

- `src/app/[locale]/apartments/page.tsx:17-24` → `.eq("is_for_sale", false)`
- `src/app/[locale]/sales/page.tsx:14-21` → `.eq("is_for_sale", true)`
- `src/app/[locale]/dashboard/seller/page.tsx:39-45` → `.eq("is_for_sale", true)`
- `supabase/functions/search/index.ts:126-129` → respects the `is_for_sale` param

**Root cause.** The **renter dashboard** properties query has **no type filter**:

```ts
// src/app/[locale]/dashboard/renter/page.tsx:92-96
supabase
  .from("properties")
  .select("*")
  .eq("owner_id", user!.id)
  .order("created_at", { ascending: false }),   // ← missing .eq("is_for_sale", false)
```

So a renter who also created a sale listing sees that sale listing inside the rental (renter)
cabinet.

**Recommended fix.** Add `.eq("is_for_sale", false)` to the renter dashboard properties query.
Audit other renter-side listing queries for the same omission (see Bug 5, which fetches all
owner properties for the VIP picker).

---

## BUG 2 — No visual sale/rental distinction in listing lists

**Tester (ka):** "ხომ არ უნდა იყოს სია გამიჯნული რომელი გაყიდვაა, რომელი გაქირავება?"
**Tester (en):** "Shouldn't the list be separated — which is a sale, which is a rental?"

**Severity:** Medium — clarity/UX.

**Analysis.** Dashboard listing cards (renter and seller) reuse the same markup and render no
type badge or label derived from `is_for_sale`. Even once Bug 1 is fixed, a user managing a mix
of listings has no at-a-glance way to tell sale from rental.

**Recommended fix.** Add a small badge ("გაყიდვა" / "გაქირავება") to listing cards, driven by
`is_for_sale`, and/or group the list by type. Pairs naturally with Bugs 1 and 5.

---

## BUG 3 — Guests database is a non-functional mock

**Tester (ka):** "სტუმრების ბაზას დამატების ფუნქცია არ აქვს, ან საიდან ჩნდებიან?"
**Tester (en):** "The guests database has no add function — or where do the guests come from?"

**Severity:** High — feature appears present but does nothing.

**Analysis.** `src/app/[locale]/dashboard/renter/guests/page.tsx` is a UI stub:

- Line 18: `// TODO: wire to real guests table — mock data matches Figma reference.`
- Lines 18-40: hardcoded `MOCK_GUESTS` array.
- Lines 47-49: filtered only by an in-memory `blacklisted` flag.

There is **no add-guest button or form**, no Supabase query, and **no `guests` table** in the
schema. Realistically, guests should derive from the `bookings` table (where `owner_id` is the
renter) and/or the `smart_match_*` flow — but nothing is wired.

**Recommended fix.** Decide the source of truth: auto-populate from `bookings`, and/or introduce
a guest table with an add/edit form. Until then the page is purely cosmetic.

---

## BUG 4 — Cleaner add/edit is non-functional in the renter cabinet

**Tester (ka):** "გამქირავებლის კაბინეტში დამლაგებლის რედაქტირება არ მუშაობს და დამატებაც."
**Tester (en):** "In the renter cabinet, editing the cleaner doesn't work, and adding doesn't either."

**Severity:** High — buttons present but dead.

**Analysis.** `src/app/[locale]/dashboard/renter/cleaners/page.tsx`:

- Line 22: `// TODO: wire to real cleaners table — mock data matches Figma reference.`
- "დამატება" (Add) button, lines 60-66 — **no `onClick` handler**.
- "რედაქტირება" (Edit) button, lines 101-106 — **no `onClick` handler**.

`src/components/renter/CleanerDetailModal.tsx` is view-only; its "გამოძახება" (Call) and
"პროფილი" (Profile) buttons also have no handlers.

There is **no renter↔cleaner relationship table** (only `cleaning_tasks` with a `cleaner_id` FK
to `profiles`), no `/api/cleaners/*` routes, and no insert/update mutations anywhere.

**Recommended fix.** Define a renter-cleaner table with RLS, add create/update mutations (API or
direct Supabase), and wire the Add/Edit buttons. Currently the feature is entirely unimplemented.

---

## BUG 5 — VIP activation picker mixes sale + rental with no distinction

**Tester (ka):** "ბალანსსა და ვიპში გააქტიურებას რომ აჭერ, ორივე გამოჩნდება, თუმცა ვერ გაიგებ
რომელი გაქირავებაა და რომელი გაყიდვა — მხოლოდ სათაურით. სჯობს თემატურად დაჯგუფდეს."
**Tester (en):** "When you press activate on VIP, both appear, but you can't tell which is rental
and which is sale — only by the title. Better to group them thematically."

**Severity:** Medium — clarity/UX; risk of promoting the wrong listing.

**Analysis.** Flow: `src/app/[locale]/dashboard/renter/balance/page.tsx` →
`src/components/renter/VipPropertyPickerModal.tsx`.

- The balance page fetches **all** owner properties with no type filter
  (`balance/page.tsx:82-86`).
- The mapping into the picker **drops `is_for_sale`** — only id/title/subtitle/photoUrl are
  passed (`balance/page.tsx:371-376`).
- The picker's `PickerProperty` interface has no type field
  (`VipPropertyPickerModal.tsx:9-14`), and each row renders only title + location, with no badge
  or grouping (`VipPropertyPickerModal.tsx:110-166`).

So the data needed to distinguish types is fetched but thrown away before render.

**Recommended fix.** Carry `is_for_sale` through the mapping, add a type badge per row, and
section/group the list by type (rentals vs sales).

---

## BUG 6 — "ადგილის ბრძოლა" is a mislabeled (and unwired) field

**Tester (ka):** "ადგილის ბრძოლა რას გულისხმობს, ვერ გავიგე."
**Tester (en):** "I couldn't figure out what 'place battle' means."

**Severity:** Medium — confusing label on a field that also doesn't persist.

**Analysis.** `src/components/renter/AddBookingModal.tsx:126` renders a text input labeled
**"ადგილის ბრძოლა"** (literally "battle of place"), bound to a `source` state with placeholder
`"რა. #101"`. The intent is clearly a **booking source / room reference** (e.g. "Room #101"),
not a "battle" — the label is a mistranslation/placeholder that was never corrected.

Compounding it, where the modal is mounted in
`src/app/[locale]/dashboard/renter/calendar/page.tsx`, the form has no working `onSubmit`, so the
value would not persist even if the label were correct.

**Recommended fix.** Relabel to something meaningful (e.g. "ჯავშნის წყარო / ოთახი") and wire the
modal's submit handler.

---

## BUG 7 — "Next 7 days booked" is an arbitrary hardcoded value

**Tester (ka):** "შემდეგი 7 დღე დაკავებულია — საიდან 7 დღე? რატომ 7 და არა 6?"
**Tester (en):** "The next 7 days are booked — where do 7 days come from? Why 7 and not 6?"

**Severity:** Low — clarity, not breakage.

**Analysis.** `src/components/calendar/BulkActionBar.tsx:80-84` defines a `block-next-7` bulk
action:

```ts
{
  key: "block-next-7",
  label: "შემდეგი 7 დღე დაკავებული",
  icon: <CalendarClock className="size-4" />,
  compute: (dates) => ({ available: [], blocked: dates.slice(0, 7) }),
}
```

The "7" is a blind `slice(0, 7)` of the first 7 actionable dates in the visible window — it is
not tied to a real week boundary, and there is no comment, tooltip, or label explaining it.

**Clarification for the tester:** this is a **bulk action the renter clicks** to block dates, not
an automatic "the next 7 days are occupied" state. The tester likely conflated it with the
adjacent weekend toggle (Bug 8).

**Recommended fix.** Either anchor it to a real "next 1 week" boundary, make the count
configurable, or relabel/explain the button.

---

## BUG 8 — "Weekends only" label doesn't match the code's weekend definition

**Tester (ka):** "...ასევე მხოლოდ შაბათ-კვირას და ა.შ."
**Tester (en):** "...also only weekends, etc."

**Severity:** Low — misleading label, behavior is intentional.

**Analysis.** `src/lib/utils/availability.ts:8` defines:

```ts
export const WEEKEND_MON_INDICES: ReadonlySet<number> = new Set([4, 5, 6]); // Fri, Sat, Sun
```

The bulk-action button is labeled **"მხოლოდ შაბათ-კვირა"** ("Sat–Sun only")
(`BulkActionBar.tsx:66-77`), but the weekend set includes **Friday**. A code comment
(`availability.ts:2`) states Fri–Sun is **intentional** for the ski-resort tourist week — so this
is a **misleading label**, not a logic bug.

**Recommended fix.** Update the label to reflect Fri–Sun (e.g. "პარ.–კვ.") or add a clarifying
note so the included Friday isn't surprising.

---

## Follow-up

Fixes for Bugs 1–6 involve code and (for 3, 4) schema changes, and are separate work requiring
approval before implementation. Bugs 7–8 are low-risk copy/UX tweaks. Bug 1 is the only
clear-cut data-correctness defect and is the smallest fix (one `.eq` clause).
