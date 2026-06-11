"use client";

import { useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { X, Rocket, Ticket, Percent, MessageSquare } from "lucide-react";
import type { PricingPackage } from "@/lib/pricing-packages";

export type VipInfoTier = "super-vip" | "vip" | "discount" | "sms";

/** Map a pricing package to the info-modal tier whose copy it should show. */
export function inferVipInfoTier(pkg: PricingPackage): VipInfoTier {
  if (pkg.category === "sms") return "sms";
  const tier = (pkg.meta?.tier as string | undefined) ?? "standard";
  if (tier === "super") return "super-vip";
  if (tier === "discount") return "discount";
  return "vip";
}

const TIER_STYLE: Record<
  VipInfoTier,
  {
    tierKey: "superVip" | "vip" | "discount" | "sms";
    chipBg: string;
    chipText: string;
    icon: typeof Rocket;
    iconColor: string;
  }
> = {
  "super-vip": {
    tierKey: "superVip",
    chipBg: "bg-[#DCFCE7]",
    chipText: "text-[#16A34A]",
    icon: Rocket,
    iconColor: "text-[#16A34A]",
  },
  vip: {
    tierKey: "vip",
    chipBg: "bg-[#FCE7F3]",
    chipText: "text-[#BE185D]",
    icon: Ticket,
    iconColor: "text-[#BE185D]",
  },
  discount: {
    tierKey: "discount",
    chipBg: "bg-[#DCFCE7]",
    chipText: "text-[#16A34A]",
    icon: Percent,
    iconColor: "text-[#16A34A]",
  },
  sms: {
    tierKey: "sms",
    chipBg: "bg-[#DBEAFE]",
    chipText: "text-[#2563EB]",
    icon: MessageSquare,
    iconColor: "text-[#2563EB]",
  },
};

interface VipInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  tier: VipInfoTier;
}

export default function VipInfoModal({
  isOpen,
  onClose,
  tier,
}: VipInfoModalProps) {
  const t = useTranslations("RenterDashboard.modals.vipInfo");
  const tShared = useTranslations("DashboardShared");

  const style = TIER_STYLE[tier];
  const IconCmp = style.icon;
  const tierKey = style.tierKey;

  const config = useMemo(
    () => ({
      title: t(`tiers.${tierKey}.title`),
      what: t(`tiers.${tierKey}.what`),
      how: t(`tiers.${tierKey}.how`),
    }),
    [t, tierKey],
  );

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
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
            className="relative z-10 w-full max-w-[640px] rounded-[24px] bg-white p-7 shadow-[0px_24px_60px_-12px_rgba(15,23,42,0.25)]"
          >
            <button
              type="button"
              onClick={onClose}
              aria-label={tShared("closeAria")}
              className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center rounded-full text-[#94A3B8] hover:bg-[#F1F5F9]"
            >
              <X className="h-4 w-4" />
            </button>

            <div
              className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 ${style.chipBg} ${style.chipText}`}
            >
              <IconCmp className="h-4 w-4" strokeWidth={2.3} />
              <span className="text-[13px] font-black uppercase tracking-wide">
                {config.title}
              </span>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <h3 className="text-[14px] font-black text-[#0F172A]">
                  {tShared("whatIs")}
                </h3>
                <p className="mt-2 text-[13px] leading-[20px] text-[#475569]">
                  {config.what}
                </p>
              </div>
              <div>
                <h3 className="text-[14px] font-black text-[#0F172A]">
                  {tShared("howDoesItWork")}
                </h3>
                <p className="mt-2 text-[13px] leading-[20px] text-[#475569]">
                  {config.how}
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
