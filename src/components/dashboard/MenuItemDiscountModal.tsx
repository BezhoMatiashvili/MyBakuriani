"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { Percent, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchPricingPackages,
  getPackageDisplay,
  packageForPromotionTier,
  type PricingPackage,
} from "@/lib/pricing-packages";

export interface MenuItemDiscountRequestResult {
  id: string;
  status: string;
  menu_item_id: string;
  discount_percent: number;
  quoted_amount_gel: number;
  quoted_duration_hours: number;
  created_at: string;
}

interface MenuItemDiscountModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: { id: string; name: string; price: number } | null;
  onSubmitted?: (request: MenuItemDiscountRequestResult) => void;
}

export default function MenuItemDiscountModal({
  isOpen,
  onClose,
  item,
  onSubmitted,
}: MenuItemDiscountModalProps) {
  const t = useTranslations("FoodOrders");
  const tCreate = useTranslations("CreateShared");
  const tShared = useTranslations("DashboardShared");
  const locale = useLocale();

  const [packages, setPackages] = useState<PricingPackage[]>([]);
  const [percent, setPercent] = useState(10);
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    void fetchPricingPackages(["vip"]).then(setPackages);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setPercent(10);
    setQuantity(1);
    setError(null);
  }, [isOpen, item?.id]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const pkg = useMemo(
    () => packageForPromotionTier(packages, "discount"),
    [packages],
  );
  const pkgDisplay = useMemo(
    () => (pkg ? getPackageDisplay(pkg, locale) : null),
    [pkg, locale],
  );
  const totalAmount = pkg ? pkg.amount_gel * quantity : 0;

  const canSubmit =
    !!item &&
    !!pkg &&
    percent >= 1 &&
    percent <= 90 &&
    quantity >= 1 &&
    quantity <= 365 &&
    !submitting;

  async function handleSubmit() {
    if (!item || !pkg || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/food/menu-item-discount-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          menuItemId: item.id,
          packageId: pkg.id,
          discountPercent: percent,
          quantity,
        }),
      });
      const payload = (await res.json().catch(() => null)) as {
        request?: MenuItemDiscountRequestResult;
        error?: string;
      } | null;
      if (!res.ok || !payload?.request) {
        setError(
          payload?.error === "insufficient_balance"
            ? t("itemDiscountNeedsBalance")
            : tCreate("genericError"),
        );
        return;
      }
      onSubmitted?.(payload.request);
      onClose();
    } catch {
      setError(tCreate("genericError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {isOpen && item && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.18 }}
            className="relative z-10 max-h-[90vh] w-full max-w-[440px] overflow-y-auto rounded-[24px] bg-white p-6 shadow-[0px_24px_60px_-12px_rgba(15,23,42,0.25)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#DCFCE7] text-[#16A34A]">
                  <Percent className="h-4 w-4" strokeWidth={2.3} />
                </span>
                <div>
                  <h2 className="text-[16px] font-black text-[#0F172A]">
                    {t("itemDiscountModalTitle")}
                  </h2>
                  <p className="text-[12px] font-semibold text-[#64748B]">
                    {item.name} ·{" "}
                    {t("itemDiscountPriceLabel", {
                      price: item.price.toFixed(2),
                    })}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={tShared("closeAria")}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[#94A3B8] hover:bg-[#F1F5F9]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="text-[12px] font-bold text-[#0F172A]">
                  {t("itemDiscountPercentLabel")}
                </label>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={percent}
                  onChange={(e) => setPercent(Number(e.target.value))}
                  className="mt-1.5 h-11 w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-[13px] font-semibold text-[#0F172A] focus:border-[#16A34A] focus:outline-none focus:ring-2 focus:ring-[#16A34A]/15"
                />
              </div>

              <div>
                <label className="text-[12px] font-bold text-[#0F172A]">
                  {t("itemDiscountQuantityLabel")}
                </label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="mt-1.5 h-11 w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-[13px] font-semibold text-[#0F172A] focus:border-[#16A34A] focus:outline-none focus:ring-2 focus:ring-[#16A34A]/15"
                />
              </div>

              {pkg && pkgDisplay ? (
                <div className="flex items-center justify-between rounded-xl bg-[#F8FAFC] px-4 py-3 text-[12px] font-semibold text-[#64748B]">
                  <span>
                    {pkg.amount_gel.toFixed(2)} {pkgDisplay.unit} × {quantity}
                  </span>
                  <span className="text-[14px] font-black text-[#0F172A]">
                    {totalAmount.toFixed(2)} ₾
                  </span>
                </div>
              ) : (
                <Skeleton className="h-11 rounded-xl" />
              )}

              {error && (
                <p className="text-[12px] font-semibold text-[#EF4444]">
                  {error}
                </p>
              )}

              <button
                type="button"
                disabled={!canSubmit}
                onClick={handleSubmit}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#16A34A] px-5 py-3 text-[13px] font-bold text-white hover:bg-[#15803D] disabled:opacity-50"
              >
                {t("itemDiscountSubmit")}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
