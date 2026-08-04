"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, Copy, Link2, LoaderCircle, Share2 } from "lucide-react";

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
  canGenerate: boolean;
};

export function SmsConsentLinkPanel({ bookingId }: { bookingId: string }) {
  const t = useTranslations("RenterDashboard.modals.addBooking.smsConsent");
  const locale = useLocale();
  const [status, setStatus] = useState<ConsentStatus | null>(null);
  const [canGenerate, setCanGenerate] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    try {
      const response = await fetch(
        `/api/renter/manual-bookings/${bookingId}/sms-consent-link`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("status_failed");
      const payload = (await response.json()) as StatusPayload;
      setStatus(payload.status);
      setCanGenerate(payload.canGenerate);
      setError(null);
      if (payload.status === "accepted") setUrl(null);
    } catch {
      if (!background) setError(t("loadError"));
    } finally {
      if (!background) setLoading(false);
    }
  }, [bookingId, t]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (status !== "pending") return;
    const timer = window.setInterval(() => void loadStatus(true), 5_000);
    return () => window.clearInterval(timer);
  }, [loadStatus, status]);

  const generate = async () => {
    if (generating) return;
    if (
      status !== null &&
      status !== "not_requested" &&
      !window.confirm(t("reissueConfirm"))
    ) {
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/renter/manual-bookings/${bookingId}/sms-consent-link`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locale }),
        },
      );
      const payload = (await response.json().catch(() => null)) as {
        url?: string;
        error?: string;
      } | null;
      if (!response.ok || !payload?.url) {
        setError(
          payload?.error === "valid_phone_required"
            ? t("phoneRequired")
            : t("generateError"),
        );
        return;
      }
      setUrl(payload.url);
      setStatus("pending");
      setCanGenerate(true);
    } catch {
      setError(t("generateError"));
    } finally {
      setGenerating(false);
    }
  };

  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const share = async () => {
    if (!url) return;
    if (navigator.share) {
      await navigator.share({ title: t("shareTitle"), text: t("shareText"), url });
      return;
    }
    await copy();
  };

  return (
    <section className="mt-4 rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#2563EB]">
          <Link2 className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[13px] font-black text-[#1E3A8A]">{t("title")}</h3>
          <p className="mt-1 text-[11px] leading-4 text-[#475569]">{t("help")}</p>
          <p className="mt-2 text-[11px] font-bold text-[#334155]">
            {t("statusLabel")}: {loading || status === null ? t("loading") : t(`statuses.${status}`)}
          </p>
        </div>
      </div>

      {url && (
        <div className="mt-3 rounded-lg border border-[#DBEAFE] bg-white p-2.5">
          <p className="break-all text-[10px] leading-4 text-[#475569]">{url}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => void copy()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#DBEAFE] px-3 text-[11px] font-black text-[#1D4ED8]">
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? t("copied") : t("copy")}
            </button>
            <button type="button" onClick={() => void share()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#2563EB] px-3 text-[11px] font-black text-white">
              <Share2 className="size-3.5" /> {t("share")}
            </button>
          </div>
        </div>
      )}

      {!url && !loading && (
        <button
          type="button"
          disabled={!canGenerate || generating}
          onClick={() => void generate()}
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#2563EB] px-4 text-[12px] font-black text-white disabled:opacity-50"
        >
          {generating ? <LoaderCircle className="size-4 animate-spin" /> : <Link2 className="size-4" />}
          {status === "not_requested" ? t("generate") : t("regenerate")}
        </button>
      )}

      {error && <p className="mt-2 text-[11px] font-semibold text-[#B91C1C]">{error}</p>}
      {!loading && !canGenerate && status !== "accepted" && !error && (
        <p className="mt-2 text-[11px] font-semibold text-[#B45309]">{t("phoneRequired")}</p>
      )}
    </section>
  );
}
