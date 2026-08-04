"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { Ban, X, UserPlus } from "lucide-react";
import DateField from "@/components/shared/DateField";
import NumberField from "@/components/shared/NumberField";
import PhoneInput from "@/components/forms/PhoneInput";
import { SmsConsentLinkPanel } from "@/components/renter/SmsConsentLinkPanel";
import { isValidGePhone, toLocalGePhone } from "@/lib/utils/number";
import {
  datesInRange,
  isDateConflictError,
  nextOccupiedAfter,
  occupancyWindow,
  previousIsoDate,
  type OccupiedMap,
} from "@/lib/utils/availability";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import type { Tables } from "@/lib/types/database";

interface GuestFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  createMode?: "booking" | "blacklist";
  guest?: Tables<"renter_guests"> | null;
  bookingGuest?: Tables<"renter_guests"> | null;
  properties: Tables<"properties">[];
}

export default function GuestFormModal({
  isOpen,
  onClose,
  onSaved,
  createMode = "booking",
  guest,
  bookingGuest,
  properties,
}: GuestFormModalProps) {
  const t = useTranslations("RenterDashboard.modals.guestForm");
  const tShared = useTranslations("DashboardShared");
  const tBooking = useTranslations("RenterDashboard.modals.addBooking");

  const { user } = useAuth();
  const supabase = createClient();

  const isEdit = Boolean(guest) && !bookingGuest;
  const isBlacklistCreate =
    createMode === "blacklist" && !guest && !bookingGuest;
  const requiresBooking = !isEdit && !isBlacklistCreate;
  const activeGuest = bookingGuest ?? guest;

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [note, setNote] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [amount, setAmount] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [depositPaidOn, setDepositPaidOn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [createdBookingId, setCreatedBookingId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const [legacyCheckIn, legacyCheckOut] = bookingGuest
        ? splitVisitDates(bookingGuest.visit_dates)
        : ["", ""];
      setName(activeGuest?.name ?? "");
      setPhone(toLocalGePhone(activeGuest?.phone));
      setCheckIn(legacyCheckIn);
      setCheckOut(legacyCheckOut);
      setNote(activeGuest?.note ?? "");
      setPropertyId(properties[0]?.id ?? "");
      setAmount("");
      setDepositAmount("");
      setDepositPaidOn("");
      setError(null);
      setCreatedBookingId(null);
    }
  }, [isOpen, activeGuest, bookingGuest, properties]);

  // Nights already taken on the chosen property. This form writes through the
  // same overlap-safe RPCs as the calendar, so its pickers must show the same
  // unavailable days — otherwise the owner only learns of a clash on submit.
  const [occupied, setOccupied] = useState<OccupiedMap>(new Map());

  useEffect(() => {
    if (!isOpen || isBlacklistCreate || !propertyId) {
      setOccupied(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      const [from, to] = occupancyWindow();
      const { data } = await supabase
        .from("calendar_blocks")
        .select("date, status")
        .eq("property_id", propertyId)
        .in("status", ["booked", "blocked"])
        .gte("date", from)
        .lte("date", to);
      if (cancelled || !data) return;
      setOccupied(
        new Map(data.map((b) => [b.date, b.status as "booked" | "blocked"])),
      );
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isBlacklistCreate, propertyId]);

  const checkOutMax = useMemo<string | undefined>(() => {
    if (!checkIn) return undefined;
    const next = nextOccupiedAfter(occupied, checkIn);
    return next ? previousIsoDate(next) : undefined;
  }, [checkIn, occupied]);

  // The pickers already make occupied endpoints unpickable, but `occupied`
  // loads asynchronously — a range chosen before it arrives has no clamp. Check
  // the whole span (inclusive, mirroring the RPC) so submit is disabled rather
  // than deferring the clash to the server, matching AddBookingModal.
  const datesValid = useMemo(
    () =>
      Boolean(checkIn && checkOut && checkOut >= checkIn) &&
      !datesInRange(checkIn, checkOut).some((d) => occupied.has(d)),
    [checkIn, checkOut, occupied],
  );

  const totalNumber = amount.trim() === "" ? null : Number(amount);
  const depositNumber =
    depositAmount.trim() === "" ? null : Number(depositAmount);
  const financeError = useMemo<string | null>(() => {
    if (!requiresBooking || depositNumber == null) return null;
    if (totalNumber == null) return tBooking("totalRequiredForDeposit");
    if (depositNumber > totalNumber) return tBooking("depositExceedsTotal");
    if (depositNumber > 0 && !depositPaidOn)
      return tBooking("depositDateRequired");
    return null;
  }, [requiresBooking, depositNumber, totalNumber, depositPaidOn, tBooking]);
  const remainingAmount =
    totalNumber != null && depositNumber != null
      ? Math.max(0, totalNumber - depositNumber)
      : null;

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

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (
      !trimmedName ||
      (requiresBooking && (!datesValid || !propertyId)) ||
      saving ||
      Boolean(financeError) ||
      (phone && !isValidGePhone(phone))
    )
      return;

    setSaving(true);
    try {
      const payload = {
        name: trimmedName,
        phone: phone ? "+995" + phone : null,
        note: note.trim() || null,
      };

      if (isEdit && guest) {
        const { error: updateError } = await supabase
          .from("renter_guests")
          .update(payload)
          .eq("id", guest.id);
        if (updateError) throw updateError;
      } else if (isBlacklistCreate) {
        const { error: blacklistError } = await supabase.rpc(
          "add_renter_guest_to_blacklist",
          {
            p_name: trimmedName,
            p_phone: payload.phone ?? undefined,
            p_note: payload.note ?? undefined,
          },
        );
        if (blacklistError) throw blacklistError;
      } else if (bookingGuest) {
        if (!propertyId) return;
        const { data: booking, error: bookingError } = await supabase.rpc(
          "create_manual_booking",
          {
            p_property_id: propertyId,
            p_check_in: checkIn,
            p_check_out: checkOut,
            p_guest_name: trimmedName,
            p_guest_phone: payload.phone ?? undefined,
            p_note: payload.note ?? undefined,
            p_renter_guest_id: bookingGuest.id,
            p_amount: totalNumber,
            p_deposit_amount: depositNumber,
            p_deposit_paid_on: depositPaidOn || null,
          },
        );
        if (bookingError) throw bookingError;
        // A legacy free-text visit is only migrated when the owner explicitly
        // creates this property-bound booking; ambiguous text otherwise stays.
        if (bookingGuest.visit_dates) {
          const { error: clearError } = await supabase
            .from("renter_guests")
            .update({ visit_dates: null })
            .eq("id", bookingGuest.id);
          if (clearError) throw clearError;
        }
        setCreatedBookingId(booking.id);
      } else {
        if (!user) return;
        if (!propertyId) return;
        const { data: booking, error: bookingError } = await supabase.rpc(
          "create_guest_manual_booking",
          {
            p_property_id: propertyId,
            p_check_in: checkIn,
            p_check_out: checkOut,
            p_name: trimmedName,
            p_phone: payload.phone ?? undefined,
            p_note: payload.note ?? undefined,
            p_amount: totalNumber,
            p_deposit_amount: depositNumber,
            p_deposit_paid_on: depositPaidOn || null,
          },
        );
        if (bookingError) throw bookingError;
        setCreatedBookingId(booking.id);
      }

      onSaved();
      if (!requiresBooking) onClose();
    } catch (submitError) {
      console.error("Failed to save guest", submitError);
      // A date clash is the one failure the owner can actually act on, so name
      // it instead of hiding it behind the generic retry copy. Supabase throws a
      // PostgrestError — a plain object, NOT an Error — so an `instanceof Error`
      // test would miss it and silently fall through to the generic message.
      const message =
        typeof submitError === "object" &&
        submitError !== null &&
        "message" in submitError
          ? String((submitError as { message: unknown }).message)
          : String(submitError);
      setError(
        isDateConflictError(message)
          ? tBooking("datesUnavailable")
          : tShared("genericRetry"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
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
            role="dialog"
            aria-modal="true"
            aria-labelledby="guest-form-title"
            className="relative z-10 max-h-[90dvh] w-full max-w-[520px] overflow-y-auto rounded-t-[24px] bg-white p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-[0px_24px_60px_-12px_rgba(15,23,42,0.25)] sm:rounded-[24px] sm:pb-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                    isBlacklistCreate
                      ? "bg-[#FEE2E2] text-[#DC2626]"
                      : "bg-[#DBEAFE] text-[#2563EB]"
                  }`}
                >
                  {isBlacklistCreate ? (
                    <Ban className="h-4 w-4" strokeWidth={2.3} />
                  ) : (
                    <UserPlus className="h-4 w-4" strokeWidth={2.3} />
                  )}
                </span>
                <div>
                  <h2
                    id="guest-form-title"
                    className="text-[16px] font-black text-[#0F172A]"
                  >
                    {isEdit
                      ? t("editTitle")
                      : isBlacklistCreate
                        ? t("blacklistTitle")
                        : t("newTitle")}
                  </h2>
                  <p className="mt-0.5 text-[12px] font-medium text-[#64748B]">
                    {isBlacklistCreate ? t("blacklistSubtitle") : t("subtitle")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={tShared("closeAria")}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[#94A3B8] hover:bg-[#F1F5F9]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {createdBookingId ? (
              <div className="mt-5">
                <SmsConsentLinkPanel bookingId={createdBookingId} />
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-[#0F172A] px-4 text-[13px] font-black text-white"
                >
                  {tShared("closeAria")}
                </button>
              </div>
            ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmit();
              }}
              noValidate
            >
              <div className="mt-5 space-y-3">
                <Field label={tShared("name")}>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={Boolean(bookingGuest)}
                    placeholder={t("namePlaceholder")}
                    className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
                  />
                </Field>

                <Field label={tShared("phone")}>
                  <PhoneInput
                    value={phone}
                    onChange={setPhone}
                    error={
                      phone && !isValidGePhone(phone)
                        ? tShared("invalidPhone")
                        : null
                    }
                  />
                </Field>

                {requiresBooking && (
                  <>
                    <Field label={tShared("defaultProperty")}>
                      <select
                        value={propertyId}
                        onChange={(e) => setPropertyId(e.target.value)}
                        className="w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
                      >
                        <option value="" disabled>
                          {tShared("selectProperty")}
                        </option>
                        {properties.map((property) => (
                          <option key={property.id} value={property.id}>
                            {property.title}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field label={t("checkIn")}>
                        <DateField
                          value={checkIn}
                          onChange={(v) => {
                            setCheckIn(v);
                            if (checkOut && checkOut < v) setCheckOut("");
                          }}
                          occupied={occupied}
                        />
                      </Field>
                      <Field label={t("checkOut")}>
                        <DateField
                          value={checkOut}
                          onChange={setCheckOut}
                          min={checkIn || undefined}
                          max={checkOutMax}
                          occupied={occupied}
                        />
                      </Field>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field label={tBooking("amountLabel")}>
                        <NumberField
                          value={amount}
                          onChange={(value) => {
                            setAmount(value);
                            if (value.trim() && depositAmount === "") {
                              setDepositAmount("0");
                            }
                          }}
                          min={0}
                          max={999999}
                          decimals={2}
                          suffix="₾"
                          placeholder={tBooking("amountPlaceholder")}
                        />
                      </Field>
                      <Field label={tBooking("depositLabel")}>
                        <NumberField
                          value={depositAmount}
                          onChange={(value) => {
                            setDepositAmount(value);
                            if (!value || Number(value) <= 0) setDepositPaidOn("");
                          }}
                          min={0}
                          max={999999}
                          decimals={2}
                          suffix="₾"
                          placeholder={tBooking("depositPlaceholder")}
                        />
                      </Field>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field label={tBooking("depositPaidOnLabel")}>
                        <DateField
                          value={depositPaidOn}
                          onChange={setDepositPaidOn}
                          disabled={depositNumber == null || depositNumber <= 0}
                        />
                      </Field>
                      <Field label={tBooking("remainingLabel")}>
                        <div className="flex h-[42px] items-center rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 text-[13px] font-black text-[#334155]">
                          {remainingAmount == null
                            ? tBooking("notSpecified")
                            : `${remainingAmount.toFixed(2)} ₾`}
                        </div>
                      </Field>
                    </div>
                  </>
                )}

                <Field label={tShared("note")}>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    placeholder={t("notePlaceholder")}
                    className="w-full resize-none rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
                  />
                </Field>
              </div>

              <button
                type="submit"
                disabled={
                  !name.trim() ||
                  (requiresBooking && (!datesValid || !propertyId)) ||
                  Boolean(financeError) ||
                  saving ||
                  (phone && !isValidGePhone(phone))
                    ? true
                    : false
                }
                className={`mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-black text-white transition-colors disabled:opacity-50 ${
                  isBlacklistCreate
                    ? "bg-[#DC2626] hover:bg-[#B91C1C]"
                    : "bg-[#2563EB] hover:bg-[#1E40AF]"
                }`}
              >
                {saving
                  ? tShared("saving")
                  : isBlacklistCreate
                    ? t("blacklistSave")
                    : tShared("save")}
              </button>
              {(financeError || error) && (
                <p className="mt-3 text-center text-[12px] font-semibold text-[#B91C1C]">
                  {financeError ?? error}
                </p>
              )}
            </form>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">
        {label}
      </label>
      {children}
    </div>
  );
}

function splitVisitDates(raw: string | null): [string, string] {
  const [checkIn = "", checkOut = ""] = (raw ?? "").split("/");
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  return iso.test(checkIn) && iso.test(checkOut)
    ? [checkIn, checkOut]
    : ["", ""];
}
