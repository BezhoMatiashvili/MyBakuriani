"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { X, Briefcase, ChevronDown, Trash2, Check, LoaderCircle } from "lucide-react";
import DateField from "@/components/shared/DateField";
import NumberField from "@/components/shared/NumberField";
import PhoneInput from "@/components/forms/PhoneInput";
import { SmsConsentLinkPanel } from "@/components/renter/SmsConsentLinkPanel";
import {
  datesInRange,
  nextOccupiedAfter,
  previousIsoDate,
  type OccupiedMap,
} from "@/lib/utils/availability";
import { isValidGePhone, toLocalGePhone } from "@/lib/utils/number";
import type { Tables } from "@/lib/types/database";

const clientListKeys = ["platform", "booking", "social", "direct"] as const;
type ClientListKey = (typeof clientListKeys)[number];

// Exact DB payload values for manual_bookings.client_list — must stay
// byte-identical to the pre-i18n stored values regardless of UI locale.
const CLIENT_LIST_DB_VALUES: Record<ClientListKey, string> = {
  platform: "MyBakuriani.ge",
  booking: "Booking.com",
  social: "სოციალური მედია",
  direct: "პირდაპირი კავშირი",
};

const CLIENT_LIST_KEY_BY_VALUE: Record<string, ClientListKey> = {
  "MyBakuriani.ge": "platform",
  "Booking.com": "booking",
  "სოციალური მედია": "social",
  "პირდაპირი კავშირი": "direct",
};

const inputClass =
  "w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10";

export type BookingMode = "create" | "edit" | "view";

// Returned by the parent's create/edit handlers so the modal can show an inline
// error and stay open on a date conflict instead of closing silently.
export type BookingSubmitResult = {
  ok: boolean;
  errorCode?: "datesUnavailable" | "generic";
  bookingId?: string;
};

export interface AddBookingPayload {
  checkIn: string;
  checkOut: string;
  source: string;
  guestName: string;
  guestPhone: string;
  guestsCount: string; // raw NumberField string — parent parses to int|null
  amount: string; // raw NumberField string — parent parses to numeric|null
  depositAmount: string;
  depositPaidOn: string;
  note: string;
  status: "booked" | "manual";
  clientList: string;
}

// Read-only payload for platform (guest-made) bookings, which live in the
// `bookings` table and are not editable from the calendar.
export interface ViewBooking {
  guestName: string;
  guestPhone: string | null;
  checkIn: string;
  checkOut: string;
  status: string;
}

interface AddBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode?: BookingMode;
  onSubmit?: (
    payload: AddBookingPayload,
  ) => Promise<BookingSubmitResult | void>; // create
  onSave?: (payload: AddBookingPayload) => Promise<BookingSubmitResult | void>; // edit
  onDelete?: () => Promise<BookingSubmitResult | void>; // edit → cancel booking
  initialCheckIn?: string;
  initialCheckOut?: string;
  existing?: Tables<"manual_bookings"> | null; // edit prefill
  viewBooking?: ViewBooking | null; // view (platform) data
  /** Nights already taken (booked/blocked) for this property, excluding the
   *  booking being edited. Drives the pickers' disabled days as well as the
   *  inline overlap check; the server RPC remains the hard guarantee. */
  occupied?: OccupiedMap;
}

export default function AddBookingModal({
  isOpen,
  onClose,
  mode = "create",
  onSubmit,
  onSave,
  onDelete,
  initialCheckIn = "",
  initialCheckOut = "",
  existing = null,
  viewBooking = null,
  occupied,
}: AddBookingModalProps) {
  const t = useTranslations("RenterDashboard.modals.addBooking");
  const tShared = useTranslations("DashboardShared");

  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [source, setSource] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestsCount, setGuestsCount] = useState("");
  const [amount, setAmount] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [depositPaidOn, setDepositPaidOn] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"booked" | "manual">("manual");
  const [clientListKey, setClientListKey] = useState<ClientListKey>("platform");
  const [createdBookingId, setCreatedBookingId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // (Re)hydrate the form whenever the modal opens or its source data changes.
  useEffect(() => {
    if (!isOpen) return;
    setConfirmingDelete(false);
    setSubmitError(null);
    setSubmitting(false);
    setCreatedBookingId(null);
    if (mode === "edit" && existing) {
      setCheckIn(existing.check_in);
      setCheckOut(existing.check_out);
      setSource(existing.source ?? "");
      setGuestName(existing.guest_name ?? "");
      setGuestPhone(toLocalGePhone(existing.guest_phone));
      setGuestsCount(
        existing.guests_count != null ? String(existing.guests_count) : "",
      );
      setAmount(existing.amount != null ? String(existing.amount) : "");
      setDepositAmount(
        existing.deposit_amount != null ? String(existing.deposit_amount) : "",
      );
      setDepositPaidOn(existing.deposit_paid_on ?? "");
      setNote(existing.note ?? "");
      setStatus(
        existing.status === "booked" ||
          (existing.status === "cancelled" && existing.status_before_cancel === "booked")
          ? "booked"
          : "manual",
      );
      setClientListKey(
        (existing.client_list &&
          CLIENT_LIST_KEY_BY_VALUE[existing.client_list]) ||
          "platform",
      );
    } else if (mode === "create") {
      setCheckIn(initialCheckIn);
      setCheckOut(initialCheckOut);
      setSource("");
      setGuestName("");
      setGuestPhone("");
      setGuestsCount("");
      setAmount("");
      setDepositAmount("");
      setDepositPaidOn("");
      setNote("");
      setStatus("manual");
      setClientListKey("platform");
    }
  }, [isOpen, mode, existing, initialCheckIn, initialCheckOut]);

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

  // Both selected dates are occupied. A one-day stay is therefore valid; only
  // an inverted range or an already occupied day is rejected here.
  // guarantee; this just gives immediate feedback and disables submit.
  const rangeError = useMemo<string | null>(() => {
    if (mode === "view" || !checkIn || !checkOut) return null;
    if (checkOut < checkIn) return t("invalidDates");
    if (!occupied || occupied.size === 0) return null;
    return datesInRange(checkIn, checkOut).some((d) => occupied.has(d))
      ? t("datesUnavailable")
      : null;
  }, [mode, checkIn, checkOut, occupied, t]);

  // Cap check-out at the night before the next occupied day, so a range can
  // never span an occupied block while both of its endpoints look free — the
  // RPC rejects the whole span, not just the endpoints.
  const checkOutMax = useMemo<string | undefined>(() => {
    if (mode === "view" || !checkIn) return undefined;
    const next = nextOccupiedAfter(occupied, checkIn);
    return next ? previousIsoDate(next) : undefined;
  }, [mode, checkIn, occupied]);

  const phoneInvalid = Boolean(guestPhone) && !isValidGePhone(guestPhone);
  const totalNumber = amount.trim() === "" ? null : Number(amount);
  const depositNumber =
    depositAmount.trim() === "" ? null : Number(depositAmount);
  const financeError = useMemo<string | null>(() => {
    if (depositNumber == null) return null;
    if (totalNumber == null) return t("totalRequiredForDeposit");
    if (depositNumber > totalNumber) return t("depositExceedsTotal");
    if (depositNumber > 0 && !depositPaidOn) return t("depositDateRequired");
    return null;
  }, [depositNumber, totalNumber, depositPaidOn, t]);
  const remainingAmount =
    totalNumber != null && depositNumber != null
      ? Math.max(0, totalNumber - depositNumber)
      : null;

  const buildPayload = (): AddBookingPayload => ({
    checkIn,
    checkOut,
    source,
    guestName,
    guestPhone: guestPhone ? "+995" + guestPhone : "",
    guestsCount,
    amount,
    depositAmount,
    depositPaidOn,
    note,
    status,
    clientList: CLIENT_LIST_DB_VALUES[clientListKey],
  });

  async function handleSubmit() {
    setSubmitError(null);
    if (rangeError) return;
    if (phoneInvalid || financeError) return;
    const fn = mode === "edit" ? onSave : onSubmit;
    setSubmitting(true);
    try {
      const res = await fn?.(buildPayload());
      // Keep the modal open and show the reason on a date conflict.
      if (res && res.ok === false) {
        setSubmitError(
          res.errorCode === "datesUnavailable"
            ? t("datesUnavailable")
            : t("genericError"),
        );
        return;
      }
      if (mode === "create" && res?.bookingId) {
        setCreatedBookingId(res.bookingId);
        return;
      }
      onClose();
    } catch {
      setSubmitError(t("genericError"));
    } finally {
      setSubmitting(false);
    }
  }

  const headerTitle =
    mode === "view"
      ? t("viewTitle")
      : mode === "edit"
        ? t("editTitle")
        : t("title");
  const headerSubtitle =
    mode === "view"
      ? t("platformNotice")
      : mode === "edit"
        ? t("editSubtitle")
        : t("subtitle");

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
            className="relative z-10 max-h-[90dvh] w-full max-w-[520px] overflow-y-auto rounded-[24px] bg-white p-6 shadow-[0px_24px_60px_-12px_rgba(15,23,42,0.25)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#DCFCE7] text-[#16A34A]">
                  <Briefcase className="h-4 w-4" strokeWidth={2.3} />
                </span>
                <div>
                  <h2 className="text-[16px] font-black text-[#0F172A]">
                    {headerTitle}
                  </h2>
                  <p className="mt-0.5 text-[12px] font-medium text-[#64748B]">
                    {headerSubtitle}
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

            {mode === "view" && viewBooking ? (
              <ViewBody booking={viewBooking} t={t} tShared={tShared} />
            ) : createdBookingId ? (
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
              <>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSubmit();
                  }}
                  noValidate
                >
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <Field label={tShared("checkIn")}>
                      <DateField
                        value={checkIn}
                        onChange={(v) => {
                          setCheckIn(v);
                          // A check-out left beyond the new check-in's next
                          // occupied night would be unreachable in its own
                          // picker; clear it rather than strand an invalid value.
                          if (checkOut && checkOut < v) setCheckOut("");
                        }}
                        placeholder={t("datePlaceholder")}
                        className="h-[42px]"
                        occupied={occupied}
                      />
                    </Field>
                    <Field label={tShared("checkOut")}>
                      <DateField
                        value={checkOut}
                        onChange={setCheckOut}
                        placeholder={t("datePlaceholder")}
                        className="h-[42px]"
                        min={checkIn || undefined}
                        max={checkOutMax}
                        occupied={occupied}
                      />
                    </Field>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <Field label={tShared("guest")}>
                      <input
                        type="text"
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        placeholder={t("guestPlaceholder")}
                        className={inputClass}
                      />
                    </Field>
                    <Field label={tShared("phone")}>
                      <PhoneInput
                        value={guestPhone}
                        onChange={setGuestPhone}
                        error={
                          guestPhone && !isValidGePhone(guestPhone)
                            ? tShared("invalidPhone")
                            : null
                        }
                      />
                    </Field>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <Field label={t("guestsLabel")}>
                      <NumberField
                        value={guestsCount}
                        onChange={setGuestsCount}
                        min={1}
                        max={99}
                        integer
                        placeholder={t("guestsPlaceholder")}
                      />
                    </Field>
                    <Field label={t("amountLabel")}>
                      <NumberField
                        value={amount}
                        onChange={(value) => {
                          setAmount(value);
                          if (
                            mode === "create" &&
                            value.trim() &&
                            depositAmount === ""
                          ) {
                            setDepositAmount("0");
                          }
                        }}
                        min={0}
                        max={999999}
                        decimals={2}
                        suffix="₾"
                        placeholder={t("amountPlaceholder")}
                      />
                    </Field>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <Field label={t("depositLabel")}>
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
                        placeholder={t("depositPlaceholder")}
                      />
                    </Field>
                    <Field label={t("depositPaidOnLabel")}>
                      <DateField
                        value={depositPaidOn}
                        onChange={setDepositPaidOn}
                        disabled={depositNumber == null || depositNumber <= 0}
                        placeholder={t("datePlaceholder")}
                        className="h-[42px]"
                      />
                    </Field>
                  </div>

                  <div className="mt-3">
                    <Field label={t("remainingLabel")}>
                      <div className="flex h-[42px] items-center rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 text-[13px] font-black text-[#334155]">
                        {remainingAmount == null
                          ? t("notSpecified")
                          : `${remainingAmount.toFixed(2)} ₾`}
                      </div>
                    </Field>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <Field label={t("sourceLabel")}>
                      <input
                        type="text"
                        value={source}
                        onChange={(e) => setSource(e.target.value)}
                        placeholder={t("sourcePlaceholder")}
                        className={inputClass}
                      />
                    </Field>
                    <Field label={t("clientList")}>
                      <div className="relative">
                        <select
                          value={clientListKey}
                          onChange={(e) =>
                            setClientListKey(e.target.value as ClientListKey)
                          }
                          className="w-full appearance-none rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 pr-10 text-[13px] font-semibold text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
                        >
                          {clientListKeys.map((key) => (
                            <option key={key} value={key}>
                              {t(`clientLists.${key}`)}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                      </div>
                    </Field>
                  </div>

                  <div className="mt-3">
                    <Field label={t("statusLabel")}>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setStatus("manual")}
                          className={`rounded-xl border px-4 py-2.5 text-[12px] font-bold transition-colors ${
                            status === "manual"
                              ? "border-[#F59E0B] bg-[#FEF3C7] text-[#D97706]"
                              : "border-[#E2E8F0] bg-white text-[#64748B]"
                          }`}
                        >
                          {t("manual")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setStatus("booked")}
                          className={`rounded-xl border px-4 py-2.5 text-[12px] font-bold transition-colors ${
                            status === "booked"
                              ? "border-[#EF4444] bg-[#FEE2E2] text-[#DC2626]"
                              : "border-[#E2E8F0] bg-white text-[#64748B]"
                          }`}
                        >
                          {t("booked")}
                        </button>
                      </div>
                    </Field>
                  </div>

                  <div className="mt-3">
                    <Field label={tShared("note")}>
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={2}
                        placeholder={t("notePlaceholder")}
                        className="w-full resize-none rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#0F172A] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/10"
                      />
                    </Field>
                  </div>

                  <button
                    type="submit"
                    disabled={
                      submitting ||
                      Boolean(rangeError) ||
                      Boolean(financeError) ||
                      phoneInvalid ||
                      !guestName.trim()
                    }
                    className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] py-3 text-[13px] font-black text-white transition-colors hover:bg-[#1E40AF] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {mode === "edit" ? tShared("save") : tShared("add")}
                  </button>

                  {(rangeError || financeError || submitError) && (
                    <div className="mt-3 rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-3">
                      <p className="text-[12px] font-semibold text-[#B91C1C]">
                        {rangeError ?? financeError ?? submitError}
                      </p>
                    </div>
                  )}
                </form>

                {mode === "edit" && existing && existing.status !== "cancelled" && (
                  <SmsConsentLinkPanel bookingId={existing.id} />
                )}

                {mode === "edit" &&
                  (confirmingDelete ? (
                    <div className="mt-3 rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-3">
                      <p className="text-[12px] font-semibold text-[#B91C1C]">
                        {t("confirmCancel")}
                      </p>
                      <div className="mt-2.5 flex gap-2">
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={async () => {
                            setSubmitError(null);
                            setSubmitting(true);
                            const result = await onDelete?.();
                            setSubmitting(false);
                            if (result && result.ok === false) {
                              setSubmitError(t("cancelError"));
                              return;
                            }
                            onClose();
                          }}
                          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#EF4444] py-2.5 text-[12px] font-black text-white transition-colors hover:bg-[#DC2626] disabled:opacity-60"
                        >
                          {submitting ? (
                            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="h-3.5 w-3.5" strokeWidth={2.6} />
                          )}
                          {t("confirmCancelYes")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingDelete(false)}
                          className="inline-flex flex-1 items-center justify-center rounded-lg border border-[#E2E8F0] bg-white py-2.5 text-[12px] font-bold text-[#64748B] transition-colors hover:bg-[#F1F5F9]"
                        >
                          {tShared("cancel")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(true)}
                      className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#FECACA] bg-white py-2.5 text-[13px] font-black text-[#DC2626] transition-colors hover:bg-[#FEF2F2]"
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={2.3} />
                      {t("cancelBooking")}
                    </button>
                  ))}
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function ViewBody({
  booking,
  t,
  tShared,
}: {
  booking: ViewBooking;
  t: ReturnType<typeof useTranslations>;
  tShared: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="mt-5 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <ReadField label={tShared("checkIn")} value={booking.checkIn} />
        <ReadField label={tShared("checkOut")} value={booking.checkOut} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <ReadField label={tShared("guest")} value={booking.guestName || "—"} />
        <ReadField label={tShared("phone")} value={booking.guestPhone || "—"} />
      </div>
      <div className="rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3 text-[12px] font-semibold text-[#92400E]">
        {t("platformNotice")}
      </div>
    </div>
  );
}

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-[#94A3B8]">
        {label}
      </label>
      <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2.5 text-[13px] font-semibold text-[#0F172A]">
        {value}
      </div>
    </div>
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
