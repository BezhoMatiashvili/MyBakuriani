"use client";

import { SearchBox } from "@/components/search/SearchBox";
import ScrollReveal from "@/components/shared/ScrollReveal";

export function HeroSection() {
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
          <SearchBox onSearch={() => {}} />
        </div>
      </div>
    </section>
  );
}
