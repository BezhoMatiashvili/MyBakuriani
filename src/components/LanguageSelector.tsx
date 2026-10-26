"use client";

import { useId, useState } from "react";
import { Check, ChevronDown, Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  refreshRate,
  setDisplayCurrency,
  useDisplayCurrency,
  useUsdRate,
} from "@/lib/currency/client";
import {
  formatGelPerUsd,
  formatRateDay,
  isUsableRate,
  tbilisiDay,
  type CurrencyCode,
} from "@/lib/currency/money";
import { cn } from "@/lib/utils";

// The currency section (C55): null = every price in its own currency.
const CURRENCY_OPTIONS = [
  { value: null, labelKey: "currencyListing" },
  { value: "USD", labelKey: "currencyUsd" },
  { value: "GEL", labelKey: "currencyGel" },
] as const;
const CURRENCY_SYMBOL: Record<CurrencyCode, string> = { GEL: "₾", USD: "$" };

const HEADING_CLASS = "px-3 pt-1.5 pb-1 text-[11px] font-bold text-[#64748B]";

function rowClass(isActive: boolean) {
  return cn(
    "flex min-h-11 w-full items-center justify-between rounded-lg px-3 py-2 text-[13px] font-bold transition-colors lg:min-h-0",
    isActive
      ? "bg-[#EFF6FF] text-[#2563EB]"
      : "text-[#334155] hover:bg-[#F8FAFC]",
  );
}

function CurrencySuffix() {
  const currency = useDisplayCurrency();
  return currency ? <>, {CURRENCY_SYMBOL[currency]}</> : null;
}

function CurrencySection({ onPicked }: { onPicked: () => void }) {
  const t = useTranslations("LanguageSelector");
  const currency = useDisplayCurrency();
  const rate = useUsdRate();
  const headingId = useId();
  const usable = isUsableRate(rate, tbilisiDay(new Date()));
  return (
    <>
      <div role="separator" className="mx-1.5 my-1 h-px bg-[#E2E8F0]" />
      <p id={headingId} className={HEADING_CLASS}>
        {t("currencyHeading")}
      </p>
      <div
        role="group"
        aria-labelledby={headingId}
        className="flex flex-col gap-1"
      >
        {CURRENCY_OPTIONS.map(({ value, labelKey }) => {
          const isActive = currency === value;
          return (
            <button
              key={labelKey}
              type="button"
              aria-pressed={isActive}
              onClick={() => {
                setDisplayCurrency(value);
                onPicked();
              }}
              className={rowClass(isActive)}
            >
              <span>{t(labelKey)}</span>
              {isActive ? (
                <Check className="h-4 w-4 shrink-0" aria-hidden />
              ) : null}
            </button>
          );
        })}
      </div>
      {usable ? (
        <p className="px-3 pt-1.5 pb-1 text-[11px] leading-4 font-medium text-[#64748B]">
          {t("rateLine", {
            rate: formatGelPerUsd(rate.gelPerUsd),
            date: formatRateDay(rate.date),
          })}
        </p>
      ) : currency ? (
        // Picked, but no NBG rate yet or any more: prices stay as listed.
        <p className="px-3 pt-1.5 pb-1 text-[11px] leading-4 font-medium text-[#64748B]">
          {t("rateUnavailable")}
        </p>
      ) : null}
    </>
  );
}

/**
 * The header's language menu. `withCurrency` (public headers only) adds the
 * currency pick, myhome.ge style: prices then follow it at the NBG rate (C55).
 */
export function LanguageSelector({
  className,
  withCurrency = false,
}: {
  className?: string;
  withCurrency?: boolean;
}) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("LanguageSelector");
  const [open, setOpen] = useState(false);

  function switchLocale(newLocale: (typeof routing.locales)[number]) {
    if (newLocale === locale) {
      setOpen(false);
      return;
    }
    router.replace(pathname, { locale: newLocale });
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Shows the rate line even before a currency is picked.
        if (next && withCurrency) refreshRate();
      }}
    >
      <PopoverTrigger
        aria-label={t(withCurrency ? "ariaLabelWithCurrency" : "ariaLabel")}
        aria-expanded={open}
        className={cn(
          "inline-flex h-[44px] shrink-0 items-center gap-2 rounded-full bg-white px-3.5 text-[13px] font-bold text-[#0F172A] transition-colors hover:bg-[#F8FAFC] data-[popup-open]:bg-[#F8FAFC]",
          className,
        )}
      >
        <Globe
          className="h-[18px] w-[18px] text-[#2563EB]"
          strokeWidth={2}
          aria-hidden
        />
        <span>
          {t(locale)}
          {withCurrency ? <CurrencySuffix /> : null}
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-[#94A3B8] transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className={cn(
          "gap-1 p-1.5",
          withCurrency
            ? "max-h-[var(--available-height)] w-[220px] overflow-y-auto"
            : "w-[140px]",
        )}
      >
        {withCurrency ? (
          <p className={HEADING_CLASS}>{t("languageHeading")}</p>
        ) : null}
        {routing.locales.map((loc) => {
          const isActive = locale === loc;
          return (
            <button
              key={loc}
              type="button"
              onClick={() => switchLocale(loc)}
              className={rowClass(isActive)}
            >
              <span>{t(loc)}</span>
              {isActive ? (
                <Check className="h-4 w-4 shrink-0" aria-hidden />
              ) : null}
            </button>
          );
        })}
        {withCurrency ? (
          <CurrencySection onPicked={() => setOpen(false)} />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
