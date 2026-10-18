"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { LoaderCircle, MessageSquareText, Send } from "lucide-react";

type ConsentStatus =
  | "not_requested"
  | "legacy_unverified"
  | "pending"
  | "accepted"
  | "declined"
  | "revoked";

type StatusPayload = {
  status: ConsentStatus;
  marketingConsent: boolean;
  phoneValid: boolean;
  guestDeclined: boolean;
  canRequest: boolean;
  sms: { status: "queued" | "sent" | "failed"; requestedAt: string | null } | null;
  resendAt: string | null;
};

// The platform texts the consent link to the guest; the owner only asks for
// the SMS and sees its status, never the link itself.
const SEND_ERROR_KEYS: Record<string, string> = {
  valid_phone_required: "smsPhoneRequired",
  consent_declined: "guestDeclined",
  insufficient_sms_credit: "noCredit",
  phone_rate_limited: "phoneLimited",
  daily_limit: "dailyLimit",
};

export function SmsConsentLinkPanel({ bookingId }: { bookingId: string }) {
  const t = useTranslations("RenterDashboard.modals.addBooking.smsConsent");
  const [payload, setPayload] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = payload?.status ?? null;

  const loadStatus = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    try {
      const response = await fetch(
        `/api/renter/manual-bookings/${bookingId}/sms-consent-link`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("status_failed");
      setPayload((await response.json()) as StatusPayload);
      if (!background) setError(null);
    } catch {
      if (!background) setError(t("loadError"));
    } finally {
      if (!background) setLoading(false);
    }
  }, [bookingId, t]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const waiting = status === "pending" || payload?.sms?.status === "queued";
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => void loadStatus(true), 5_000);
    return () => window.clearInterval(timer);
  }, [loadStatus, waiting]);

  const send = async () => {
    if (sending) return;
    if (status === "pending" && !window.confirm(t("resendConfirm"))) {
      return;
    }
    setSending(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/renter/manual-bookings/${bookingId}/sms-consent-link`,
        { method: "POST" },
      );
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok && body?.error !== "consent_already_accepted") {
        const key = body?.error ? SEND_ERROR_KEYS[body.error] : undefined;
        setError(t(key ?? "sendError"));
        return;
      }
      await loadStatus(true);
    } catch {
      setError(t("sendError"));
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="mt-4 rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#2563EB]">
          <MessageSquareText className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[13px] font-black text-[#1E3A8A]">{t("title")}</h3>
          <p className="mt-1 text-[11px] leading-4 text-[#475569]">{t("smsHelp")}</p>
          <p className="mt-2 text-[11px] font-bold text-[#334155]">
            {t("statusLabel")}: {loading || status === null ? t("loading") : status === "not_requested" ? t("notRequested") : t(`statuses.${status}`)}
          </p>
          {!loading && payload?.sms && (
            <p className="mt-1 text-[11px] font-semibold text-[#475569]">{t(`smsStatuses.${payload.sms.status}`)}</p>
          )}
        </div>
      </div>

      {!loading && status !== null && status !== "accepted" && !payload?.guestDeclined && (
        <button
          type="button"
          disabled={!payload?.canRequest || sending}
          onClick={() => void send()}
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#2563EB] px-4 text-[12px] font-black text-white disabled:opacity-50"
        >
          {sending ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
          {payload?.sms ? t("resend") : t("send")}
        </button>
      )}

      {error && <p className="mt-2 text-[11px] font-semibold text-[#B91C1C]">{error}</p>}
      {!loading && !error && payload && !payload.phoneValid && status !== "accepted" && (
        <p className="mt-2 text-[11px] font-semibold text-[#B45309]">{t("smsPhoneRequired")}</p>
      )}
      {!loading && !error && payload?.guestDeclined && (
        <p className="mt-2 text-[11px] font-semibold text-[#475569]">{t("guestDeclined")}</p>
      )}
      {!loading && !error && payload?.resendAt && !payload.guestDeclined && (
        <p className="mt-2 text-[11px] font-semibold text-[#475569]">{t("cooldown")}</p>
      )}
    </section>
  );
}
