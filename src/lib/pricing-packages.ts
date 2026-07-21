import {
  BadgeCheck,
  Crown,
  MessageSquare,
  Megaphone,
  Percent,
  Rocket,
  ShieldCheck,
  Ticket,
} from "lucide-react";

export type PackageCategory =
  | "sms"
  | "vip"
  | "verification"
  | "ad"
  | "subscription";

export interface PricingPackage {
  id: string;
  category: PackageCategory;
  code: string;
  name: string;
  label: string | null;
  description: string | null;
  amount_gel: number;
  sort_order: number;
  meta: Record<string, unknown> | null;
}

export interface PackageDisplay {
  icon: typeof Rocket;
  iconBg: string;
  iconColor: string;
  ctaColor: string;
  unit: string;
}

export type PromotionTier = "super-vip" | "vip" | "discount" | "sms";

/** Find the enabled package that backs a dashboard promotion tier. */
export function packageForPromotionTier(
  packages: PricingPackage[],
  tier: PromotionTier,
): PricingPackage | undefined {
  if (tier === "sms") return packages.find((pkg) => pkg.category === "sms");

  const packageTier = tier === "super-vip" ? "super" : tier === "vip" ? "standard" : "discount";
  return packages.find(
    (pkg) => pkg.category === "vip" && metaString(pkg.meta, "tier") === packageTier,
  );
}

/** Duration used by the picker; package metadata is admin-managed. */
export function packageDurationHours(pkg: PricingPackage | undefined): number {
  return metaNumber(pkg?.meta ?? null, "duration_hours") ?? 24;
}

/** Unit fragments rendered next to the GEL price (e.g. "₾ / 24სთ"). */
const UNIT_LABELS: Record<"ka" | "en" | "ru", { hour: string; day: string }> = {
  ka: { hour: "სთ", day: "დღე" },
  en: { hour: "h", day: "day" },
  ru: { hour: "ч", day: "день" },
};

function unitLabels(locale?: string): { hour: string; day: string } {
  return UNIT_LABELS[locale === "en" || locale === "ru" ? locale : "ka"];
}

function metaString(
  meta: Record<string, unknown> | null,
  key: string,
): string | null {
  if (!meta) return null;
  const v = meta[key];
  return typeof v === "string" ? v : null;
}

function metaNumber(
  meta: Record<string, unknown> | null,
  key: string,
): number | null {
  if (!meta) return null;
  const v = meta[key];
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function getPackageDisplay(
  pkg: PricingPackage,
  locale?: string,
): PackageDisplay {
  if (pkg.category === "vip") {
    const tier = metaString(pkg.meta, "tier");
    if (tier === "super") {
      return {
        icon: Rocket,
        iconBg: "bg-[#DCFCE7]",
        iconColor: "text-[#16A34A]",
        ctaColor: "bg-[#F97316] hover:bg-[#EA580C] text-white",
        unit: vipUnit(pkg, locale),
      };
    }
    if (tier === "discount") {
      return {
        icon: Percent,
        iconBg: "bg-[#DCFCE7]",
        iconColor: "text-[#16A34A]",
        ctaColor: "bg-[#22C55E] hover:bg-[#16A34A] text-white",
        unit: vipUnit(pkg, locale),
      };
    }
    if (tier === "standard") {
      return {
        icon: Ticket,
        iconBg: "bg-[#FFEDD5]",
        iconColor: "text-[#F97316]",
        ctaColor: "bg-[#EC4899] hover:bg-[#DB2777] text-white",
        unit: vipUnit(pkg, locale),
      };
    }
    return {
      icon: Crown,
      iconBg: "bg-[#FFEDD5]",
      iconColor: "text-[#F97316]",
      ctaColor: "bg-[#F97316] hover:bg-[#EA580C] text-white",
      unit: vipUnit(pkg, locale),
    };
  }

  if (pkg.category === "sms") {
    const count = metaNumber(pkg.meta, "sms_count");
    return {
      icon: MessageSquare,
      iconBg: "bg-[#DBEAFE]",
      iconColor: "text-[#2563EB]",
      ctaColor: "bg-[#2563EB] hover:bg-[#1E40AF] text-white",
      unit: count ? `₾ / ${count} SMS` : "₾",
    };
  }

  if (pkg.category === "verification") {
    return {
      icon: ShieldCheck,
      iconBg: "bg-[#DCFCE7]",
      iconColor: "text-[#059669]",
      ctaColor: "bg-[#059669] hover:bg-[#047857] text-white",
      unit: pkg.label ? `₾ / ${pkg.label}` : "₾",
    };
  }

  if (pkg.category === "ad") {
    return {
      icon: Megaphone,
      iconBg: "bg-[#E2E8F0]",
      iconColor: "text-[#0F172A]",
      ctaColor: "bg-[#0F172A] hover:bg-[#1E293B] text-white",
      unit: pkg.label ? `₾ / ${pkg.label}` : "₾",
    };
  }

  return {
    icon: BadgeCheck,
    iconBg: "bg-[#EDE9FE]",
    iconColor: "text-[#8B5CF6]",
    ctaColor: "bg-[#8B5CF6] hover:bg-[#7C3AED] text-white",
    unit: pkg.label ? `₾ / ${pkg.label}` : "₾",
  };
}

function vipUnit(pkg: PricingPackage, locale?: string): string {
  const { hour, day } = unitLabels(locale);
  const hours = metaNumber(pkg.meta, "duration_hours");
  if (hours) return `₾ / ${hours}${hour}`;
  return `₾ / ${day}`;
}

export async function fetchPricingPackages(
  categories: PackageCategory[],
): Promise<PricingPackage[]> {
  const url = `/api/pricing-packages?categories=${categories.join(",")}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];
  const payload = (await res.json().catch(() => null)) as {
    packages?: PricingPackage[];
  } | null;
  return Array.isArray(payload?.packages) ? payload.packages : [];
}
