# Agent 10: Service Cabinet + Food Cabinet Dashboards

> **WAVE 2** — Run AFTER Agent 1 (foundation) has merged into main.

## YOUR FILES (you OWN these)

```
src/app/dashboard/service/page.tsx
src/app/dashboard/service/orders/page.tsx
src/app/dashboard/food/page.tsx
src/app/dashboard/food/orders/page.tsx
```

## DO NOT TOUCH

- `src/components/**`, `src/lib/**` (Agent 1)
- `src/app/dashboard/layout.tsx` (Agent 7)
- All other `src/app/dashboard/` subdirectories (Agents 7, 8, 9)

## INSTRUCTIONS

**Fetch Figma before each page:**

```
get_design_context(fileKey: "CmWL25icqZwDX4dtEqT5ZJ", nodeId: "NODE_ID")
```

### Service Cabinet — Figma `5:42738` through `5:43794`

This is a shared dashboard for: entertainment, transport, employment, services, and handyman providers.

**Main `/dashboard/service`** — Figma `5:42738`, `5:42914`

- StatCards: active listings, total views, inquiries/orders this month, rating
- My services list (ServiceCards)
- StatusBadge for each service
- Quick add new service button
- Recent inquiries/orders

**Orders `/dashboard/service/orders`** — Figma `5:43309` through `5:43794`

- **Orders/inquiries table**
  - Columns: client name, service, date, status, price
  - StatusBadge
  - Tabs: new, in progress, completed
- **Order detail modal** — Figma `5:43520`
  - Client info
  - Service details
  - Accept/decline buttons
  - Notes
  - Status update
- Notification for new orders (real-time)

### Food Cabinet — Figma `5:43110`, `5:43223`

**Main `/dashboard/food`** — Figma `5:43110`

- StatCards: active menu items, orders today, revenue this month
- Menu management:
  - Add/edit/remove menu items
  - Toggle delivery availability
  - Update operating hours
- Current orders overview

**Orders `/dashboard/food/orders`** — Figma `5:43223`

- **Orders table**
  - Columns: customer, items ordered, delivery/pickup, total, status, time
  - Tabs: new, preparing, ready, delivered
- Order detail with item list
- Accept/mark ready/complete actions
- Real-time order notifications

## ALL TEXT IN GEORGIAN

## FINISH

```bash
npm run build
```

Commit: "feat: service cabinet and food cabinet dashboards"

Output DONE when build passes.
