"use client";

import {
  CONSENT_POLICY_VERSION,
  MARKETING_POLICY_VERSION,
} from "@/lib/consent/channels";
import { recordConsent } from "@/lib/self-service/client";

/**
 * The consent checkboxes shared by every place a user first answers:
 * the registration wizard, the ConsentGate overlay and /consent-required.
 * Copy is injected (see ConsentForm) because /consent-required has no
 * next-intl provider.
 *
 * Direct Marketing Policy v2: consent is per channel (3.4), never pre-selected
 * (3.3), and one channel's answer is independent of the others (13.3) - so
 * every channel box starts unchecked and is recorded on its own.
 */
export type MarketingChoices = {
  sms: boolean;
  email: boolean;
  whatsapp: boolean;
  push: boolean;
};

export const NO_MARKETING: MarketingChoices = {
  sms: false,
  email: false,
  whatsapp: false,
  push: false,
};

export type ConsentChoiceLabels = {
  terms: string;
  termsLink: string;
  privacy: string;
  privacyLink: string;
  marketingTitle: string;
  marketingPolicyLink: string;
  channelSms: string;
  channelEmail: string;
  channelWhatsapp: string;
  channelPush: string;
  marketingNote: string;
};

type Props = {
  labels: ConsentChoiceLabels;
  terms: boolean;
  privacy: boolean;
  marketing: MarketingChoices;
  onTermsChange: (value: boolean) => void;
  onPrivacyChange: (value: boolean) => void;
  onMarketingChange: (value: MarketingChoices) => void;
};

const CHANNELS: {
  key: keyof MarketingChoices;
  label: keyof ConsentChoiceLabels;
}[] = [
  { key: "sms", label: "channelSms" },
  { key: "email", label: "channelEmail" },
  { key: "whatsapp", label: "channelWhatsapp" },
  { key: "push", label: "channelPush" },
];

const BOX =
  "mt-0.5 size-5 shrink-0 rounded-[6px] border-[#E2E8F0] accent-brand-accent";

export function ConsentChoices({
  labels,
  terms,
  privacy,
  marketing,
  onTermsChange,
  onPrivacyChange,
  onMarketingChange,
}: Props) {
  return (
    <div className="space-y-4 text-left">
      <label className="flex cursor-pointer items-start gap-3 text-[13px] font-medium leading-5 text-slate-700">
        <input
          type="checkbox"
          checked={terms}
          onChange={(event) => onTermsChange(event.target.checked)}
          className={BOX}
        />
        <span>
          {labels.terms}{" "}
          <PolicyLink href="/terms">{labels.termsLink}</PolicyLink>
        </span>
      </label>

      <label className="flex cursor-pointer items-start gap-3 text-[13px] font-medium leading-5 text-slate-700">
        <input
          type="checkbox"
          checked={privacy}
          onChange={(event) => onPrivacyChange(event.target.checked)}
          className={BOX}
        />
        <span>
          {labels.privacy}{" "}
          <PolicyLink href="/privacy">{labels.privacyLink}</PolicyLink>
        </span>
      </label>

      <fieldset className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
        <legend className="sr-only">{labels.marketingTitle}</legend>
        <p className="text-[13px] font-medium leading-5 text-slate-700">
          {labels.marketingTitle}{" "}
          <PolicyLink href="/marketing-policy">
            {labels.marketingPolicyLink}
          </PolicyLink>
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {CHANNELS.map(({ key, label }) => (
            <label
              key={key}
              className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-[#E2E8F0] bg-white px-3 text-[13px] font-semibold text-slate-700"
            >
              <input
                type="checkbox"
                checked={marketing[key]}
                onChange={(event) =>
                  onMarketingChange({
                    ...marketing,
                    [key]: event.target.checked,
                  })
                }
                className="size-5 shrink-0 rounded-[6px] border-[#E2E8F0] accent-brand-accent"
              />
              {labels[label]}
            </label>
          ))}
        </div>
        <p className="mt-3 text-[12px] leading-[18px] text-[#64748B]">
          {labels.marketingNote}
        </p>
      </fieldset>
    </div>
  );
}

function PolicyLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-bold text-[#2563EB] underline"
    >
      {children}
    </a>
  );
}

/**
 * Records the answers in two calls, each stamped with the version of the
 * document it refers to: the marketing channels against
 * MARKETING_POLICY_VERSION (policy v2 section 6.2 wants the consent text
 * version recorded), terms/privacy against CONSENT_POLICY_VERSION. Every
 * channel is sent explicitly, so an unchecked box is recorded as "declined"
 * rather than left unanswered.
 *
 * ORDER IS LOAD-BEARING: marketing first, acceptance last. If either call
 * fails, terms_accepted_at stays NULL and ConsentGate re-asks everything; the
 * reverse order would let a failed marketing call silently drop the user's
 * channel choices behind an already-satisfied gate. Safe to retry: acceptance
 * timestamps are coalesced server-side.
 */
export async function submitConsentChoices(
  source: "registration_gate" | "account_settings",
  marketing: MarketingChoices,
) {
  await recordConsent({
    source,
    version: MARKETING_POLICY_VERSION,
    marketing_sms: marketing.sms,
    marketing_email: marketing.email,
    marketing_whatsapp: marketing.whatsapp,
    push: marketing.push,
  });
  await recordConsent({
    source,
    version: CONSENT_POLICY_VERSION,
    terms: true,
    privacy: true,
  });
}
