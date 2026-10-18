"use client";

import Image from "next/image";
import { BedDouble, DoorOpen, Maximize, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { HotelRoom } from "@/lib/hotel-rooms";
import { formatPricePerNight } from "@/lib/utils/format";
import { applyDiscount, isDiscountActive } from "@/lib/utils/pricing";

interface Props {
  rooms: HotelRoom[];
  discountPercent: number | null | undefined;
  discountExpiresAt: string | null | undefined;
}

/** A hotel's room types (C45) on /hotels/[id]: photos, facts, price per night. */
export default function HotelRooms({
  rooms,
  discountPercent,
  discountExpiresAt,
}: Props) {
  const t = useTranslations("HotelDetail");
  const tDetail = useTranslations("PropertyDetail");
  const locale = useLocale();
  const discounted = isDiscountActive(discountPercent, discountExpiresAt);

  return (
    <div
      data-testid="hotel-rooms"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
    >
      {rooms.map((room, i) => (
        <article
          key={i}
          className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white"
        >
          {room.photos.length > 0 ? (
            <div className="flex snap-x snap-mandatory overflow-x-auto">
              {room.photos.map((src, j) => (
                <div
                  key={j}
                  className="relative aspect-[4/3] w-full shrink-0 snap-start bg-[#F1F5F9]"
                >
                  <Image
                    src={src}
                    alt={t("roomPhotoAlt", { name: room.name, n: j + 1 })}
                    fill
                    sizes="(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex aspect-[4/3] items-center justify-center bg-[#F1F5F9]">
              <BedDouble className="size-10 text-[#CBD5E1]" />
            </div>
          )}

          <div className="space-y-2 p-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="min-w-0 text-[16px] font-extrabold leading-6 text-[#0F172A] [overflow-wrap:anywhere]">
                {room.name}
              </h3>
              <div className="shrink-0 text-right">
                {discounted && (
                  <span className="block text-[11px] font-bold text-[#94A3B8] line-through">
                    {formatPricePerNight(room.price, locale)}
                  </span>
                )}
                <span className="text-[15px] font-black leading-6 text-[#0F172A]">
                  {formatPricePerNight(
                    Math.round(
                      applyDiscount(
                        room.price,
                        discountPercent,
                        discountExpiresAt,
                      ),
                    ),
                    locale,
                  )}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] font-medium text-[#64748B]">
              <span className="inline-flex items-center gap-1">
                <Users className="size-4 text-brand-accent" />
                {tDetail("guests", { count: room.guests })}
              </span>
              {room.beds != null && (
                <span className="inline-flex items-center gap-1">
                  <BedDouble className="size-4 text-brand-accent" />
                  {t("roomBeds", { count: room.beds })}
                </span>
              )}
              {room.area_sqm != null && (
                <span className="inline-flex items-center gap-1">
                  <Maximize className="size-4 text-brand-accent" />
                  {tDetail("areaSqm", { area: room.area_sqm })}
                </span>
              )}
              {room.quantity > 1 && (
                <span className="inline-flex items-center gap-1">
                  <DoorOpen className="size-4 text-brand-accent" />
                  {t("roomQuantity", { count: room.quantity })}
                </span>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
