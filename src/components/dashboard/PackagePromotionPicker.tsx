"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import VipPropertyPickerModal, {
  type PickerProperty,
} from "@/components/renter/VipPropertyPickerModal";
import type { VipInfoTier } from "@/components/renter/VipInfoModal";
import { createClient } from "@/lib/supabase/client";
import {
  fetchPricingPackages,
  packageDurationHours,
  packageForPromotionTier,
  type PricingPackage,
} from "@/lib/pricing-packages";
import {
  promotionPurchaseError,
  purchaseReasonMessages,
} from "@/lib/promotion-purchase";
import { useAuth } from "@/lib/hooks/useAuth";
import type { PurchaseVipBody } from "@/lib/payments/keepz/intent";

interface PackagePromotionPickerProps {
  isOpen: boolean;
  onClose: () => void;
  tier: VipInfoTier;
  listings: PickerProperty[];
  target: "property" | "service";
  flat?: boolean;
  /** Pins a package when a Balance page card initiated the flow. */
  packageId?: string;
  /** The listing whose row button opened the flow; preselected in the picker. */
  selectedListingId?: string;
  onPurchased?: () => Promise<void> | void;
}

/**
 * The dashboard-facing package flow. Prices and durations come from the
 * live pricing_packages rows; the edge function still validates everything
 * server-side before it debits a balance.
 */
export default function PackagePromotionPicker({
  isOpen,
  onClose,
  tier,
  listings,
  target,
  flat,
  packageId,
  selectedListingId,
  onPurchased,
}: PackagePromotionPickerProps) {
  const t = useTranslations("DashboardShared");
  const supabase = createClient();
  const [packages, setPackages] = useState<PricingPackage[]>([]);
  const [packagesError, setPackagesError] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const { user } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);

  // fetchPricingPackages answers [] on failure; without this the Pay button
  // stayed disabled behind a price skeleton forever, with no explanation.
  const loadPackages = () => {
    setPackagesError(false);
    void fetchPricingPackages(["vip", "sms"]).then((rows) => {
      setPackages(rows);
      setPackagesError(rows.length === 0);
    });
  };

  useEffect(() => {
    loadPackages();
  }, []);

  // Wallet balance for the confirm dialog's pay-by-card fallback (C32).
  useEffect(() => {
    if (!isOpen || !user) return;
    void supabase
      .from("balances")
      .select("amount")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => setBalance(Number(data?.amount ?? 0)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, user]);

  // One body for the wallet purchase and the card-payment intent, so the
  // purchase replayed after a top-up is exactly the one confirmed here.
  const purchaseBody = (
    packageId: string,
    listingId: string,
    quantity: number,
    discountPercent?: number,
  ): PurchaseVipBody => ({
    package_id: packageId,
    quantity,
    ...(target === "property"
      ? { property_id: listingId }
      : { service_id: listingId }),
    ...(discountPercent !== undefined && {
      discount_percent: discountPercent,
    }),
  });

  const pkg = useMemo(
    () =>
      packageId
        ? packages.find((candidate) => candidate.id === packageId)
        : packageForPromotionTier(packages, tier),
    [packageId, packages, tier],
  );

  return (
    <VipPropertyPickerModal
      isOpen={isOpen}
      onClose={onClose}
      tier={tier}
      properties={listings}
      initialSelectedId={selectedListingId}
      packagesError={packagesError || (packages.length > 0 && !pkg)}
      onRetryPackages={loadPackages}
      flat={flat}
      loading={purchasing || !pkg}
      pkg={
        pkg
          ? { amountGel: pkg.amount_gel, durationHours: packageDurationHours(pkg) }
          : undefined
      }
      balance={balance}
      buildCardIntent={
        pkg
          ? (listingId, quantity, discountPercent) => ({
              kind: "purchase-vip",
              body: purchaseBody(pkg.id, listingId, quantity, discountPercent),
            })
          : undefined
      }
      onConfirm={async (listingId, quantity, discountPercent) => {
        if (!pkg) throw new Error("Promotion package is unavailable");
        setPurchasing(true);
        try {
          const { error } = await supabase.functions.invoke("purchase-vip", {
            body: purchaseBody(pkg.id, listingId, quantity, discountPercent),
          });
          if (error) {
            throw await promotionPurchaseError(error, {
              vipConflict: t("superVipBlocksVip"),
              network: t("purchaseNetworkError"),
              generic: t("genericRetry"),
              reasons: purchaseReasonMessages(t),
            });
          }
          await onPurchased?.();
        } finally {
          setPurchasing(false);
        }
      }}
    />
  );
}
