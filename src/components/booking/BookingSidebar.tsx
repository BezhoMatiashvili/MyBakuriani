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
    <div className="sticky top-24 rounded-2xl bg-white p-5 shadow-sm">
      {/* Price */}
      <div className="mb-4">
        <span className="text-2xl font-bold text-foreground">
          {formatPrice(pricePerNight)}
        </span>
        <span className="text-sm text-muted-foreground"> / ღამე</span>
      </div>

      {/* Min booking */}
      <p className="mb-4 text-sm text-muted-foreground">
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
      <div className="my-4 border-t border-border" />

      {/* Owner info */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative size-10 shrink-0 overflow-hidden rounded-full bg-muted">
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
            <div className="flex items-center gap-1 text-xs text-blue-600">
              <BadgeCheck className="size-3.5" />
              ვერიფიცირებული მესაკუთრე
            </div>
          )}
        </div>
      </div>

      {/* CTA */}
      <Button
        onClick={onBook}
        className="h-11 w-full gap-2 bg-blue-600 text-base font-semibold text-white hover:bg-blue-700"
      >
        დაჯავშნა
      </Button>
    </div>
  );
}
