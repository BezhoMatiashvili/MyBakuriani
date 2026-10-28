// Admin purchases (C42): vocabularies shared by /api/admin/purchases, its page and
// 20261028140100_admin_purchases.sql (check-contracts "C42 purchases"). No imports.
export const PURCHASE_SERVICES = [
  "sms",
  "vip",
  "super_vip",
  "discount",
  "membership",
  "company_plan",
  "other",
] as const;
export type PurchaseService = (typeof PURCHASE_SERVICES)[number];

export const PURCHASE_PERIODS = [
  "month",
  "last30",
  "last90",
  "year",
  "all",
] as const;
export type PurchasePeriod = (typeof PURCHASE_PERIODS)[number];
