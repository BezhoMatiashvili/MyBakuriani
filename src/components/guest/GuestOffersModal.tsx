"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { X, Star, ArrowRight } from "lucide-react";
import { formatPrice } from "@/lib/utils/format";

export interface GuestOffer {
  id: string;
  requestId: string;
  requestShortId: string;
  createdAt: string | null;
  offeredPrice: number;
  status: "pending" | "declined" | "accepted";
  renter: {
    displayName: string | null;
    avatarUrl: string | null;
    rating: number | null;
    listingsCount: number | null;
  };
  property: {
    id: string;
    title: string;
    photo: string | null;
    rating: number | null;
    capacity: number | null;
    pricePerNight: number;
    isVip?: boolean;
  };
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  offers: GuestOffer[];
  onDecline: (offerId: string) => Promise<void> | void;
}

export default function GuestOffersModal({
  isOpen,
  onClose,
  offers,
  onDecline,
}: Props) {
  const t = useTranslations("GuestDashboard.offersModal");
  const tShared = useTranslations("DashboardShared");

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [isOpen, onClose]);

  const firstRequestShortId = offers[0]?.requestShortId ?? "—";
  const offerCount = offers.length;

  function relativeTime(iso: string | null): string {
    if (!iso) return tShared("timeJustNow");
    const diff = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) {
      const hours = Math.floor(diff / 3600000);
      if (hours === 0) return tShared("timeJustNow");
      return tShared("timeHoursAgo", { hours });
    }
    if (days === 1) return tShared("timeYesterday");
    return tShared("timeDaysAgo", { days });
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
            className="relative z-10 flex max-h-[90vh] w-full max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-t-2xl bg-white shadow-[0px_16px_40px_-12px_rgba(0,0,0,0.15)] sm:max-w-2xl sm:rounded-2xl"
          >
            <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-6 sm:px-8">
              <div>
                <h2 className="text-[22px] font-black leading-[28px] text-[#0F172A]">
                  {t("title")}
                </h2>
                <p className="mt-1 text-[13px] font-medium text-[#64748B]">
                  {t("subtitle", {
                    id: firstRequestShortId,
                    count: offerCount,
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[#E2E8F0] text-[#94A3B8] hover:bg-[#F1F5F9]"
                aria-label={tShared("closeAria")}
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5 sm:px-8">
              {offers.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-[#EEF1F4] bg-[#FAFBFC] py-16 text-center">
                  <p className="text-[14px] font-bold text-[#0F172A]">
                    {t("emptyTitle")}
                  </p>
                  <p className="mt-1 text-[12px] text-[#94A3B8]">
                    {t("emptyDesc")}
                  </p>
                </div>
              ) : (
                offers.map((offer, idx) => (
                  <OfferCard
                    key={offer.id}
                    offer={offer}
                    highlight={idx === 0}
                    onDecline={onDecline}
                    relativeTime={relativeTime}
                  />
                ))
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function OfferCard({
  offer,
  highlight,
  onDecline,
  relativeTime,
}: {
  offer: GuestOffer;
  highlight: boolean;
  onDecline: (offerId: string) => Promise<void> | void;
  relativeTime: (iso: string | null) => string;
}) {
  const t = useTranslations("GuestDashboard.offersModal");
  const tBookings = useTranslations("GuestBookings");

  const listingPrice = offer.property.pricePerNight;
  const isCheaper = offer.offeredPrice < listingPrice && listingPrice > 0;
  const isExpensive = offer.offeredPrice > listingPrice && listingPrice > 0;
  const displayName = offer.renter.displayName ?? tBookings("defaultOwner");
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className={`overflow-hidden rounded-2xl border bg-white shadow-[0px_4px_12px_rgba(0,0,0,0.02)] ${
        highlight ? "border-[#E2E8F0]" : "border-[#D1FAE5]"
      }`}
    >
      <div
        className={`flex items-center gap-3 px-5 pt-5 pb-3 ${
          highlight ? "" : "bg-[#ECFDF5]"
        }`}
      >
        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-[#F1F5F9]">
          {offer.renter.avatarUrl ? (
            <Image
              src={offer.renter.avatarUrl}
              alt={displayName}
              fill
              sizes="40px"
              className="object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-[12px] font-black text-[#0F172A]">
              {initials || "?"}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14px] font-extrabold text-[#0F172A]">
            {displayName}
          </h3>
          <p className="mt-0.5 text-[11px] font-medium text-[#94A3B8]">
            {t("ownerRole", { time: relativeTime(offer.createdAt) })}
          </p>
        </div>
      </div>

      <div className="px-5 pb-5 pt-2">
        <div className="flex items-center gap-3 rounded-xl bg-[#FAFBFC] p-3">
          <div className="relative h-[60px] w-[80px] shrink-0 overflow-hidden rounded-lg bg-[#F1F5F9]">
            {offer.property.photo ? (
              <Image
                src={offer.property.photo}
                alt={offer.property.title}
                fill
                sizes="80px"
                className="object-cover"
              />
            ) : null}
            {offer.property.isVip && (
              <span className="absolute left-1 top-1 rounded bg-[#F97316] px-1 py-0.5 text-[8px] font-black uppercase text-white">
                VIP
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="truncate text-[13px] font-extrabold text-[#0F172A]">
              {offer.property.title}
            </h4>
            <div className="mt-1 flex items-center gap-3 text-[11px] font-medium text-[#64748B]">
              {offer.property.rating != null && offer.property.rating > 0 && (
                <span className="flex items-center gap-1">
                  <Star className="h-3 w-3 fill-[#F59E0B] text-[#F59E0B]" />
                  {offer.property.rating.toFixed(1)}
                </span>
              )}
              {offer.property.capacity != null && (
                <span>
                  {t("guestsCount", { count: offer.property.capacity })}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">
              {t("offeredPrice")}
            </p>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-[22px] font-black text-[#0F172A]">
                {formatPrice(offer.offeredPrice)}
              </span>
              <span className="text-[11px] font-medium text-[#94A3B8]">
                {tBookings("perNight")}
              </span>
            </div>
            {isCheaper && (
              <p className="mt-0.5 text-[10px] font-bold text-[#10B981]">
                {t("cheaper", { price: listingPrice })}
              </p>
            )}
            {isExpensive && (
              <p className="mt-0.5 text-[10px] font-bold text-[#DC2626]">
                {t("expensive", { price: listingPrice })}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onDecline(offer.id)}
              className="h-11 rounded-xl border border-[#E2E8F0] px-5 text-[13px] font-bold text-[#64748B] transition-colors hover:bg-[#F8FAFC] hover:text-[#0F172A]"
            >
              {tBookings("decline")}
            </button>
            <Link
              href={`/apartments/${offer.property.id}`}
              className="flex h-11 items-center gap-2 rounded-xl bg-[#2563EB] px-5 text-[13px] font-bold text-white transition-colors hover:bg-[#1D4ED8]"
            >
              {tBookings("viewDetails")}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
