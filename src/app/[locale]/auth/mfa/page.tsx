"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { safeInternalPath } from "@/lib/security";

type Enrollment = { id: string; totp: { qr_code: string; secret: string } };

export default function AdminMfaPage() {
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace(`/auth/login?next=${encodeURIComponent(next)}`); return; }
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const verified = factors?.totp.find((factor) => factor.status === "verified");
      if (verified) { setEnrollment({ id: verified.id, totp: { qr_code: "", secret: "" } }); return; }
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "MyBakuriani administrator", issuer: "MyBakuriani" });
      if (enrollError || !data) setError("Could not start MFA enrollment. Please try again.");
      else setEnrollment(data as Enrollment);
    };
    void load();
  }, [next, router]);

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (!enrollment || !/^\d{6}$/.test(code)) { setError("Enter the six-digit code from your authenticator."); return; }
    setBusy(true); setError(null);
    const supabase = createClient();
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: enrollment.id });
    if (challengeError || !challenge) { setError("Could not verify MFA. Please retry."); setBusy(false); return; }
    const { error: verifyError } = await supabase.auth.mfa.verify({ factorId: enrollment.id, challengeId: challenge.id, code });
    if (verifyError) { setError("That code is invalid or expired."); setBusy(false); return; }
    await supabase.auth.refreshSession();
    router.replace(next);
    router.refresh();
  }

  return <main className="mx-auto flex min-h-[70vh] w-full max-w-md items-center px-5"><section className="w-full rounded-2xl border bg-white p-6 shadow-sm"><h1 className="text-xl font-bold">Administrator verification</h1><p className="mt-2 text-sm text-slate-600">Multi-factor authentication is required before opening administrator tools.</p>{enrollment?.totp.qr_code && <img className="mx-auto my-5 h-48 w-48" src={enrollment.totp.qr_code} alt="Scan this QR code in your authenticator app" />}{enrollment?.totp.secret && <p className="break-all rounded bg-slate-100 p-2 text-xs">Manual key: {enrollment.totp.secret}</p>}<form onSubmit={verify} className="mt-5 space-y-3"><label className="block text-sm font-medium" htmlFor="mfa-code">Authenticator code</label><input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} className="w-full rounded border p-3 tracking-[0.4em]" /><button disabled={busy || !enrollment} className="w-full rounded bg-slate-900 p-3 font-semibold text-white disabled:opacity-50">{busy ? "Verifying…" : "Verify and continue"}</button>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}</form></section></main>;
}
