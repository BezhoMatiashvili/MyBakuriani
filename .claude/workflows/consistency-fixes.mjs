export const meta = {
  name: "consistency-fixes",
  description:
    "Fix cross-browser/device/login rendering inconsistencies (WS2-WS7) across disjoint file buckets, then adversarially verify each",
  phases: [{ title: "Fix" }, { title: "Verify" }],
};

// Shared preamble injected into every editor prompt. Foundation (WS1 locale
// lockdown + format.ts helpers) was already applied by the main session.
const PREAMBLE = `
PROJECT: MyBakuriani — Next.js 15.3 App Router, React 19, TypeScript, Tailwind CSS 4, shadcn/ui.
ALL user-facing UI text is GEORGIAN (ქართული). Currency is Lari shown as "<number> ₾".
The site is now LOCKED to a single Georgian locale.

A canonical deterministic formatter already exists at src/lib/utils/format.ts. Import from
"@/lib/utils/format". Available helpers (ALL deterministic — identical on server & client, every
device, every timezone — because they use bundled date-fns + a regex, NOT runtime toLocale*/ICU):
  - formatNumber(n: number): string            // "1234567" -> "1 234 567"  (thin-space grouping)
  - formatPrice(amount: number): string        // -> "1 234 ₾"
  - formatPricePerNight(amount: number): string
  - formatDate(date): string                   // "6 ივნისი, 2026"
  - formatDateShort(date): string              // "6 ივნ"
  - formatTime(date): string                   // "14:30"
  - formatDateTime(date): string               // "6 ივნისი, 2026 14:30"
  - formatDateRange(start, end): string
date args accept string | Date | null | undefined.

HARD RULES:
- Edit ONLY the file(s) explicitly assigned to you. Do NOT touch any other file.
- Be surgical: change only what the task requires; match the existing code style exactly.
- Preserve existing behavior and the exact visible Georgian text/format as closely as possible.
- Remove any import/variable your change orphans (e.g. an unused Intl constant). Add needed imports.
- Do NOT run builds or installs. Do NOT delete files.
- When picking a formatter, choose the one whose output most closely matches what the line
  currently renders (e.g. a date with {day,month:'short'} -> formatDateShort; a bare count
  toLocaleString() -> formatNumber; a "<n> ₾" price -> formatPrice).
`;

const RETURN_SPEC = `
Return a JSON object: { "files": [ { "path": "...", "changes": "1-line summary of each edit" } ],
"notes": "anything noteworthy, or empty string" }.
`;

const EDIT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["files", "notes"],
  properties: {
    files: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "changes"],
        properties: {
          path: { type: "string" },
          changes: { type: "string" },
        },
      },
    },
    notes: { type: "string" },
  },
};

const VERDICT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ok", "issues"],
  properties: {
    ok: { type: "boolean" },
    issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["file", "problem", "severity"],
        properties: {
          file: { type: "string" },
          problem: { type: "string" },
          severity: { type: "string", enum: ["blocker", "minor"] },
        },
      },
    },
  },
};

const BUCKETS = [
  {
    key: "searchbox",
    task: `WS3 + WS4 + WS6 — own these two files entirely:
  • src/components/search/SearchBox.tsx
  • src/components/search/SaleSearchBox.tsx

WS3 (SearchBox.tsx hydration/responsive): It uses \`const [isMobile, setIsMobile] = useState(false)\`
(~line 193) set from \`window.innerWidth < 768\` in an effect (~line 201). Because the server always
renders with isMobile=false, phones render the DESKTOP tree first then snap to mobile after hydration.
FIX GOAL: the STATIC layout (which markup renders) must be selected by CSS (Tailwind responsive
classes like \`md:hidden\` / \`hidden md:block\`), NEVER by the JS \`isMobile\` state, so the server and
first client render are byte-identical. It is OK to keep the \`isMobile\` flag ONLY for behavior that
fires AFTER a user interaction (e.g. choosing bottom-sheet vs popover when a dropdown opens — see
~lines 391, 418, 617), since that happens post-mount where the value is reliable. First READ the file
and determine whether the static layout actually branches on \`isMobile\`. If it does, convert that
branch to CSS. If the static layout is already CSS-driven and isMobile only gates post-click behavior,
leave the layout as-is (no risky rewrite). Either way, ensure no hydration divergence remains.

WS4 (SearchBox.tsx dates): replace the \`GEORGIAN_SHORT_DATE = new Intl.DateTimeFormat("ka-GE", …)\`
constant (~line 99) and its use with \`formatDateShort\` from "@/lib/utils/format". Remove the now-unused
Intl constant.

WS6 (both files, Firefox sliders): the range \`<input type="range">\` elements style only
\`[&::-webkit-slider-thumb]\` (SearchBox ~lines 845,856; SaleSearchBox ~lines 1382,1394,1756,1768), so
Firefox shows an unstyled default thumb. Add MATCHING \`[&::-moz-range-thumb]\` styles (size, rounded,
border, background, pointer-events) mirroring each webkit thumb so Firefox looks identical to Chrome.
Firefox needs \`appearance-none\` on the moz thumb too. Do not change the webkit rules.

WS4 (SaleSearchBox.tsx ~line 193): \`Math.round(n).toLocaleString("ka-GE").replace(/,/g, " ")\` for a
"<n> ₾" price — replace with \`formatPrice(n)\` (which already yields "1 234 ₾"); drop the manual ₾ if
formatPrice supplies it. If the surrounding code adds " ₾" itself, use \`formatNumber\` instead to avoid
a double symbol. Inspect the call site and keep the rendered output identical.`,
  },
  {
    key: "hydration-loaders",
    task: `WS2 — own these two files entirely:
  • src/components/shared/SkierLoader.tsx
  • src/app/[locale]/dashboard/cleaner/earnings/page.tsx

SkierLoader.tsx (~lines 68-95): two \`useMemo\` blocks build \`particles\` (12) and \`speedLines\` (16)
using \`Math.random()\`. This loader is rendered by server \`loading.tsx\` files, so server HTML differs
from client HTML → hydration mismatch + a flash. FIX: replace every \`Math.random()\` with DETERMINISTIC
values derived from the index \`i\` so the output is identical on server and client and every render.
Keep the visual character (varied positions/sizes within the same numeric ranges). Use a small
pure helper, e.g. a pseudo-random from i: \`const rand = (i, s) => { const x = Math.sin(i * 12.9898 + s
* 78.233) * 43758.5453; return x - Math.floor(x); };\` then map each former \`Math.random()\` to
\`rand(i, k)\` with a distinct constant k per field, scaled into the SAME range the code used. No behavior
or layout change other than determinism.

cleaner/earnings/page.tsx:
  • WS2 (~line 154): \`style={{ height: \\\`\${30 + Math.random() * 70}%\\\` }}\` for chart bars reshuffles
    every render and mismatches SSR/CSR. Replace with a DETERMINISTIC height: prefer deriving it from
    the actual datum being mapped (if the map has a numeric value, scale that to 30-100%); if no datum
    value is available, use a deterministic function of the bar index (same sin-based helper as above,
    scaled to 30-100%). The chart must look the same on every load.
  • WS4 (~lines 192, 237): \`new Date(...).toLocaleDateString("ka-GE", { day:"numeric", month:"short" })\`
    → \`formatDateShort(...)\` from "@/lib/utils/format".`,
  },
  {
    key: "date-sweep-dashboard-a",
    task: `WS4 — own these files (replace runtime toLocale*/Intl with deterministic helpers from
"@/lib/utils/format"; match the closest helper to current output; remove orphaned locale args):
  • src/app/[locale]/dashboard/admin/finances/page.tsx (~line 30: d.toLocaleString("ka-GE",{…}) — a
    date/time format → formatDateTime or formatDate depending on whether time is shown; read the options).
  • src/app/[locale]/dashboard/admin/moderation/page.tsx (~lines 239,241: views_count/clicks_count
    .toLocaleString() with NO locale → formatNumber — these are the most divergent; must fix).
  • src/app/[locale]/dashboard/admin/page.tsx (~lines 167,273: .toLocaleString("en-US") counts → formatNumber).
  • src/app/[locale]/dashboard/admin/promocodes/page.tsx (~line 243: new Date(expires_at)
    .toLocaleDateString("ka-GE") → formatDate).
  • src/app/[locale]/dashboard/admin/sms-approvals/page.tsx (~line 157: toLocaleDateString("ka-GE") → formatDate).
  • src/app/[locale]/dashboard/cleaner/page.tsx (~line 239: new Date(scheduled_at)
    .toLocaleDateString("ka-GE",{…}) → formatDateShort or formatDate per the options shown).
  • src/app/[locale]/dashboard/cleaner/schedule/page.tsx (~line 184: d.toLocaleTimeString("ka-GE",{…}) → formatTime).
  • src/app/[locale]/dashboard/seller/analytics/page.tsx (~line 201: stage.value.toLocaleString("ka-GE") → formatNumber).
Read each line for its exact options before picking the helper; keep the rendered Georgian text equivalent.`,
  },
  {
    key: "date-sweep-dashboard-b",
    task: `WS4 — own these files (replace runtime toLocale*/Intl with deterministic helpers from
"@/lib/utils/format"; match the closest helper; keep "₾"/"$" prefixes/suffixes exactly as today):
  • src/app/[locale]/dashboard/food/balance/page.tsx (~line 231: new Date(created_at)
    .toLocaleDateString(…) → formatDate).
  • src/app/[locale]/dashboard/food/page.tsx (~lines 210,225: totalOrders/views .toLocaleString() NO
    locale → formatNumber — must fix).
  • src/app/[locale]/dashboard/renter/balance/page.tsx (~line 335: new Date(created_at)
    .toLocaleDateString(…) → formatDate).
  • src/app/[locale]/dashboard/service/balance/page.tsx (~line 278: same → formatDate).
  • src/app/[locale]/dashboard/service/page.tsx (~line 138: stats.views.toLocaleString() NO locale → formatNumber).
  • src/app/[locale]/dashboard/sms/SmsCenterClient.tsx (~lines 675,679: dateLabel via
    toLocaleDateString("ka-GE",{…}) and timeLabel via toLocaleTimeString("ka-GE",{…}) → formatDateShort/
    formatDate for the date and formatTime for the time, matching the options).
  • src/app/[locale]/_landing/SaleLandingBody.tsx (~lines 53,655: .toLocaleString("en-US") for "<n> ₾/მ²"
    and a "$<n>" USD price → formatNumber, preserving the " ₾/მ²" suffix and "$" prefix respectively).
  • src/components/cards/InvestmentCard.tsx (~line 9: \`$\${n.toLocaleString("en-US")}\` → \`$\${formatNumber(n)}\`).
  • src/components/cards/SalePropertyCard.tsx (~lines 24,135: USD "$<n>" and "$<n> / მ²" → formatNumber, keep "$"/suffix).
  • src/components/maps/BakurianiMap.tsx (~line 146: \`\${price.toLocaleString("ka-GE")} ₾\` → \`\${formatNumber(price)} ₾\`
    or formatPrice(price); keep output "1 234 ₾").
  • src/components/seller/SalesBoard.tsx (~lines 111-113: min/max .toLocaleString() NO locale → formatNumber, keep the \${sym} prefixes).
DO NOT touch src/components/ui/calendar.tsx (vendored shadcn primitive; leave it).`,
  },
  {
    key: "ios-viewport",
    task: `WS5 — own these files (iOS Safari viewport + notch):
  • src/app/layout.tsx: on <body> change \`min-h-screen\` → \`min-h-dvh\` (dynamic viewport height; avoids
    100vh overflow when the iOS URL bar hides). Change nothing else.
  • src/app/[locale]/auth/login/page.tsx (~line 171) and src/app/[locale]/auth/register/page.tsx
    (~line 177): \`min-h-[calc(100vh-160px)]\` → \`min-h-[calc(100dvh-160px)]\`.
  • src/components/layout/StickyNewsBar.tsx (~line 59): it's a fixed bottom banner. Add bottom padding
    for the iOS home indicator so the banner/dismiss button isn't obscured: add
    \`pb-[calc(0.75rem+env(safe-area-inset-bottom))]\` to the visible banner element (mirror how
    MobileBottomNav already uses env(safe-area-inset-bottom)). Keep existing horizontal padding.
Be conservative: do NOT change any \`h-screen\` on dashboard app-shell layouts — those are intentional.`,
  },
  {
    key: "nav-parity",
    task: `WS7 — make navigation consistent across logins AND across desktop sidebar vs mobile bottom nav.
EDIT ONLY these two files:
  • src/components/layout/MobileBottomNav.tsx
  • src/components/layout/DashboardSidebar.tsx
You MAY READ (for reference, do not edit): the per-role desktop sidebars
src/components/layout/{Renter,Seller,Guest,Cleaner,Food,Service}Sidebar.tsx, and the dashboard route
directories under src/app/[locale]/dashboard/* (to know which hrefs actually exist).

CONFIRMED BUG: in BOTH files the SELLER "profile" link points to "/dashboard/renter/profile" (wrong
role). The seller's real profile/settings route is "/dashboard/seller/settings" (verified in
SellerSidebar). Fix both to "/dashboard/seller/settings".

Then reconcile per-role link sets so the SAME role sees consistent, NON-BROKEN navigation on mobile
(MobileBottomNav) and desktop fallback (DashboardSidebar): for each role, every href must resolve to a
real dashboard route dir. Cross-check each href against the actual folders under
src/app/[locale]/dashboard/. If a mobile tab points to a non-existent route, fix it to the correct
existing route for that role (use the per-role desktop sidebar as the source of truth for that role's
real links). Keep MobileBottomNav concise (it's a bottom bar — a small number of tabs is fine); the
requirement is CORRECTNESS (no 404, no cross-role link), not making mobile list every desktop item.
Do not invent new routes. Preserve Georgian labels / translation keys already in use.`,
  },
];

phase("Fix");
const results = await pipeline(
  BUCKETS,
  (b) =>
    agent(
      `${PREAMBLE}\n\nYOUR ASSIGNMENT (${b.key}):\n${b.task}\n${RETURN_SPEC}`,
      {
        label: `fix:${b.key}`,
        phase: "Fix",
        schema: EDIT_SCHEMA,
      },
    ),
  (editResult, b) => {
    if (!editResult) return { bucket: b.key, edit: null, verdict: null };
    const fileList = editResult.files.map((f) => f.path).join(", ");
    return agent(
      `You are an adversarial reviewer. Another agent just edited these files for bucket "${b.key}":
${fileList}

Their claimed changes:
${JSON.stringify(editResult.files, null, 2)}
Notes: ${editResult.notes || "(none)"}

The intended task was:
${b.task}

Independently READ each edited file and verify, being skeptical:
1. The change actually fulfills the task (e.g. toLocale*/Intl/Math.random truly removed where required;
   correct deterministic helper imported from "@/lib/utils/format" and used; Firefox ::-moz-range-thumb
   styles added mirroring webkit; min-h-dvh / safe-area applied; seller profile link fixed to
   /dashboard/seller/settings; nav hrefs resolve to real dashboard route dirs).
2. No NEW problem was introduced: imports correct & present, no orphaned/unused vars or imports left,
   no obvious TypeScript error, no changed visible Georgian text/format, no behavior regression, only
   the assigned files touched.
3. For the SearchBox responsive change: confirm the STATIC layout no longer depends on the JS isMobile
   state for what renders on first paint (server == first client render).
Report ok=true only if it is correct and complete. List concrete issues otherwise (severity blocker|minor).`,
      { label: `verify:${b.key}`, phase: "Verify", schema: VERDICT_SCHEMA },
    ).then((verdict) => ({ bucket: b.key, edit: editResult, verdict }));
  },
);

const summary = results.filter(Boolean).map((r) => ({
  bucket: r.bucket,
  filesChanged: r.edit ? r.edit.files.length : 0,
  ok: r.verdict ? r.verdict.ok : false,
  blockers: r.verdict
    ? r.verdict.issues.filter((i) => i.severity === "blocker")
    : [],
  allIssues: r.verdict ? r.verdict.issues : [],
}));

log(
  `Done. ${summary.filter((s) => s.ok).length}/${summary.length} buckets verified clean.`,
);
return summary;
