"use client";

import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { Eye, Pencil, Rocket, Ticket, Percent } from "lucide-react";
import type { VipInfoTier } from "@/components/renter/VipInfoModal";

interface ListingActionsProps {
  /** Public guest-view URL — opened in a new tab. */
  viewUrl: string;
  /** Create-form edit URL. */
  editUrl: string;
  /** When provided, renders the "განცხადების დაწინაურება" promote tier row. */
  onPromote?: (tier: VipInfoTier) => void;
  /** Extra buttons rendered inline after Edit (e.g. delete, construction). */
  children?: ReactNode;
  className?: string;
}

/**
 * Shared action row for dashboard listing cards: ნახვა (view, new tab) +
 * რედაქტირება (edit) + optional promote tier row. Mirrors the renter cabinet
 * reference so every cabinet looks and behaves the same.
 */
export default function ListingActions({
  viewUrl,
  editUrl,
  onPromote,
  children,
  className,
}: ListingActionsProps) {
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={viewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-[12px] font-bold text-[#2563EB] transition-colors hover:border-[#2563EB] hover:bg-[#EFF6FF]"
        >
          <Eye className="h-3.5 w-3.5" />
          ნახვა
        </a>
        <Link
          href={editUrl}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white px-3.5 py-2.5 text-[12px] font-bold text-[#64748B] transition-colors hover:border-[#2563EB] hover:text-[#2563EB]"
        >
          <Pencil className="h-3.5 w-3.5" />
          რედაქტირება
        </Link>
        {children}
      </div>

      {onPromote && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#F1F5F9] pt-3">
          <span className="mr-auto text-[12px] font-semibold text-[#64748B]">
            განცხადების დაწინაურება:
          </span>
          <button
            type="button"
            onClick={() => onPromote("super-vip")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#FED7AA] bg-[#FFF7ED] px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-[#EA580C] transition-colors hover:bg-[#FFEDD5]"
          >
            <Rocket className="h-3 w-3" />
            SUPER VIP
          </button>
          <button
            type="button"
            onClick={() => onPromote("vip")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#FBCFE8] bg-[#FCE7F3] px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-[#BE185D] transition-colors hover:bg-[#FBCFE8]"
          >
            <Ticket className="h-3 w-3" />
            VIP
          </button>
          <button
            type="button"
            onClick={() => onPromote("discount")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#86EFAC] bg-[#DCFCE7] px-3 py-1.5 text-[11px] font-black tracking-wide text-[#15803D] transition-colors hover:bg-[#BBF7D0]"
          >
            <Percent className="h-3 w-3" />
            ფასდაკლება
          </button>
        </div>
      )}
    </div>
  );
}
