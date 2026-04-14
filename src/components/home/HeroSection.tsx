"use client";

import { useCallback } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { SearchBox, type SearchFilters } from "@/components/search/SearchBox";
import ScrollReveal from "@/components/shared/ScrollReveal";

export function HeroSection() {
  const router = useRouter();
  const t = useTranslations("HeroSection");

  const handleSearch = useCallback(
    (sf: SearchFilters) => {
      const params = new URLSearchParams();
      if (sf.location) params.set("location", sf.location);
      if (sf.checkIn) params.set("check_in", sf.checkIn);
      if (sf.checkOut) params.set("check_out", sf.checkOut);
      if (sf.guests) params.set("guests", String(sf.guests));
      if (sf.cadastralCode) params.set("cadastral", sf.cadastralCode);
      router.push(`/search?${params.toString()}`);
    },
    [router],
  );

  return (
    <section
      className="relative flex min-h-[470px] items-center justify-center px-4"
      style={{
        background:
          "linear-gradient(90deg, #101A33 -4.88%, #0E2150 51.09%, #1E419A 119.49%)",
      }}
    >
      <div className="mx-auto w-full max-w-[1160px] text-center">
        <ScrollReveal>
          <h1 className="text-3xl font-black leading-none tracking-[-1.25px] text-white sm:text-4xl md:text-[50px]">
            {t("title")}
          </h1>
          <p className="mt-4 text-lg text-white/80">{t("subtitle")}</p>
        </ScrollReveal>

        <div className="mt-8">
          <SearchBox onSearch={handleSearch} />
        </div>
      </div>
    </section>
  );
}
