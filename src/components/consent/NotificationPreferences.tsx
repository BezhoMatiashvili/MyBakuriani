"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Switch } from "@/components/ui/switch";
import { MARKETING_POLICY_VERSION } from "@/lib/consent/channels";
import { recordConsent } from "@/lib/self-service/client";

export type NotificationPreferenceValues = {
  marketing_sms_consent: boolean | null;
  marketing_email_consent: boolean | null;
  marketing_whatsapp_consent: boolean | null;
  push_consent: boolean | null;
};

/**
 * The account-settings half of the consent system. Writes through
 * /api/consent (source: "account_settings") rather than the profile RPC, so
 * every change also lands an append-only user_consents row - the Direct
 * Marketing Policy (v2) section 6.2 requires retaining status, channel, time and
 * source for each consent change, not just the latest value.
 *
 * DELIVERY HONESTY: the SMS and email rows genuinely gate sending today (email:
 * Resend Broadcast contacts, C33). WhatsApp and push have no sender anywhere in
 * this project; their rows persist the preference
 * and are gated by marketingChannelAllowed(), and are labelled as not yet
 * active so the control does not pretend to do something it cannot.
 */
export function NotificationPreferences({
  initial,
}: {
  initial: NotificationPreferenceValues;
}) {
  const t = useTranslations("NotificationSettings");
  const [sms, setSms] = useState(initial.marketing_sms_consent === true);
  const [email, setEmail] = useState(initial.marketing_email_consent === true);
  const [whatsapp, setWhatsapp] = useState(
    initial.marketing_whatsapp_consent === true,
  );
  const [push, setPush] = useState(initial.push_consent === true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "failed">("idle");

  async function save() {
    if (saving) return;
    setSaving(true);
    setStatus("idle");
    try {
      await recordConsent({
        source: "account_settings",
        version: MARKETING_POLICY_VERSION,
        marketing_sms: sms,
        marketing_email: email,
        marketing_whatsapp: whatsapp,
        push,
      });
      setStatus("saved");
    } catch {
      setStatus("failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[#E2E8F0] bg-white p-4 sm:p-6">
      <h2 className="text-[16px] font-black tracking-[-0.3px] text-[#0F172A]">
        {t("title")}
      </h2>
      <p className="mt-1 text-[12px] leading-[18px] text-[#64748B]">
        {t("subtitle")}
      </p>

      <div className="mt-5 space-y-3">
        <Row
          label={t("serviceSms")}
          help={t("serviceSmsHelp")}
          checked
          disabled
          onChange={() => {}}
        />
        <Row
          label={t("marketingSms")}
          help={t("marketingSmsHelp")}
          checked={sms}
          onChange={setSms}
        />
        <Row
          label={t("marketingEmail")}
          help={t("marketingEmailHelp")}
          checked={email}
          onChange={setEmail}
        />
        <Row
          label={t("marketingWhatsapp")}
          help={t("marketingWhatsappHelp")}
          badge={t("notActiveYet")}
          checked={whatsapp}
          onChange={setWhatsapp}
        />
        <Row
          label={t("push")}
          help={t("pushHelp")}
          badge={t("notActiveYet")}
          checked={push}
          onChange={setPush}
        />
      </div>

      {/* Phones: full-width save with the status line under it, matching the
          other settings forms' mobile buttons. */}
      <div className="mt-5 flex flex-col-reverse items-stretch gap-2 text-center sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:text-left">
        {status === "saved" ? (
          <span className="text-[12px] font-semibold text-emerald-600">
            {t("saved")}
          </span>
        ) : null}
        {status === "failed" ? (
          <span className="text-[12px] font-semibold text-red-600">
            {t("failed")}
          </span>
        ) : null}
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-5 text-[13px] font-bold text-white transition-colors hover:bg-[#1D4ED8] disabled:opacity-60 sm:w-auto sm:min-w-[140px]"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : null}
          {t("save")}
        </button>
      </div>
    </section>
  );
}

function Row({
  label,
  help,
  badge,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  help: string;
  badge?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  // Phones: label + switch share the first line and the help text spans the
  // full row below them, instead of being squeezed into the column beside the
  // switch (this card is nested inside other cards on the profile pages).
  // From sm up the switch spans both lines, i.e. the original desktop layout.
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-3.5 sm:gap-x-4 sm:p-4">
      <p className="flex flex-wrap items-center gap-2 text-[13px] font-bold text-[#0F172A]">
        {label}
        {badge ? (
          <span className="rounded-full bg-[#E2E8F0] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-[#64748B]">
            {badge}
          </span>
        ) : null}
      </p>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-label={label}
        className="sm:row-span-2"
      />
      <p className="col-span-2 text-[12px] leading-[18px] text-[#64748B] sm:col-span-1">
        {help}
      </p>
    </div>
  );
}
