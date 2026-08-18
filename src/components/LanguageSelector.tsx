"use client";

import { useState } from "react";
import { Check, ChevronDown, Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function LanguageSelector({ className }: { className?: string }) {
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
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={t("ariaLabel")}
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
        <span>{t(locale)}</span>
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
        className="w-[140px] gap-1 p-1.5"
      >
        {routing.locales.map((loc) => {
          const isActive = locale === loc;
          return (
            <button
              key={loc}
              type="button"
              onClick={() => switchLocale(loc)}
              className={cn(
                "flex min-h-11 w-full items-center justify-between rounded-lg px-3 py-2 text-[13px] font-bold transition-colors lg:min-h-0",
                isActive
                  ? "bg-[#EFF6FF] text-[#2563EB]"
                  : "text-[#334155] hover:bg-[#F8FAFC]",
              )}
            >
              <span>{t(loc)}</span>
              {isActive ? (
                <Check className="h-4 w-4 shrink-0" aria-hidden />
              ) : null}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
