"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { SearchBox, type SearchFilters } from "@/components/search/SearchBox";
import ScrollReveal from "@/components/shared/ScrollReveal";

export function HeroSection() {
  const router = useRouter();

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
    <section className="relative flex min-h-[600px] items-center justify-center bg-brand-primary px-4">
      <div className="mx-auto max-w-4xl text-center">
        <ScrollReveal>
          <h1 className="text-3xl font-bold text-white sm:text-4xl md:text-5xl">
            ყველაზე სანდო გზამკვლევი ბაკურიანში
          </h1>
          <p className="mt-4 text-lg text-white/80">
            მხოლოდ ვერიფიცირებული და სანდო მესაკუთრეები
          </p>
        </ScrollReveal>

        <div className="mt-8">
          <SearchBox onSearch={handleSearch} />
        </div>
      </div>
    </section>
  );
}
