# Bug Report — Tester Findings (MyBakuriani)

## Context

A tester walked through the app (renter/landlord cabinet + public listing pages) and reported a set of confusing or broken behaviors, written in Georgian. This document translates each finding, verifies it against the actual code, classifies it (real bug vs. missing feature vs. UX/label issue), and pins the exact location + root cause so each can be fixed.

Every item below was confirmed by reading the source — no code was changed in producing this report.

**Legend:** 🔴 Bug (broken/incorrect) · 🟠 Missing feature (placeholder/mock) · 🟡 UX / label / clarity issue

---

## BUG-1 🔴 — Sale listing also appears in Rentals; renter "My Listings" not split by type

**Tester (ka):** "გაყიდვებში ავტვირთე ბინა და გაქირავებაშიც მიჩანს, ასე უნდა იყოს? ... ხომ არ უნდა იყოს სია გამიჯნული რომელი გაყიდვაა, რომელი გაქირავება?"
**Translation:** "I uploaded an apartment under _Sales_ and it also shows under _Rentals_. Should it? If so, shouldn't the list be split — which is a sale, which is a rental?"

**Verdict:** Real bug. The renter dashboard "My Listings" query is missing the `is_for_sale` filter, so sale listings leak into the rental management list.

**Data model:** Sale vs. rental is distinguished by `properties.is_for_sale` (boolean, default `false`) — `supabase/migrations/001_initial_schema.sql:59`. Sales use `sale_price`; rentals use `price_per_night`.

**Where it's correct (for reference):**

- `src/app/[locale]/sales/page.tsx:17-18` → `.eq("is_for_sale", true)`
- `src/app/[locale]/apartments/page.tsx:20` → `.eq("is_for_sale", false)`
- `src/app/[locale]/hotels/page.tsx:18` → `.eq("is_for_sale", false)`
- `src/app/[locale]/dashboard/seller/listings/page.tsx:40` → `.eq("is_for_sale", true)`
- `src/app/[locale]/search/page.tsx:54-58` and `supabase/functions/search/index.ts:127-129` → filter by mode

**Root cause — `src/app/[locale]/dashboard/renter/listings/page.tsx:50-54`:**

```ts
const { data } = await supabase
  .from("properties")
  .select("*")
  .eq("owner_id", user!.id) // ← no is_for_sale filter
  .order("created_at", { ascending: false });
```

Consequences:

- Sale listings appear in the renter's rental "My Listings" table.
- Price column renders `price_per_night` (NULL/0 for sales) → shows "0 ₾/ღამე" (`:217`).
- Only the View link is type-aware (`:242-244`), so the row itself is mislabeled as a rental.

**Fix direction:** Add `.eq("is_for_sale", false)` to the renter query — OR (per the tester's stronger suggestion) keep one combined list but **group/tab it by type** (Rentals vs. Sales) with type badges so the two are visually separated. See BUG-4 which is the same underlying complaint from the VIP/balance flow.

---

## BUG-2 🟠 — Guests database ("სტუმრების ბაზა") has no way to add guests; data is mocked

**Tester (ka):** "სტუმრების ბაზას დამატების ფუნქცია არ აქვს ან საიდან ჩნდებიან, იქნებ სხვა ადგილს არის."
**Translation:** "The guests database has no add function — or where do they appear from? Maybe it's elsewhere."

**Verdict:** Confirmed — the feature is a UI mockup with no backend.

**Location:** `src/app/[locale]/dashboard/renter/guests/page.tsx`

- Title "სტუმრების ბაზა" (`:58`), subtitle "თქვენი ლოიალური კლიენტები და შავი სია" (`:60-62`).
- `:18` explicit `// TODO: wire to real guests table — mock data matches Figma reference.`
- `:19-40` hardcoded guest array (e.g. "ნინო მახარაძე", a blacklisted "დავით გ.").

**Findings:**

- **No `guests` table exists** in any migration. Only `bookings` carries `guest_id` / `owner_id` / `guests_count` (`001_initial_schema.sql:87-102`).
- **No "Add guest" button** anywhere on the page; only two tabs ("ყველა" / "შავი სია") and per-row edit/block actions.
- **Edit/block buttons have no `onClick` handlers** — non-functional.
- **No API route** under `src/app/api/` for guests.
- Sidebar uses `labelKey: "guests"` (`src/components/layout/RenterSidebar.tsx:51`) but there is **no `guests` translation key** in `messages/*.json` → label likely renders untranslated.

**Fix direction (decide intended source):**

- Auto-populate from completed bookings (derive guest profiles via `bookings.guest_id` for the renter's properties), **and/or**
- Add a manual "Add Guest" button + modal that writes to a new `guests` table.

Either way: create the table + RLS, replace the mock array with a real query, wire edit/block, and add the `guests` i18n key.

---

## BUG-3 🟠 — Renter cabinet: adding/editing a cleaner does nothing (dead buttons + mock data)

**Tester (ka):** "გამქირავებლის კაბინეტში დამლაგებლის რედაქტირება არ მუშაობს და დამატებაც."
**Translation:** "In the landlord's cabinet, editing a cleaner doesn't work, and neither does adding."

**Verdict:** Confirmed — placeholder UI, zero backend wiring.

**Location:** `src/app/[locale]/dashboard/renter/cleaners/page.tsx`

- `:22` `// TODO: wire to real cleaners table — mock data matches Figma reference.`
- `:23-35` single hardcoded mock cleaner ("ნინო მაისურაძე").
- **Add button "დამატება" (`:60-66`)** — no `onClick`, does nothing.
- **Edit button "რედაქტირება" (`:101-106`)** — no `onClick`, does nothing.
- No add/edit modal or form exists. The only modal, `src/components/renter/CleanerDetailModal.tsx`, is read-only (its "გამოძახება"/call button also has no handler).

**Backend already exists** (so this is purely a frontend gap):

- Table `cleaning_tasks` — `001_initial_schema.sql:258-269` (`owner_id`, `cleaner_id`, `cleaning_type`, `scheduled_at`, `price`, `status`, `notes`).
- RLS permits renter insert/update — `002_rls_policies.sql:72-75` (owner can create/update tasks).

**Fix direction:** Build Add/Edit cleaner modals + form, fetch real cleaners (`profiles` where `role='cleaner'`), and wire the buttons to insert/update `cleaning_tasks` (owner_id = current renter). Replace the mock data. No e2e coverage currently exists for this page.

---

## BUG-4 🟡 — After VIP/Balance "activate": no confirmation, and listings show in one undifferentiated list

**Tester (ka):** "ბალანსი და ვიპში გააქტიურებას რომ აჭერ, ალბათ მერე იქნება განცხადება... გამოჩნდება ორივე, თუმცა ვერ გაიგებ რომელია გაქირავება და რომელი გაყიდვა — სათაურით თუ გაიგებ მხოლოდ. მგონი დაჯგუფდეს თემატურად უფრო კარგი იქნება."
**Translation:** "When you press _activate_ on Balance/VIP, the listing presumably shows up afterward — but both appear and you can't tell which is rental vs. sale, only by the title. I think grouping them thematically would be better."

**Verdict:** Two related issues — (a) weak post-purchase feedback, (b) the listing picker / list isn't grouped by type (same root complaint as BUG-1).

**Flow:** `src/app/[locale]/dashboard/renter/balance/page.tsx`

- Activate button "გააქტიურება" (`:280-284`); `handlePurchaseClick` (`:129-152`) opens `VipPropertyPickerModal` for VIP/Super-VIP (SMS packages call `purchase-vip` directly).
- `handleConfirmPurchase` (`:154-180`) invokes the `purchase-vip` edge function, then re-fetches transactions; balance updates live via Realtime (`:97-115`).
- **(a) Feedback gap:** only a "..." loading state on the button (`:283`); **no success toast/dialog**. The user must scroll to the transaction history to confirm anything happened — exactly the "probably it shows up later?" confusion.
- **(b) Grouping gap:** `src/components/renter/VipPropertyPickerModal.tsx` lists the owner's properties without separating sale vs. rental or showing a type badge — so you can only tell them apart by title. Same as BUG-1.

**Backend:** `supabase/functions/purchase-vip/index.ts` calls RPC `purchase_package` (`:53-61`) with a legacy `purchase_vip` fallback (`:79-88`); it returns the RPC response but the UI surfaces no explicit success message.

**Fix direction:** Add an explicit success/confirmation toast or modal after a successful purchase; in the property picker (and renter listings), group by type or add Rental/Sale badges.

---

## BUG-11 🟡 — "ადგილის ბრძოლა" is a confusing/mistranslated field label

**Tester (ka):** "ადგილის ბრძოლა რას გულისხმობს ვერ გავიხსენე."
**Translation:** "I couldn't figure out what 'place battle' (ადგილის ბრძოლა) means."

**Verdict:** Not a feature — it's a **mislabeled form field** in the manual "Add Booking" modal.

**Location:** `src/components/renter/AddBookingModal.tsx:126-133`

```tsx
<Field label="ადგილის ბრძოლა">
  <input ... placeholder="რა. #101" />   // value goes into `source`
</Field>
```

- The field feeds `source` in `AddBookingPayload` (`:7-13`, submitted at `:50`) — i.e. it's meant to capture the **booking source / channel / room reference** for a manually-logged booking.
- "ადგილის ბრძოლა" literally = "battle for the spot," which makes no sense here. It's a wrong/placeholder label.

**Fix direction:** Rename the label to match its purpose, e.g. "დაჯავშნის წყარო" (Booking source) or "ოთახი №" (Room №) — whichever matches intent — and fix the placeholder ("რა. #101" is also garbled, likely meant "ოთ. #101").

---

## BUG-12 🟡 — "შემდეგი 7 დღე დაკავებული" quick-action: hardcoded 7, and "weekends" label mismatch

**Tester (ka):** "შემდეგი 7 დღე დაკავებულია — საიდან 7 დღე? ან 7 რატომ და არა 6? ასევე მხოლოდ შაბათ-კვირას..."
**Translation:** "'Next 7 days are occupied' — where do 7 days come from? Why 7 and not 6? And why 'only weekends'?"

**Verdict:** Confirmed two label/clarity issues on the **owner calendar bulk-action bar** (not guest-facing, not real availability data).

**Location:** `src/components/calendar/BulkActionBar.tsx`

- **Block-next-7 (`:80-84`):**
  ```tsx
  { key: "block-next-7", label: "შემდეგი 7 დღე დაკავებული",
    compute: (dates) => ({ available: [], blocked: dates.slice(0, 7) }) }
  ```
  `dates.slice(0, 7)` hardcodes 7 with no rationale in code — it's a convenience shortcut to block the first 7 selected days. The "7" is arbitrary; nothing explains it to the user (hence the tester's confusion).
- **Weekends-only (`:66-77`):** label "მხოლოდ შაბათ-კვირა" ("only Sat–Sun"), but `compute` marks days where `isWeekend()` is true as available. `isWeekend` uses `WEEKEND_MON_INDICES = {4,5,6}` → **Friday, Saturday, Sunday** (`src/lib/utils/availability.ts:8`). So the label says "Sat–Sun" but the logic includes **Friday** too.

**Why Fri–Sun:** Intentional for a ski resort weekend window — but the label doesn't say so, creating a mismatch.

**Fix direction:**

- Clarify the 7-day action label/tooltip (e.g. "მომდევნო 7 დღის დაბლოკვა") and, if 7 is meant to be "the upcoming week," consider basing it on the actual week boundary rather than a blind `slice(0,7)`.
- Align the weekend label with the Fri–Sun logic (e.g. "პარ.–კვ.") or change the logic to match the label — pick one.

---

## Cross-cutting theme

Items 1, 2, 3, and 4b all stem from the **renter dashboard being partially Figma-mockup-only**: real DB tables/RLS exist for cleaners (`cleaning_tasks`) and bookings, but the renter pages still ship hardcoded mock arrays and dead buttons (`guests`, `cleaners`), plus a missing type filter on real listings. Worth treating as one "finish the renter cabinet" workstream.

---

## Triage priority

| ID     | Type | Effort | Notes                                                                |
| ------ | ---- | ------ | -------------------------------------------------------------------- |
| BUG-1  | 🔴   | Low    | One-line filter (or grouping). Backend ready.                        |
| BUG-3  | 🟠   | Medium | Backend (`cleaning_tasks` + RLS) ready; frontend wiring only.        |
| BUG-12 | 🟡   | Low    | Label/tooltip clarity + weekend label-vs-logic alignment.            |
| BUG-11 | 🟡   | Low    | Single label + placeholder rename.                                   |
| BUG-4  | 🟡   | Medium | Add success feedback; reuse BUG-1 grouping in picker.                |
| BUG-2  | 🟠   | High   | Needs new table + RLS + i18n + decide data source (auto vs. manual). |
