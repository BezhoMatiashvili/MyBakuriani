import {
  Info,
  Star,
  AlertTriangle,
  BellRing,
  type LucideIcon,
} from "lucide-react";

export type NotificationIconKey = "info" | "star" | "warning" | "lead";

export const ICON_STYLES: Record<
  NotificationIconKey,
  { bg: string; color: string; Icon: LucideIcon }
> = {
  info: {
    bg: "bg-[#DBEAFE]",
    color: "text-[#2563EB]",
    Icon: Info,
  },
  star: {
    bg: "bg-[#FEF3C7]",
    color: "text-[#F59E0B]",
    Icon: Star,
  },
  warning: {
    bg: "bg-[#FFEDD5]",
    color: "text-[#F97316]",
    Icon: AlertTriangle,
  },
  lead: {
    bg: "bg-[#DCFCE7]",
    color: "text-[#16A34A]",
    Icon: BellRing,
  },
};

export function iconForType(type: string): NotificationIconKey {
  switch (type) {
    case "smart_match_request":
    case "smart_match":
      return "lead";
    case "smart_match_offer":
    case "listing_pending":
      return "info";
    case "payment_success":
      return "lead";
    case "warning":
    case "balance_low":
    case "payment_failed":
    case "vip_expiring":
      return "warning";
    case "favorite":
    case "review":
    case "review_request":
      return "star";
    default:
      return "info";
  }
}

export function relativeTime(iso: string | null): string {
  if (!iso) return "ახლახან";
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "ახლახან";
  if (hours < 24) return `${hours} სთ-ის წინ`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "გუშინ";
  return `${days} დღის წინ`;
}

const SEGMENTS_WITH_NOTIFICATIONS = new Set([
  "renter",
  "seller",
  "food",
  "service",
]);

export function resolveNotificationsPath(dashboardPath: string): string {
  const segment = dashboardPath.split("/")[2];
  if (segment && SEGMENTS_WITH_NOTIFICATIONS.has(segment)) {
    return `${dashboardPath}/notifications`;
  }
  return dashboardPath;
}
