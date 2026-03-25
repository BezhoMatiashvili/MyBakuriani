# Agent 9: Admin Dashboard

> **WAVE 2** — Run AFTER Agent 1 (foundation) has merged into main.

## YOUR FILES (you OWN these)

```
src/app/dashboard/admin/page.tsx
src/app/dashboard/admin/verifications/page.tsx
src/app/dashboard/admin/clients/page.tsx
src/app/dashboard/admin/clients/[id]/page.tsx
src/app/dashboard/admin/listings/page.tsx
src/app/dashboard/admin/analytics/page.tsx
src/app/dashboard/admin/settings/page.tsx
```

## DO NOT TOUCH

- `src/components/**`, `src/lib/**` (Agent 1)
- `src/app/dashboard/layout.tsx` (Agent 7)
- All other `src/app/dashboard/` subdirectories (Agents 7, 8, 10)

## INSTRUCTIONS

**Fetch Figma before each page:**

```
get_design_context(fileKey: "CmWL25icqZwDX4dtEqT5ZJ", nodeId: "NODE_ID")
```

### Admin Main `/dashboard/admin` — Figma `5:35538`

- **KPI Overview** — StatCards row:
  - Net revenue (₾)
  - Search → booking conversion rate (%)
  - Active listings count
  - Average response time (minutes)
- **Sales Funnel Chart** — Placeholder chart showing: views → searches → bookings → completed
- **Market Health Indicators** — occupancy rate, average price trends
- Quick links to all admin sections

### Verifications `/dashboard/admin/verifications` — Figma `5:36884`, `5:36974`, `5:37159`

- **Queue table** — All pending verifications
  - Columns: user, property, submitted date, status
  - StatusBadge for each
- **Detail view** (click to expand or navigate):
  - User info: name, phone, role, registration date
  - Property details
  - Uploaded documents (view/download)
  - Admin notes input
  - Approve / Reject buttons
  - History of verification decisions
- Filter by status: pending, approved, rejected

### Clients `/dashboard/admin/clients` — Figma `5:35870`

- **Client table** — All registered users
  - Columns: name, phone, role, registration date, verified status, listings count, last active
  - Search by name/phone
  - Filter by role
  - Sort by any column
- **Pagination**

### Client Detail `/dashboard/admin/clients/[id]` — Figma `5:35989`, `5:36068`

- Full profile view
- Listings owned by this user
- Booking history
- Transaction history
- Verification history
- Admin actions: change role, block/unblock, send notification
- Notes

### Listings Management `/dashboard/admin/listings` — Figma `5:36164`, `5:36222`

- **All listings table** — properties + services
  - Columns: title, owner, type, status, views, created date
  - StatusBadge
  - Search, filter by type/status
  - Sort by any column
- Admin actions: approve, block, feature as VIP
- Bulk actions checkbox

### Analytics `/dashboard/admin/analytics` — Figma `5:36292`, `5:36425`

- **Revenue charts** — Monthly revenue trend (placeholder chart)
- **User growth** — New registrations over time
- **Booking metrics** — Completion rate, cancellation rate, avg value
- **Top properties** — Most booked, highest rated
- **Geographic distribution** — Listings by location
- Date range selector
- Export data button (placeholder)

### Settings `/dashboard/admin/settings` — Figma `5:36547`, `5:36654`

- **Platform settings**:
  - Commission rate (%)
  - VIP pricing (editable)
  - SMS package pricing
  - Max photos per listing
- **Notification templates**
- **Admin user management** — Add/remove admins
- **Maintenance mode toggle**

## ALL TEXT IN GEORGIAN

## FINISH

```bash
npm run build
```

Commit: "feat: admin dashboard — KPIs, verifications, clients, listings, analytics, settings"

Output DONE when build passes.
