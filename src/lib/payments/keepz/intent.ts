/**
 * "Pay by card" purchase intents: the purchase a dialog started when the wallet
 * was short. It is stored on payments.resume at checkout and replayed ONCE, by
 * its owner, after Keepz confirms the top-up — through the unchanged purchase
 * endpoints, which re-validate and re-price everything server-side.
 *
 * This parser guarantees shape only (known kind, exact keys, UUIDs, the same
 * integer bounds the endpoints enforce). It never prices anything and settlement
 * never executes an intent (C32).
 *
 * Pure module (no imports) so scripts/unit can load it; the company tier list is
 * passed in for the same reason.
 */

// Same pattern as src/lib/utils/uuid.ts, inlined to keep this module import-free.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Payment ids double as Keepz integratorOrderId, which must be a UUID v4. */
export function isUuidV4(value: unknown): value is string {
  return typeof value === "string" && UUID_V4_RE.test(value);
}

export interface PurchaseVipBody {
  package_id: string;
  property_id?: string;
  service_id?: string;
  quantity?: number;
  discount_percent?: number;
  /** Self-declared FB-group-VIP membership tier only (purchase-vip re-validates). */
  fb_profile_url?: string;
}

export interface CompanySubscriptionBody {
  org_id: string;
  tier: string;
}

export interface MenuItemDiscountBody {
  menuItemId: string;
  packageId: string;
  discountPercent: number;
  quantity: number;
}

export type PurchaseIntent =
  | { kind: "purchase-vip"; body: PurchaseVipBody }
  | { kind: "company-subscription"; body: CompanySubscriptionBody }
  | { kind: "menu-item-discount"; body: MenuItemDiscountBody };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function isIntIn(value: unknown, min: number, max: number): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

function parsePurchaseVip(
  body: Record<string, unknown>,
): PurchaseVipBody | null {
  const keys = [
    "package_id",
    "property_id",
    "service_id",
    "quantity",
    "discount_percent",
    "fb_profile_url",
  ] as const;
  if (!hasOnlyKeys(body, keys) || !isUuid(body.package_id)) return null;
  // purchase_package targets one listing at most (22023 for both).
  if (body.property_id !== undefined && body.service_id !== undefined) {
    return null;
  }
  if (body.property_id !== undefined && !isUuid(body.property_id)) return null;
  if (body.service_id !== undefined && !isUuid(body.service_id)) return null;
  if (body.quantity !== undefined && !isIntIn(body.quantity, 1, 365)) {
    return null;
  }
  if (
    body.discount_percent !== undefined &&
    !isIntIn(body.discount_percent, 1, 90)
  ) {
    return null;
  }
  // Same https-only, 300-char guard as purchase-vip and the DB CHECK
  // constraint — keep the three in sync.
  if (
    body.fb_profile_url !== undefined &&
    (typeof body.fb_profile_url !== "string" ||
      body.fb_profile_url.length > 300 ||
      !/^https:\/\//i.test(body.fb_profile_url))
  ) {
    return null;
  }
  return {
    package_id: body.package_id,
    ...(body.property_id !== undefined && {
      property_id: body.property_id as string,
    }),
    ...(body.service_id !== undefined && {
      service_id: body.service_id as string,
    }),
    ...(body.quantity !== undefined && { quantity: body.quantity as number }),
    ...(body.discount_percent !== undefined && {
      discount_percent: body.discount_percent as number,
    }),
    ...(body.fb_profile_url !== undefined && {
      fb_profile_url: body.fb_profile_url as string,
    }),
  };
}

export function parsePurchaseIntent(
  raw: unknown,
  companyTiers: readonly string[],
): PurchaseIntent | null {
  if (!isPlainObject(raw) || !hasOnlyKeys(raw, ["kind", "body"])) return null;
  const { kind, body } = raw;
  if (!isPlainObject(body)) return null;

  if (kind === "purchase-vip") {
    const parsed = parsePurchaseVip(body);
    return parsed ? { kind, body: parsed } : null;
  }

  if (kind === "company-subscription") {
    if (
      !hasOnlyKeys(body, ["org_id", "tier"]) ||
      !isUuid(body.org_id) ||
      typeof body.tier !== "string" ||
      !companyTiers.includes(body.tier)
    ) {
      return null;
    }
    return { kind, body: { org_id: body.org_id, tier: body.tier } };
  }

  if (kind === "menu-item-discount") {
    if (
      !hasOnlyKeys(body, [
        "menuItemId",
        "packageId",
        "discountPercent",
        "quantity",
      ]) ||
      !isUuid(body.menuItemId) ||
      !isUuid(body.packageId) ||
      !isIntIn(body.discountPercent, 1, 90) ||
      !isIntIn(body.quantity, 1, 365)
    ) {
      return null;
    }
    return {
      kind,
      body: {
        menuItemId: body.menuItemId,
        packageId: body.packageId,
        discountPercent: body.discountPercent,
        quantity: body.quantity,
      },
    };
  }

  return null;
}
