# Split Execution Plan

Generated from: MyBakuriani Complete Build Spec
Date: 2026-03-25
Total agents: 10
Estimated parallel time: ~45 min (Wave 1: ~20 min, Wave 2: ~25 min)

## Architecture: Two-Wave Execution

This is a **greenfield project** — no source code exists. Wave 1 creates the foundation that all other agents depend on.

- **Wave 1** (2 agents, parallel): Foundation + Database
- **Wave 2** (8 agents, parallel): All pages and dashboards — starts AFTER Agent 1 merges

## Conflict Matrix

| Agent                   | Branch                         | Files Touched                                                                                                 | Wave | Safe With       |
| ----------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------- | ---- | --------------- |
| 1 - Foundation          | feature/split-1-foundation     | src/components/**, src/lib/**, src/app/layout.tsx, src/middleware.ts, config files                            | 1    | Agent 2 only    |
| 2 - Database            | feature/split-2-database       | supabase/\*\*                                                                                                 | 1    | Agent 1 only    |
| 3 - Landing+Search      | feature/split-3-landing-search | src/app/page.tsx, src/app/search/**, src/app/blog/**, src/app/faq/**, src/app/terms/**                        | 2    | Agents 4-10     |
| 4 - Property Pages      | feature/split-4-property-pages | src/app/apartments/**, src/app/hotels/**, src/app/sales/\*\*                                                  | 2    | Agents 3,5-10   |
| 5 - Service Pages       | feature/split-5-service-pages  | src/app/entertainment/**, src/app/services/**, src/app/employment/**, src/app/transport/**, src/app/food/\*\* | 2    | Agents 3,4,6-10 |
| 6 - Auth+Create         | feature/split-6-auth-create    | src/app/auth/**, src/app/create/**                                                                            | 2    | Agents 3-5,7-10 |
| 7 - Guest+Cleaner       | feature/split-7-guest-cleaner  | src/app/dashboard/layout.tsx, src/app/dashboard/guest/**, src/app/dashboard/cleaner/**                        | 2    | Agents 3-6,8-10 |
| 8 - Renter+Seller       | feature/split-8-renter-seller  | src/app/dashboard/renter/**, src/app/dashboard/seller/**                                                      | 2    | Agents 3-7,9-10 |
| 9 - Admin Dashboard     | feature/split-9-admin          | src/app/dashboard/admin/\*\*                                                                                  | 2    | Agents 3-8,10   |
| 10 - Service Dashboards | feature/split-10-service-dash  | src/app/dashboard/service/**, src/app/dashboard/food/**                                                       | 2    | Agents 3-9      |

## Step 1: Create branches

```bash
# Wave 1 branches (from main)
git checkout main
git checkout -b feature/split-1-foundation
git checkout main
git checkout -b feature/split-2-database
```

## Step 2a: Run Wave 1 agents (2 terminals, parallel)

### Terminal 1 — Agent 1: Foundation (project setup + all shared components)

```bash
cd /Users/bezhomatiashvili/Desktop/MyBakuriani
git checkout feature/split-1-foundation
```

```
/ralph-loop:ralph-loop "Read .claude/prompts/split-1-foundation.md and execute all instructions. Output DONE when complete." --max-iterations 15
```

### Terminal 2 — Agent 2: Database & Edge Functions

```bash
cd /Users/bezhomatiashvili/Desktop/MyBakuriani
git checkout feature/split-2-database
```

```
/ralph-loop:ralph-loop "Read .claude/prompts/split-2-database.md and execute all instructions. Output DONE when complete." --max-iterations 12
```

## Step 2b: Merge Wave 1 before continuing

**WAIT for both Wave 1 agents to complete, then merge Agent 1:**

```bash
git checkout main
git merge feature/split-1-foundation --no-ff -m "merge: foundation — project setup, shared components, hooks, utils"
git merge feature/split-2-database --no-ff -m "merge: database schema, RLS policies, edge functions"
npm run build  # verify merged result builds
```

## Step 2c: Create Wave 2 branches (from merged main)

```bash
git checkout main
git checkout -b feature/split-3-landing-search
git checkout main
git checkout -b feature/split-4-property-pages
git checkout main
git checkout -b feature/split-5-service-pages
git checkout main
git checkout -b feature/split-6-auth-create
git checkout main
git checkout -b feature/split-7-guest-cleaner
git checkout main
git checkout -b feature/split-8-renter-seller
git checkout main
git checkout -b feature/split-9-admin
git checkout main
git checkout -b feature/split-10-service-dash
```

## Step 2d: Run Wave 2 agents (8 terminals, parallel)

### Terminal 1 — Agent 3: Main Landing + Search + Blog + FAQ + Terms

```bash
cd /Users/bezhomatiashvili/Desktop/MyBakuriani
git checkout feature/split-3-landing-search
```

```
/ralph-loop:ralph-loop "Read .claude/prompts/split-3-landing-search.md and execute all instructions. Output DONE when complete." --max-iterations 12
```

### Terminal 2 — Agent 4: Apartments + Hotels + Sales

```bash
cd /Users/bezhomatiashvili/Desktop/MyBakuriani
git checkout feature/split-4-property-pages
```

```
/ralph-loop:ralph-loop "Read .claude/prompts/split-4-property-pages.md and execute all instructions. Output DONE when complete." --max-iterations 12
```

### Terminal 3 — Agent 5: Entertainment + Services + Employment + Transport + Food

```bash
cd /Users/bezhomatiashvili/Desktop/MyBakuriani
git checkout feature/split-5-service-pages
```

```
/ralph-loop:ralph-loop "Read .claude/prompts/split-5-service-pages.md and execute all instructions. Output DONE when complete." --max-iterations 12
```

### Terminal 4 — Agent 6: Auth + Listing Creation

```bash
cd /Users/bezhomatiashvili/Desktop/MyBakuriani
git checkout feature/split-6-auth-create
```

```
/ralph-loop:ralph-loop "Read .claude/prompts/split-6-auth-create.md and execute all instructions. Output DONE when complete." --max-iterations 12
```

### Terminal 5 — Agent 7: Dashboard Layout + Guest + Cleaner

```bash
cd /Users/bezhomatiashvili/Desktop/MyBakuriani
git checkout feature/split-7-guest-cleaner
```

```
/ralph-loop:ralph-loop "Read .claude/prompts/split-7-guest-cleaner-dashboard.md and execute all instructions. Output DONE when complete." --max-iterations 10
```

### Terminal 6 — Agent 8: Renter + Seller Dashboard

```bash
cd /Users/bezhomatiashvili/Desktop/MyBakuriani
git checkout feature/split-8-renter-seller
```

```
/ralph-loop:ralph-loop "Read .claude/prompts/split-8-renter-seller-dashboard.md and execute all instructions. Output DONE when complete." --max-iterations 12
```

### Terminal 7 — Agent 9: Admin Dashboard

```bash
cd /Users/bezhomatiashvili/Desktop/MyBakuriani
git checkout feature/split-9-admin
```

```
/ralph-loop:ralph-loop "Read .claude/prompts/split-9-admin-dashboard.md and execute all instructions. Output DONE when complete." --max-iterations 12
```

### Terminal 8 — Agent 10: Service + Food Dashboards

```bash
cd /Users/bezhomatiashvili/Desktop/MyBakuriani
git checkout feature/split-10-service-dash
```

```
/ralph-loop:ralph-loop "Read .claude/prompts/split-10-service-dashboards.md and execute all instructions. Output DONE when complete." --max-iterations 8
```

## Step 3: Merge after ALL Wave 2 agents finish

Merge order: smallest changes first, largest last.

```bash
git checkout main

# Smallest first
git merge feature/split-10-service-dash --no-ff -m "merge: service + food cabinet dashboards"
git merge feature/split-9-admin --no-ff -m "merge: admin dashboard"
git merge feature/split-8-renter-seller --no-ff -m "merge: renter + seller dashboards"
git merge feature/split-7-guest-cleaner --no-ff -m "merge: dashboard layout + guest + cleaner dashboards"
git merge feature/split-6-auth-create --no-ff -m "merge: auth flow + listing creation forms"
git merge feature/split-5-service-pages --no-ff -m "merge: service category pages"
git merge feature/split-4-property-pages --no-ff -m "merge: apartments, hotels, sales pages"
git merge feature/split-3-landing-search --no-ff -m "merge: landing page, search, blog, FAQ, terms"

# Final build check
npm run build
```

## Step 4: Cleanup

```bash
git branch -d feature/split-1-foundation
git branch -d feature/split-2-database
git branch -d feature/split-3-landing-search
git branch -d feature/split-4-property-pages
git branch -d feature/split-5-service-pages
git branch -d feature/split-6-auth-create
git branch -d feature/split-7-guest-cleaner
git branch -d feature/split-8-renter-seller
git branch -d feature/split-9-admin
git branch -d feature/split-10-service-dash
```

## Deferred Items

| Item                            | Reason                                                  |
| ------------------------------- | ------------------------------------------------------- |
| Google Maps integration         | Requires Google Maps API key + billing setup            |
| TBC Bank payment integration    | Requires bank API credentials + merchant agreement      |
| SMS OTP (Supabase)              | Requires Twilio/MessageBird setup in Supabase dashboard |
| Real Supabase project wiring    | Agents use mock data; .env.local needs real keys        |
| Supabase Realtime subscriptions | Works only with live Supabase connection                |
| Image optimization CDN          | May want Cloudflare or Vercel Image Optimization config |
| Production deployment           | Vercel + custom domain (mybakuriani.ge) setup           |
