"use client";

import { useEffect, useMemo, useState } from "react";
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

interface PackagePromotionPickerProps {
  isOpen: boolean;
  onClose: () => void;
  tier: VipInfoTier;
  listings: PickerProperty[];
  target: "property" | "service";
  flat?: boolean;
  /** Pins a package when a Balance page card initiated the flow. */
  packageId?: string;
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
  onPurchased,
}: PackagePromotionPickerProps) {
  const supabase = createClient();
  const [packages, setPackages] = useState<PricingPackage[]>([]);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    void fetchPricingPackages(["vip", "sms"]).then(setPackages);
  }, []);

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
      flat={flat}
      loading={purchasing || !pkg}
      pkg={
        pkg
          ? { amountGel: pkg.amount_gel, durationHours: packageDurationHours(pkg) }
          : undefined
      }
      onConfirm={async (listingId, quantity, discountPercent) => {
        if (!pkg) throw new Error("Promotion package is unavailable");
        setPurchasing(true);
        try {
          const { error } = await supabase.functions.invoke("purchase-vip", {
            body: {
              package_id: pkg.id,
              quantity,
              ...(target === "property"
                ? { property_id: listingId }
                : { service_id: listingId }),
              ...(discountPercent !== undefined && {
                discount_percent: discountPercent,
              }),
            },
          });
          if (error) throw error;
          await onPurchased?.();
        } finally {
          setPurchasing(false);
        }
      }}
    />
  );
}
