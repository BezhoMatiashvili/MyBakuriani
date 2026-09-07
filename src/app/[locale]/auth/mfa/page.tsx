"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { safeInternalPath } from "@/lib/security";

type Enrollment = { id: string; totp: { qr_code: string; secret: string } };

export default function AdminMfaPage() {
  const t = useTranslations("AuthMfa");
  const router = useRouter();
  const params = useSearchParams();
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const next = safeInternalPath(params.get("next")) ?? "/dashboard/admin";

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace(`/auth/login?next=${encodeURIComponent(next)}`);
        return;
      }
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const verified = factors?.totp.find(
        (factor) => factor.status === "verified",
      );
      if (verified) {
        setEnrollment({ id: verified.id, totp: { qr_code: "", secret: "" } });
        return;
      }

      const attemptEnroll = () =>
        supabase.auth.mfa.enroll({
          factorType: "totp",
          friendlyName: "MyBakuriani administrator",
          issuer: "MyBakuriani",
        });

      let result = await attemptEnroll();
      if (result.error) {
        // A friendly-name conflict (422) means an earlier, never-completed
        // enrollment left an unverified factor behind — clean it up and retry
        // once rather than dead-ending the admin out of their own dashboard.
        // `.totp` only ever holds verified factors (filtered by the SDK
        // itself), so the stale one has to be found via `.all`.
        const stale = factors?.all.find(
          (factor) =>
            factor.factor_type === "totp" && factor.status === "unverified",
        );
        if (stale) {
          await supabase.auth.mfa.unenroll({ factorId: stale.id });
          result = await attemptEnroll();
        }
      }
      if (result.error || !result.data) setError(t("enrollError"));
      else setEnrollment(result.data as Enrollment);
    };
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next, router]);

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (!enrollment || !/^\d{6}$/.test(code)) {
      setError(t("codeRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data: challenge, error: challengeError } =
      await supabase.auth.mfa.challenge({ factorId: enrollment.id });
    if (challengeError || !challenge) {
      setError(t("challengeError"));
      setBusy(false);
      return;
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: enrollment.id,
      challengeId: challenge.id,
      code,
    });
    if (verifyError) {
      setError(t("invalidCode"));
      setBusy(false);
      return;
    }
    await supabase.auth.refreshSession();
    router.replace(next);
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md items-center px-5">
      <section className="w-full rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold">{t("title")}</h1>
        <p className="mt-2 text-sm text-slate-600">{t("subtitle")}</p>
        {enrollment?.totp.qr_code && (
          <img
            className="mx-auto my-5 h-48 w-48"
            src={enrollment.totp.qr_code}
            alt={t("scanQr")}
          />
        )}
        {enrollment?.totp.secret && (
          <p className="break-all rounded bg-slate-100 p-2 text-xs">
            {t("manualKey")} {enrollment.totp.secret}
          </p>
        )}
        <form onSubmit={verify} className="mt-5 space-y-3">
          <label className="block text-sm font-medium" htmlFor="mfa-code">
            {t("codeLabel")}
          </label>
          <input
            id="mfa-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) =>
              setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            className="w-full rounded border p-3 tracking-[0.4em]"
          />
          <button
            disabled={busy || !enrollment}
            className="w-full rounded bg-slate-900 p-3 font-semibold text-white disabled:opacity-50"
          >
            {busy ? t("verifying") : t("verify")}
          </button>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
        </form>
      </section>
    </main>
  );
}
