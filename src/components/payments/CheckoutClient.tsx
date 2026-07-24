"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

/**
 * Payments deliberately have no browser checkout until a hosted PSP + signed
 * webhook integration exists.  In particular, this component must never
 * collect PAN/CVC values or invoke the historical dummy processor.
 */
export default function CheckoutClient() {
  const router = useRouter();
  const t = useTranslations("Checkout");

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#F8FAFC] px-4">
      <section className="w-full max-w-md rounded-3xl border border-[#FDE68A] bg-white p-8 text-center shadow-sm">
        <AlertTriangle className="mx-auto size-10 text-[#D97706]" aria-hidden />
        <h1 className="mt-4 text-xl font-black text-[#0F172A]">{t("brand")}</h1>
        <p className="mt-2 text-sm leading-6 text-[#475569]">
          Payments are temporarily unavailable.
        </p>
        <button
          type="button"
          onClick={() => router.replace("/dashboard")}
          className="mt-6 rounded-xl bg-[#2563EB] px-5 py-3 text-sm font-bold text-white"
        >
          {t("errors.backToDashboard")}
        </button>
      </section>
    </main>
  );
}
