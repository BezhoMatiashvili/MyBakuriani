"use client";

import Image from "next/image";
import { BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils/format";
import { differenceInDays } from "date-fns";

interface DateRange {
  start: Date | null;
  end: Date | null;
}

interface BookingSidebarProps {
  pricePerNight: number;
  minBookingDays: number;
  ownerName: string;
  ownerAvatar: string | null;
  isOwnerVerified: boolean;
  selectedRange: DateRange;
  onBook: () => void;
}

export function BookingSidebar({
  pricePerNight,
  minBookingDays,
  ownerName,
  ownerAvatar,
  isOwnerVerified,
  selectedRange,
  onBook,
}: BookingSidebarProps) {
  const { start, end } = selectedRange;
  const nights = start && end ? differenceInDays(end, start) : 0;
  const totalPrice = nights > 0 ? nights * pricePerNight : null;

  return (
    <div className="sticky top-24 rounded-3xl border border-[#E2E8F0] bg-white px-[29px] pb-8 pt-[29px] shadow-[0px_16px_40px_-12px_rgba(0,0,0,0.15)]">
      {/* Price */}
      <div className="mb-4">
        <span className="text-[32px] font-black leading-[32px] text-[#1E293B]">
          {formatPrice(pricePerNight)}
        </span>
        <span className="text-[15px] font-medium text-[#64748B]"> / ღამე</span>
      </div>

      {/* Min booking */}
      <p className="mb-4 text-[13px] font-medium text-[#64748B]">
        მინ. ჯავშანი: {minBookingDays} ღამე
      </p>

      {/* Total calculation */}
      {totalPrice !== null && (
        <div className="mb-4 rounded-lg bg-muted/50 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {formatPrice(pricePerNight)} x {nights} ღამე
            </span>
            <span className="font-semibold text-foreground">
              {formatPrice(totalPrice)}
            </span>
          </div>
        </div>
      )}

      {/* Divider */}
      <div className="my-6 border-t border-[#E2E8F0]" />

      {/* Owner info */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative size-14 shrink-0 overflow-hidden rounded-full border border-[#ECFDF5] bg-muted shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
          {ownerAvatar ? (
            <Image
              src={ownerAvatar}
              alt={ownerName}
              fill
              className="object-cover"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-sm font-medium text-muted-foreground">
              {ownerName.charAt(0)}
            </div>
          )}
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{ownerName}</p>
          {isOwnerVerified && (
            <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[1px] text-[#10B981]">
              <BadgeCheck className="size-3.5" />
              ვერიფიცირებული მესაკუთრე
            </div>
          )}
        </div>
      </div>

      {/* CTA */}
      <Button
        onClick={onBook}
        className="h-[55px] w-full gap-2 rounded-2xl bg-[#F97316] text-[15px] font-bold tracking-[0.375px] text-white shadow-[0px_8px_20px_rgba(249,115,22,0.25)] hover:bg-[#EA580C]"
      >
        დაჯავშნა
      </Button>
    </div>
  );
}
