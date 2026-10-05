"use client";

import { ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { useOwnershipStatus } from "@/lib/hooks/useOwnershipStatus";
import type {
  OwnershipListingKind,
  OwnershipVerificationStatus,
} from "@/lib/ownership/types";
import { cn } from "@/lib/utils";
import { ownershipVerificationUrl } from "@/lib/utils/listingUrls";

// Cabinet pill for a listing's stored ownership status (C39). Approved uses the
// public badge's green, so owners recognise what visitors see.
const STATUS_CLASS: Record<"none" | OwnershipVerificationStatus, string> = {
  none: "bg-[#F1F5F9] text-[#475569]",
  pending: "bg-[#EFF6FF] text-[#1D4ED8]",
  approved: "bg-[#038033] text-white",
  rejected: "bg-[#FEF2F2] text-[#B91C1C]",
  revoked: "bg-[#FFFBEB] text-[#B45309]",
};

export function OwnershipStatusChip({
  kind,
  id,
  blocked = false,
  className,
}: {
  kind: OwnershipListingKind;
  id: string;
  /** status 'blocked': the server refuses a request, so no verify link. */
  blocked?: boolean;
  className?: string;
}) {
  const t = useTranslations("DashboardAccount");
  const pathname = usePathname();
  const { status, note, loading } = useOwnershipStatus(kind, id);

  if (loading) return null;

  const closed = status === "rejected" || status === "revoked";
  const canVerify = !blocked && (status === "none" || closed);

  return (
    <span
      data-testid="ownership-status-chip"
      data-status={status}
      title={
        closed && note ? t("ownership.reason", { reason: note }) : undefined
      }
      className={cn("inline-flex flex-wrap items-center gap-x-2", className)}
    >
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4",
          STATUS_CLASS[status],
        )}
      >
        {status === "approved" && (
          <ShieldCheck aria-hidden className="size-3 shrink-0" />
        )}
        {t(`ownership.status.${status}`)}
      </span>
      {canVerify && (
        <Link
          href={ownershipVerificationUrl(kind, id, { next: pathname })}
          prefetch={false}
          className="inline-flex min-h-[44px] items-center text-[12px] font-semibold text-brand-primary underline underline-offset-2 hover:no-underline sm:min-h-0"
        >
          {t("ownership.verifyLink")}
        </Link>
      )}
    </span>
  );
}
