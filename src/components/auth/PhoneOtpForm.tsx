"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import PhoneInput from "@/components/forms/PhoneInput";
import { localToE164, phoneAuthErrorKey } from "@/lib/auth/phone";
import { formatPhone } from "@/lib/utils/format";

// Phone sign-in / phone change (C48): number -> SMS code -> verified. Shared by
// /auth/login and /dashboard/account; the caller decides what the code does.

const CODE_LENGTH = 6;
// Supabase lets a number ask again after 60 s (sms_max_frequency).
const RESEND_COOLDOWN_SECONDS = 60;

interface PhoneOtpFormProps {
  /** Sends a code to the +995 number; throws the Supabase error. */
  onSend: (phone: string) => Promise<void>;
  /** Checks the code; throws the Supabase error. Resolves once the caller took over. */
  onVerify: (phone: string, code: string) => Promise<void>;
  idPrefix: string;
  hint?: string;
  onCancel?: () => void;
}

export default function PhoneOtpForm({
  onSend,
  onVerify,
  idPrefix,
  hint,
  onCancel,
}: PhoneOtpFormProps) {
  const t = useTranslations("PhoneOtp");
  const [local, setLocal] = useState("");
  const [phone, setPhone] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  // Bumped on every sent code so the WebOTP listener restarts for it.
  const [sends, setSends] = useState(0);
  const verifyRef = useRef<(value: string) => Promise<void>>(async () => {});

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  function showError(err: unknown) {
    setError(t(`errors.${phoneAuthErrorKey(err)}`));
  }

  async function send(target: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await onSend(target);
      setPhone(target);
      setCode("");
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setSends((n) => n + 1);
      return true;
    } catch (err) {
      showError(err);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function verify(value: string) {
    if (!phone || busy || value.length !== CODE_LENGTH) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await onVerify(phone, value);
      // Stay busy: the caller navigates or closes the form.
    } catch (err) {
      showError(err);
      setBusy(false);
    }
  }

  useEffect(() => {
    verifyRef.current = verify;
  });

  // Android Chrome reads the SMS's "@host #code" line and offers the code
  // (WebOTP). Elsewhere autocomplete="one-time-code" covers it.
  useEffect(() => {
    if (!phone || !("OTPCredential" in window)) return;
    const ac = new AbortController();
    navigator.credentials
      .get({
        otp: { transport: ["sms"] },
        signal: ac.signal,
      } as CredentialRequestOptions)
      .then((credential) => {
        const received = (credential as { code?: string } | null)?.code ?? "";
        if (new RegExp(`^\\d{${CODE_LENGTH}}$`).test(received)) {
          setCode(received);
          void verifyRef.current(received);
        }
      })
      .catch(() => {});
    return () => ac.abort();
  }, [phone, sends]);

  async function resend() {
    if (!phone || busy || cooldown > 0) return;
    if (await send(phone)) setNotice(t("codeResent"));
  }

  function changeNumber() {
    setPhone(null);
    setCode("");
    setError(null);
    setNotice(null);
  }

  if (!phone) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const target = localToE164(local);
          if (!target) {
            setError(t("errors.invalidPhone"));
            return;
          }
          void send(target);
        }}
        noValidate
        className="space-y-5"
      >
        <div className="space-y-2">
          <label htmlFor={`${idPrefix}-phone`} className="text-sm font-medium">
            {t("phoneLabel")}
          </label>
          <PhoneInput
            id={`${idPrefix}-phone`}
            autoComplete="tel-national"
            value={local}
            onChange={(value) => {
              setLocal(value);
              setError(null);
            }}
            error={error}
          />
          {hint && <p className="text-xs text-[#94A3B8]">{hint}</p>}
        </div>
        <Button
          type="submit"
          disabled={busy}
          className="min-h-11 w-full lg:min-h-0"
          size="lg"
        >
          {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
          {t("getSmsCode")}
        </Button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 w-full text-xs font-medium text-[#94A3B8] hover:underline lg:min-h-0"
          >
            {t("cancel")}
          </button>
        )}
      </form>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (code.length !== CODE_LENGTH) {
          setError(t("errors.invalidOtp"));
          return;
        }
        void verify(code);
      }}
      noValidate
      className="space-y-5"
    >
      <p className="text-sm text-[#475569]">
        {t("codeSentTo", { phone: formatPhone(phone) })}
      </p>
      <div className="space-y-2">
        <label htmlFor={`${idPrefix}-code`} className="text-sm font-medium">
          {t("otpLabel")}
        </label>
        <input
          id={`${idPrefix}-code`}
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={CODE_LENGTH}
          autoFocus
          value={code}
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            const value = e.target.value
              .replace(/\D/g, "")
              .slice(0, CODE_LENGTH);
            setCode(value);
            setError(null);
            if (value.length === CODE_LENGTH) void verify(value);
          }}
          placeholder="000000"
          className="w-full rounded-lg border border-[#E2E8F0] bg-white px-4 py-3 text-center text-lg font-bold tracking-[0.5em] outline-none focus:ring-2 focus:ring-[#DBEAFE]/50"
        />
      </div>
      {error && (
        <p role="alert" className="text-xs text-[#EF4444]">
          {error}
        </p>
      )}
      <Button
        type="submit"
        disabled={busy}
        className="min-h-11 w-full lg:min-h-0"
        size="lg"
      >
        {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
        {t("verify")}
      </Button>
      <div className="flex items-center justify-between gap-3 text-xs">
        <button
          type="button"
          onClick={changeNumber}
          disabled={busy}
          className="min-h-11 font-medium text-brand-accent hover:underline disabled:cursor-not-allowed disabled:text-[#94A3B8] lg:min-h-0"
        >
          {t("changeNumber")}
        </button>
        <button
          type="button"
          onClick={() => void resend()}
          disabled={busy || cooldown > 0}
          className="min-h-11 font-medium text-brand-accent hover:underline disabled:cursor-not-allowed disabled:text-[#94A3B8] disabled:no-underline lg:min-h-0"
        >
          {cooldown > 0 ? t("resendIn", { seconds: cooldown }) : t("resend")}
        </button>
      </div>
      {notice && (
        <p role="status" className="text-center text-xs text-green-700">
          {notice}
        </p>
      )}
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 w-full text-xs font-medium text-[#94A3B8] hover:underline lg:min-h-0"
        >
          {t("cancel")}
        </button>
      )}
    </form>
  );
}
