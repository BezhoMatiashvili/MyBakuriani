"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { BellOff, CheckCircle2, LoaderCircle, ShieldCheck } from "lucide-react";

type OptOut = { status: "active" | "withdrawn"; propertyTitle: string | null };

export function SmsStopClient({ token }: { token: string }) {
  const t = useTranslations("SmsStop");
  const [optOut, setOptOut] = useState<OptOut | null | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState(false);
  const url = `/api/sms-stop/${encodeURIComponent(token)}`;

  useEffect(() => {
    void fetch(url, { cache: "no-store" })
      .then(async (response) =>
        response.ok ? ((await response.json()).optOut as OptOut) : null,
      )
      .then(setOptOut)
      .catch(() => setOptOut(null));
  }, [url]);

  const stop = async () => {
    if (submitting) return;
    setSubmitting(true);
    setActionError(false);
    try {
      const response = await fetch(url, { method: "POST" });
      if (!response.ok) {
        setActionError(true);
        return;
      }
      setOptOut((current) => current && { ...current, status: "withdrawn" });
    } catch {
      setActionError(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-[72vh] w-full max-w-xl items-center px-4 py-12">
      <section className="w-full rounded-[24px] border border-[#E2E8F0] bg-white p-6 shadow-[0_20px_50px_-24px_rgba(15,23,42,0.35)] sm:p-8">
        {optOut === undefined ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm font-semibold text-[#64748B]">
            <LoaderCircle className="size-4 animate-spin" /> {t("loading")}
          </div>
        ) : optOut === null ? (
          <div className="text-center">
            <ShieldCheck className="mx-auto size-12 text-[#94A3B8]" />
            <h1 className="mt-4 text-xl font-black text-[#0F172A]">
              {t("invalid")}
            </h1>
          </div>
        ) : optOut.status === "withdrawn" ? (
          <div className="text-center">
            <CheckCircle2 className="mx-auto size-12 text-[#16A34A]" />
            <h1 className="mt-4 text-xl font-black text-[#0F172A]">
              {t("title")}
            </h1>
            <p role="status" className="mt-2 text-sm leading-6 text-[#475569]">
              {t("done")}
            </p>
          </div>
        ) : (
          <>
            <div className="flex size-12 items-center justify-center rounded-2xl bg-[#FEE2E2] text-[#B91C1C]">
              <BellOff className="size-6" />
            </div>
            <h1 className="mt-5 text-2xl font-black text-[#0F172A]">
              {t("title")}
            </h1>
            {optOut.propertyTitle && (
              <dl className="mt-5 rounded-xl bg-[#F8FAFC] p-4 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <dt className="font-semibold text-[#64748B]">
                    {t("property")}
                  </dt>
                  <dd className="text-right font-bold text-[#0F172A]">
                    {optOut.propertyTitle}
                  </dd>
                </div>
              </dl>
            )}
            <button
              type="button"
              disabled={submitting}
              onClick={() => void stop()}
              className="mt-5 min-h-12 w-full rounded-xl bg-[#B91C1C] px-4 text-sm font-black text-white disabled:opacity-50"
            >
              {submitting ? t("submitting") : t("button")}
            </button>
            {actionError && (
              <p
                role="alert"
                className="mt-3 text-center text-[12px] font-bold text-[#B91C1C]"
              >
                {t("actionError")}
              </p>
            )}
          </>
        )}
      </section>
    </main>
  );
}
