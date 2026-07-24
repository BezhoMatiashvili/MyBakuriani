"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { X, Home, CreditCard } from "lucide-react";
import type { VipInfoTier } from "./VipInfoModal";
import ConfirmPaymentModal from "@/components/shared/ConfirmPaymentModal";
import NumberField from "@/components/shared/NumberField";
import { clampNumber, parseNumeric } from "@/lib/utils/number";

export interface PickerProperty {
  id: string;
  title: string;
  subtitle?: string;
  photoUrl?: string | null;
  /** Property listings split into rental/sale groups. Optional for services. */
  isForSale?: boolean;
  /** Current listing price (per night for rentals, sale price for sales) —
   * enables the target-price input for the discount tier when set. */
  price?: number | null;
  /** Overrides the rental/sale badge (e.g. a service category label). */
  badgeLabel?: string;
  badgeColor?: "blue" | "orange" | "green";
}

const TIER_KEYS: Record<
  VipInfoTier,
  { titleKey: "superVip" | "vip" | "discount" | "sms"; price: string }
> = {
  "super-vip": { titleKey: "superVip", price: "5.00 ₾" },
  vip: { titleKey: "vip", price: "1.50 ₾" },
  discount: { titleKey: "discount", price: "1.00 ₾" },
  sms: { titleKey: "sms", price: "10.00 ₾" },
};

interface VipPropertyPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  tier: VipInfoTier;
  properties: PickerProperty[];
  /**
   * Real package price/duration, used to compute the quantity-adjusted total
   * and show the quantity stepper. Omitted by legacy callers that don't use
   * the pricing-packages flow — those keep the old flat per-unit price display
   * and always confirm at quantity 1.
   */
  pkg?: { amountGel: number; durationHours: number };
  onConfirm?: (
    propertyId: string,
    quantity: number,
    discountPercent?: number,
  ) => Promise<void> | void;
  loading?: boolean;
  /** Render a single flat list (no rental/sale grouping) — used for services. */
  flat?: boolean;
}

const BADGE_COLOR: Record<string, string> = {
  blue: "bg-[#DBEAFE] text-[#2563EB]",
  orange: "bg-[#FFEDD5] text-[#EA580C]",
  green: "bg-[#DCFCE7] text-[#16A34A]",
};

export default function VipPropertyPickerModal({
  isOpen,
  onClose,
  tier,
  properties,
  pkg,
  onConfirm,
  loading,
  flat,
}: VipPropertyPickerModalProps) {
  const t = useTranslations("RenterDashboard.modals.vipPicker");
  const tInfo = useTranslations("RenterDashboard.modals.vipInfo.tiers");
  const tShared = useTranslations("DashboardShared");
  const tRenter = useTranslations("RenterDashboard");

  const [selectedId, setSelectedId] = useState<string>(properties[0]?.id ?? "");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [discountPercent, setDiscountPercent] = useState("10");
  const [targetPrice, setTargetPrice] = useState("");

  const listingPrice = (p: PickerProperty | undefined) =>
    typeof p?.price === "number" && p.price > 0 ? p.price : null;

  const basePrice =
    tier === "discount"
      ? listingPrice(properties.find((p) => p.id === selectedId))
      : null;

  const priceAtPercent = (base: number, pct: number) =>
    String(clampNumber(base * (1 - pct / 100), { decimals: 2 }));

  const handlePercentChange = (value: string) => {
    setDiscountPercent(value);
    const pct = parseNumeric(value);
    if (basePrice && pct !== null) {
      setTargetPrice(
        priceAtPercent(
          basePrice,
          clampNumber(pct, { min: 1, max: 90, integer: true }),
        ),
      );
    }
  };

  const handleTargetPriceChange = (value: string) => {
    setTargetPrice(value);
    const price = parseNumeric(value);
    if (basePrice && price !== null) {
      setDiscountPercent(
        String(
          clampNumber((1 - price / basePrice) * 100, {
            min: 1,
            max: 90,
            integer: true,
          }),
        ),
      );
    }
  };

  /** On blur, snap the typed price to the exact price the whole percent yields. */
  const snapTargetPrice = () => {
    if (!basePrice) return;
    setTargetPrice((cur) => {
      const price = parseNumeric(cur);
      if (price === null) return cur;
      const pct = clampNumber((1 - price / basePrice) * 100, {
        min: 1,
        max: 90,
        integer: true,
      });
      return priceAtPercent(basePrice, pct);
    });
  };

  const selectProperty = (p: PickerProperty) => {
    setSelectedId(p.id);
    if (tier === "discount") {
      const base = listingPrice(p);
      const pct = clampNumber(parseNumeric(discountPercent) ?? 10, {
        min: 1,
        max: 90,
        integer: true,
      });
      setTargetPrice(base ? priceAtPercent(base, pct) : "");
    }
  };

  useEffect(() => {
    if (properties.length > 0 && !selectedId) {
      setSelectedId(properties[0].id);
    }
  }, [properties, selectedId]);

  useEffect(() => {
    if (isOpen) {
      setQuantity(1);
      setDiscountPercent("10");
      const base =
        tier === "discount"
          ? listingPrice(
              properties.find((p) => p.id === selectedId) ?? properties[0],
            )
          : null;
      setTargetPrice(base ? priceAtPercent(base, 10) : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only on open
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
    setConfirmOpen(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [isOpen, onClose]);

  const tierMeta = TIER_KEYS[tier];
  const title =
    tier === "vip"
      ? "VIP"
      : tier === "super-vip"
        ? "SUPER VIP"
        : tInfo(`${tierMeta.titleKey}.title`);

  const meta = useMemo(
    () => ({
      title,
      price: tierMeta.price,
      unit: t(`units.${tierMeta.titleKey}`),
    }),
    [title, tierMeta.price, tierMeta.titleKey, t],
  );

  const totalPrice = useMemo(
    () => (pkg ? (pkg.amountGel * quantity).toFixed(2) : null),
    [pkg, quantity],
  );

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
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
              className="relative z-10 max-h-[90dvh] w-full max-w-[540px] overflow-y-auto rounded-t-[24px] bg-white p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-[0px_24px_60px_-12px_rgba(15,23,42,0.25)] sm:rounded-[24px] sm:pb-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-[17px] font-black text-[#0F172A]">
                    {tShared("selectListing")}
                  </h2>
                  <p className="mt-1 text-[12px] font-medium text-[#64748B]">
                    {t("subtitle", { tier: meta.title })}
                  </p>
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

              <div className="mt-5 max-h-[320px] space-y-2 overflow-y-auto pr-1">
                {properties.length === 0 && (
                  <div className="rounded-xl border border-dashed border-[#E2E8F0] bg-[#FAFBFC] px-4 py-6 text-center text-[13px] text-[#94A3B8]">
                    {tShared("noActiveProperty")}
                  </div>
                )}
                {(() => {
                  const rentals = properties.filter((p) => !p.isForSale);
                  const sales = properties.filter((p) => p.isForSale);

                  const renderRow = (p: PickerProperty) => {
                    const isSelected = selectedId === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => selectProperty(p)}
                        className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${
                          isSelected
                            ? "border-[#2563EB] bg-[#EFF6FF]"
                            : "border-[#EEF1F4] bg-white hover:border-[#CBD5E1]"
                        }`}
                      >
                        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-[#F1F5F9]">
                          {p.photoUrl ? (
                            <Image
                              src={p.photoUrl}
                              alt={p.title}
                              fill
                              className="object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <Home className="h-5 w-5 text-[#94A3B8]" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate text-[13px] font-extrabold text-[#0F172A]">
                              {p.title}
                            </p>
                            {(p.badgeLabel || p.isForSale !== undefined) && (
                              <span
                                className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-bold ${
                                  p.badgeColor
                                    ? BADGE_COLOR[p.badgeColor]
                                    : p.isForSale
                                      ? "bg-[#FFEDD5] text-[#EA580C]"
                                      : "bg-[#DBEAFE] text-[#2563EB]"
                                }`}
                              >
                                {p.badgeLabel ??
                                  (p.isForSale
                                    ? tRenter("forSale")
                                    : tRenter("forRent"))}
                              </span>
                            )}
                          </div>
                          {p.subtitle && (
                            <p className="mt-0.5 truncate text-[11px] font-medium text-[#94A3B8]">
                              {p.subtitle}
                            </p>
                          )}
                        </div>
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                            isSelected
                              ? "border-[#2563EB] bg-[#2563EB]"
                              : "border-[#CBD5E1] bg-white"
                          }`}
                        >
                          {isSelected && (
                            <span className="h-2 w-2 rounded-full bg-white" />
                          )}
                        </span>
                      </button>
                    );
                  };

                  if (flat) {
                    return <>{properties.map(renderRow)}</>;
                  }

                  return (
                    <>
                      {rentals.length > 0 && (
                        <>
                          <p className="px-1 pb-1 pt-0 text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
                            {tShared("forRentSection")}
                          </p>
                          {rentals.map(renderRow)}
                        </>
                      )}
                      {sales.length > 0 && (
                        <>
                          <p className="px-1 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
                            {tShared("forSaleSection")}
                          </p>
                          {sales.map(renderRow)}
                        </>
                      )}
                    </>
                  );
                })()}
              </div>

              <div className="mt-5 border-t border-[#EEF1F4] pt-5">
                {tier === "discount" && (
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">
                      {t("discountPercentLabel")}
                    </p>
                    <NumberField
                      value={discountPercent}
                      onChange={handlePercentChange}
                      min={1}
                      max={90}
                      integer
                      stepper
                      accent="green"
                      className="w-36"
                    />
                  </div>
                )}
                {tier === "discount" && basePrice !== null && (
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">
                        {t("newPriceLabel")}
                      </p>
                      <p className="mt-0.5 text-[11px] font-medium text-[#94A3B8]">
                        {t("currentPriceLabel")}: {basePrice} ₾
                      </p>
                    </div>
                    <div className="w-36" onBlur={snapTargetPrice}>
                      <NumberField
                        value={targetPrice}
                        onChange={handleTargetPriceChange}
                        min={basePrice * 0.1}
                        max={basePrice * 0.99}
                        decimals={2}
                        suffix="₾"
                        accent="green"
                      />
                    </div>
                  </div>
                )}
                {pkg && (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">
                      {t("quantityLabel")}
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                        disabled={quantity <= 1}
                        aria-label="-"
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#E2E8F0] text-[13px] font-black text-[#0F172A] hover:bg-[#F1F5F9] disabled:opacity-40"
                      >
                        −
                      </button>
                      <span className="w-9 text-center text-[13px] font-black text-[#0F172A]">
                        {quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => setQuantity((q) => Math.min(365, q + 1))}
                        disabled={quantity >= 365}
                        aria-label="+"
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#E2E8F0] text-[13px] font-black text-[#0F172A] hover:bg-[#F1F5F9] disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                  </div>
                )}

                <div
                  className={`flex items-center justify-between gap-4 ${pkg ? "mt-4" : ""}`}
                >
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">
                      {tShared("tierPrice", { tier: meta.title })}
                    </p>
                    <p className="mt-1 text-[20px] font-black text-[#0F172A]">
                      {pkg ? (
                        <>
                          {totalPrice} ₾
                          <span className="ml-1 text-[12px] font-bold text-[#94A3B8]">
                            {t("daysCount", { count: quantity })}
                          </span>
                        </>
                      ) : (
                        <>
                          {meta.price}
                          <span className="ml-1 text-[12px] font-bold text-[#94A3B8]">
                            {meta.unit}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!selectedId || loading}
                    onClick={() => selectedId && setConfirmOpen(true)}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#2563EB] px-5 py-3 text-[13px] font-black text-white shadow-[0_1px_2px_rgba(37,99,235,0.3)] transition-colors hover:bg-[#1E40AF] disabled:opacity-50"
                  >
                    <CreditCard className="h-4 w-4" />
                    {tShared("pay")}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <ConfirmPaymentModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={async () => {
          await onConfirm?.(
            selectedId,
            quantity,
            tier === "discount" ? Number(discountPercent) : undefined,
          );
          onClose();
        }}
        title={meta.title}
        priceLabel={
          pkg
            ? `${totalPrice} ₾ ${t("daysCount", { count: quantity })}`
            : `${meta.price} ${meta.unit}`
        }
        description={properties.find((p) => p.id === selectedId)?.title}
        lockScroll={false}
      />
    </>
  );
}
