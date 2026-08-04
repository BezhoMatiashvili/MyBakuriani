"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, LoaderCircle, MessageSquareText, ShieldCheck } from "lucide-react";

type ConsentDetails = {
  status: "pending" | "accepted" | "declined";
  phone: string | null;
  guestName: string | null;
  checkIn: string;
  checkOut: string;
  propertyTitle: string | null;
};

export function SmsConsentClient({ token }: { token: string }) {
  const t = useTranslations("SmsConsent");
  const [details, setDetails] = useState<ConsentDetails | null | undefined>(undefined);
  const [status, setStatus] = useState<ConsentDetails["status"] | "revoked" | null>(null);
  const [submitting, setSubmitting] = useState<"accept" | "decline" | "revoke" | null>(null);
  const [actionError, setActionError] = useState(false);

  useEffect(() => {
    void fetch(`/api/sms-consent/${token}`, { cache: "no-store" })
      .then(async (response) =>
        response.ok ? ((await response.json()).consent as ConsentDetails) : null,
      )
      .then((payload) => {
        setDetails(payload);
        setStatus(payload?.status ?? null);
      })
      .catch(() => setDetails(null));
  }, [token]);

  const respond = async (action: "accept" | "decline" | "revoke") => {
    if (submitting) return;
    setSubmitting(action);
    setActionError(false);
    try {
      const response = await fetch(`/api/sms-consent/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) {
        setActionError(true);
        return;
      }
      setStatus(action === "accept" ? "accepted" : action === "decline" ? "declined" : "revoked");
    } catch {
      setActionError(true);
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <main className="mx-auto flex min-h-[72vh] w-full max-w-xl items-center px-4 py-12">
      <section className="w-full rounded-[24px] border border-[#E2E8F0] bg-white p-6 shadow-[0_20px_50px_-24px_rgba(15,23,42,0.35)] sm:p-8">
        {details === undefined ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm font-semibold text-[#64748B]">
            <LoaderCircle className="size-4 animate-spin" /> {t("loading")}
          </div>
        ) : details === null || status === null ? (
          <div className="text-center">
            <ShieldCheck className="mx-auto size-12 text-[#94A3B8]" />
            <h1 className="mt-4 text-xl font-black text-[#0F172A]">{t("invalidTitle")}</h1>
            <p className="mt-2 text-sm text-[#64748B]">{t("invalidHelp")}</p>
          </div>
        ) : status === "revoked" ? (
          <div className="text-center">
            <CheckCircle2 className="mx-auto size-12 text-[#64748B]" />
            <h1 className="mt-4 text-xl font-black text-[#0F172A]">{t("revokedTitle")}</h1>
            <p className="mt-2 text-sm text-[#64748B]">{t("revokedHelp")}</p>
          </div>
        ) : (
          <>
            <div className="flex size-12 items-center justify-center rounded-2xl bg-[#DBEAFE] text-[#2563EB]">
              <MessageSquareText className="size-6" />
            </div>
            <h1 className="mt-5 text-2xl font-black text-[#0F172A]">{t("title")}</h1>
            <p className="mt-2 text-sm leading-6 text-[#64748B]">{t("description")}</p>

            <dl className="mt-5 space-y-2 rounded-xl bg-[#F8FAFC] p-4 text-sm">
              <Detail label={t("guest")} value={details.guestName || "—"} />
              <Detail label={t("phone")} value={details.phone || "—"} />
              <Detail label={t("property")} value={details.propertyTitle || "—"} />
              <Detail label={t("dates")} value={`${details.checkIn} – ${details.checkOut}`} />
            </dl>

            {status === "accepted" ? (
              <>
                <div className="mt-5 rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] p-3 text-sm font-bold text-[#166534]">
                  {t("accepted")}
                </div>
                <button type="button" disabled={Boolean(submitting)} onClick={() => void respond("revoke")} className="mt-4 min-h-12 w-full rounded-xl border border-[#FCA5A5] bg-white px-4 text-sm font-black text-[#B91C1C] disabled:opacity-50">
                  {submitting === "revoke" ? t("submitting") : t("revoke")}
                </button>
              </>
            ) : (
              <>
                {status === "declined" && (
                  <div className="mt-5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-sm font-bold text-[#475569]">
                    {t("declined")}
                  </div>
                )}
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <button type="button" disabled={Boolean(submitting)} onClick={() => void respond("decline")} className="min-h-12 rounded-xl border border-[#CBD5E1] bg-white px-4 text-sm font-black text-[#475569] disabled:opacity-50">
                    {submitting === "decline" ? t("submitting") : t("decline")}
                  </button>
                  <button type="button" disabled={Boolean(submitting)} onClick={() => void respond("accept")} className="min-h-12 rounded-xl bg-[#2563EB] px-4 text-sm font-black text-white disabled:opacity-50">
                    {submitting === "accept" ? t("submitting") : t("accept")}
                  </button>
                </div>
              </>
            )}
            <p className="mt-4 text-[11px] leading-5 text-[#94A3B8]">{t("legal")}</p>
            {actionError && (
              <p role="alert" className="mt-3 text-center text-[12px] font-bold text-[#B91C1C]">
                {t("actionError")}
              </p>
            )}
          </>
        )}
      </section>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="font-semibold text-[#64748B]">{label}</dt>
      <dd className="text-right font-bold text-[#0F172A]">{value}</dd>
    </div>
  );
}
