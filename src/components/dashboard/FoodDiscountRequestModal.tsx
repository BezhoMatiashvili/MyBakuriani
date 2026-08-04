"use client";

import { useEffect, useMemo, useState } from "react";
import VipPropertyPickerModal from "@/components/renter/VipPropertyPickerModal";
import {
  fetchPricingPackages,
  packageDurationHours,
  packageForPromotionTier,
  type PricingPackage,
} from "@/lib/pricing-packages";
import type { Tables } from "@/lib/types/database";

type Service = Tables<"services">;

export type FoodDiscountRequestResult = {
  id: string;
  status: "pending";
  discount_percent: number;
  quoted_amount_gel: number;
  quoted_duration_hours: number;
  created_at: string;
};

export default function FoodDiscountRequestModal({
  isOpen,
  onClose,
  restaurant,
  packageId,
  onSubmitted,
}: {
  isOpen: boolean;
  onClose: () => void;
  restaurant: Service | null;
  packageId?: string;
  onSubmitted?: (request: FoodDiscountRequestResult) => Promise<void> | void;
}) {
  const [packages, setPackages] = useState<PricingPackage[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void fetchPricingPackages(["vip"]).then(setPackages);
  }, []);

  const pkg = useMemo(
    () =>
      packageId
        ? packages.find((candidate) => candidate.id === packageId)
        : packageForPromotionTier(packages, "discount"),
    [packageId, packages],
  );

  return (
    <VipPropertyPickerModal
      isOpen={isOpen}
      onClose={onClose}
      tier="discount"
      flat
      reviewMode
      loading={submitting || !pkg || restaurant?.status !== "active"}
      pkg={
        pkg
          ? {
              amountGel: pkg.amount_gel,
              durationHours: packageDurationHours(pkg),
            }
          : undefined
      }
      properties={
        restaurant
          ? [
              {
                id: restaurant.id,
                title: restaurant.title,
                subtitle: restaurant.location ?? undefined,
                photoUrl: (restaurant.photos ?? [])[0] ?? null,
                badgeLabel: "კვება",
                badgeColor: "blue",
              },
            ]
          : []
      }
      onConfirm={async (serviceId, quantity, discountPercent) => {
        if (!pkg || discountPercent === undefined) {
          throw new Error("discount_package_unavailable");
        }
        setSubmitting(true);
        try {
          const response = await fetch("/api/food/discount-requests", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              serviceId,
              packageId: pkg.id,
              discountPercent,
              quantity,
            }),
          });
          const payload = (await response.json().catch(() => null)) as {
            request?: FoodDiscountRequestResult;
            error?: string;
          } | null;
          if (!response.ok || !payload?.request) {
            throw new Error(payload?.error ?? "discount_request_failed");
          }
          await onSubmitted?.(payload.request);
        } finally {
          setSubmitting(false);
        }
      }}
    />
  );
}
