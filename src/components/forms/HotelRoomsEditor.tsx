"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import NumberField from "@/components/shared/NumberField";
import PhotoUploader from "@/components/forms/PhotoUploader";
import {
  MAX_HOTEL_ROOMS,
  ROOM_AREA_MAX,
  ROOM_BEDS_MAX,
  ROOM_GUESTS_MAX,
  ROOM_NAME_MAX,
  ROOM_PHOTOS_MAX,
  ROOM_PRICE_MAX,
  ROOM_QUANTITY_MAX,
  emptyRoomDraft,
  type HotelRoomDraft,
} from "@/lib/hotel-rooms";
import { cn } from "@/lib/utils";

interface Props {
  rooms: HotelRoomDraft[];
  /** A state setter: photo uploads finish late and must patch the newest list. */
  onChange: Dispatch<SetStateAction<HotelRoomDraft[]>>;
  /** Index of the room the last validation stopped at (red border). */
  invalidIndex?: number | null;
  error?: boolean;
}

/** The rooms of a hotel listing (C45), step 3 of the rental wizard. */
export default function HotelRoomsEditor({
  rooms,
  onChange,
  invalidIndex = null,
  error = false,
}: Props) {
  const t = useTranslations("CreateRental.hotel");

  const update = (key: string, patch: Partial<HotelRoomDraft>) =>
    onChange((prev) =>
      prev.map((room) => (room.key === key ? { ...room, ...patch } : room)),
    );
  const remove = (key: string) =>
    onChange((prev) => prev.filter((room) => room.key !== key));
  const add = () =>
    onChange((prev) =>
      prev.length >= MAX_HOTEL_ROOMS
        ? prev
        : [...prev, emptyRoomDraft(crypto.randomUUID())],
    );

  return (
    <div
      data-field="hotelRooms"
      data-testid="hotel-rooms-editor"
      className="space-y-3 scroll-mt-24"
    >
      <div className="space-y-1">
        <label
          className={cn(
            "text-[13px] font-bold",
            error ? "text-[#EF4444]" : "text-[#334155]",
          )}
        >
          {t("roomsTitle")}
          <span className="ml-0.5 text-[#EF4444]">*</span>
        </label>
        <p className="text-xs font-medium leading-5 text-[#64748B]">
          {t("roomsHelper")}
        </p>
      </div>

      {rooms.map((room, i) => (
        <div
          key={room.key}
          data-testid="hotel-room"
          className={cn(
            "space-y-4 rounded-2xl border bg-[#F8FAFC] p-4",
            invalidIndex === i
              ? "border-[#EF4444] ring-2 ring-[#FEE2E2]"
              : "border-[#E2E8F0]",
          )}
        >
          <div className="flex min-h-11 items-center justify-between gap-2">
            <span className="text-sm font-extrabold text-[#0F172A]">
              {t("roomN", { n: i + 1 })}
            </span>
            {rooms.length > 1 && (
              <button
                type="button"
                onClick={() => remove(room.key)}
                aria-label={t("removeRoom", { n: i + 1 })}
                className="flex size-11 items-center justify-center rounded-xl text-[#94A3B8] transition-colors hover:bg-white hover:text-[#EF4444]"
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </div>

          <RoomField label={t("fields.name")} required>
            <input
              type="text"
              value={room.name}
              maxLength={ROOM_NAME_MAX}
              onChange={(e) => update(room.key, { name: e.target.value })}
              placeholder={t("namePlaceholder")}
              className="h-12 w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-sm outline-none transition-colors focus:border-[#2563EB] focus:ring-2 focus:ring-[#DBEAFE]"
            />
          </RoomField>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <RoomField label={t("fields.price")} required>
              <NumberField
                value={room.price}
                onChange={(price) => update(room.key, { price })}
                min={1}
                max={ROOM_PRICE_MAX}
                integer
                accent="blue"
                suffix="₾"
                placeholder="120"
              />
            </RoomField>
            <RoomField label={t("fields.guests")} required>
              <NumberField
                value={room.guests}
                onChange={(guests) => update(room.key, { guests })}
                min={1}
                max={ROOM_GUESTS_MAX}
                integer
                stepper
                accent="blue"
              />
            </RoomField>
            <RoomField label={t("fields.quantity")} required>
              <NumberField
                value={room.quantity}
                onChange={(quantity) => update(room.key, { quantity })}
                min={1}
                max={ROOM_QUANTITY_MAX}
                integer
                stepper
                accent="blue"
              />
            </RoomField>
            <RoomField label={t("fields.beds")}>
              <NumberField
                value={room.beds}
                onChange={(beds) => update(room.key, { beds })}
                min={1}
                max={ROOM_BEDS_MAX}
                integer
                stepper
                accent="blue"
              />
            </RoomField>
            <RoomField label={t("fields.area")}>
              <NumberField
                value={room.area}
                onChange={(area) => update(room.key, { area })}
                min={1}
                max={ROOM_AREA_MAX}
                decimals={1}
                accent="blue"
                placeholder="25"
              />
            </RoomField>
          </div>

          <RoomField label={t("photos")}>
            <PhotoUploader
              photos={room.photos}
              onPhotosChange={(photos) => update(room.key, { photos })}
              maxPhotos={ROOM_PHOTOS_MAX}
            />
          </RoomField>
        </div>
      ))}

      {rooms.length < MAX_HOTEL_ROOMS && (
        <button
          type="button"
          onClick={add}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#93C5FD] bg-white text-sm font-bold text-[#2563EB] transition-colors hover:bg-[#EFF6FF]"
        >
          <Plus className="size-4" />
          {t("addRoom")}
        </button>
      )}
    </div>
  );
}

function RoomField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-[12px] font-bold leading-4 text-[#475569]">
        {label}
        {required && <span className="ml-0.5 text-[#EF4444]">*</span>}
      </label>
      {children}
    </div>
  );
}
