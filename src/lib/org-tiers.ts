/**
 * Company (developer / agency) subscription tiers — 2026 price list §5:
 * START (`entry`) · PRO · PREMIUM · PREMIUM+ (`premium_plus`).
 *
 * The tier codes are a string coupling across: the
 * organization_subscriptions.tier CHECK, both rank CASE lists in
 * purchase_company_subscription, the `company-<tier>` pricing_packages codes and
 * VALID_TIERS in the company-subscription edge function
 * (scripts/check-contracts.mjs and scripts/check-db-contracts.mjs compare them).
 * Pure module (no `@/` imports) so scripts/unit can import it.
 */
export const COMPANY_TIERS = [
  "entry",
  "pro",
  "premium",
  "premium_plus",
] as const;
export type CompanyTier = (typeof COMPANY_TIERS)[number];

/** Upgrade order: while a package is active, a purchase must rank above it. */
export const COMPANY_TIER_RANK: Record<CompanyTier, number> = {
  entry: 1,
  pro: 2,
  premium: 3,
  premium_plus: 4,
};
