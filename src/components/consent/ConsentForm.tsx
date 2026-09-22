"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * Copy is INJECTED rather than read from next-intl, because this form is
 * rendered from two places with different i18n availability:
 *   - ConsentGate, inside the [locale] tree, passes translated strings;
 *   - /consent-required, which lives OUTSIDE [locale] (same as /site-locked)
 *     and therefore has no NextIntlClientProvider, passes plain Georgian.
 * One implementation, two copy sources - no duplicated submit logic.
 */
export type ConsentLabels = {
  title: string;
  intro: string;
  terms: string;
  termsLink: string;
  privacy: string;
  privacyLink: string;
  marketing: string;
  marketingNote: string;
  submit: string;
  signOut: string;
  error: string;
};

type Props = {
  labels: ConsentLabels;
  source: "registration_gate" | "account_settings";
  /** Policy revision recorded alongside the acceptance, so a later policy
   *  update can re-prompt without a schema change. */
  version: string;
  onDone?: () => void;
};

export function ConsentForm({ labels, source, version, onDone }: Props) {
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  // Deliberately starts UNCHECKED: the Direct Marketing Policy requires prior,
  // specific and informed consent, so a pre-ticked box would not be consent.
  const [marketing, setMarketing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const ready = terms && privacy;

  async function submit() {
    if (!ready || saving) return;
    setSaving(true);
    setFailed(false);
    try {
      const response = await fetch("/api/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source,
          version,
          terms: true,
          privacy: true,
          marketing_sms: marketing,
        }),
      });
      if (!response.ok) throw new Error("consent_failed");
      if (onDone) onDone();
      else window.location.replace("/");
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    try {
      await createClient().auth.signOut();
    } finally {
      window.location.replace("/");
    }
  }

  return (
    <div>
      <h2 className="text-[20px] font-black leading-7 tracking-[-0.4px] text-slate-900 sm:text-[22px]">
        {labels.title}
      </h2>
      <p className="mt-3 text-[14px] leading-6 text-slate-600">{labels.intro}</p>

      <div className="mt-6 space-y-4">
        <label className="flex cursor-pointer items-start gap-3 text-[13px] font-medium leading-5 text-slate-700">
          <input
            type="checkbox"
            checked={terms}
            onChange={(event) => setTerms(event.target.checked)}
            className="mt-0.5 size-5 shrink-0 rounded-[6px] border-[#E2E8F0] accent-brand-accent"
          />
          <span>
            {labels.terms}{" "}
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-[#2563EB] underline"
            >
              {labels.termsLink}
            </a>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-3 text-[13px] font-medium leading-5 text-slate-700">
          <input
            type="checkbox"
            checked={privacy}
            onChange={(event) => setPrivacy(event.target.checked)}
            className="mt-0.5 size-5 shrink-0 rounded-[6px] border-[#E2E8F0] accent-brand-accent"
          />
          <span>
            {labels.privacy}{" "}
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-[#2563EB] underline"
            >
              {labels.privacyLink}
            </a>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4 text-[13px] font-medium leading-5 text-slate-700">
          <input
            type="checkbox"
            checked={marketing}
            onChange={(event) => setMarketing(event.target.checked)}
            className="mt-0.5 size-5 shrink-0 rounded-[6px] border-[#E2E8F0] accent-brand-accent"
          />
          <span>
            {labels.marketing}
            <span className="mt-1 block text-[12px] font-normal leading-[18px] text-[#64748B]">
              {labels.marketingNote}
            </span>
          </span>
        </label>
      </div>

      {failed ? (
        <p className="mt-4 text-[13px] font-semibold text-red-600">
          {labels.error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={submit}
        disabled={!ready || saving}
        className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] text-[14px] font-bold text-white shadow-[0px_8px_20px_rgba(37,99,235,0.25)] transition-colors hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? <Loader2 className="size-4 animate-spin" /> : null}
        {labels.submit}
      </button>

      {/* There is no dismiss path by design, so a user who will not accept
          needs an exit that is not a dead page. */}
      <button
        type="button"
        onClick={signOut}
        className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-lg text-[13px] font-semibold text-[#64748B] hover:text-slate-900"
      >
        {labels.signOut}
      </button>
    </div>
  );
}
