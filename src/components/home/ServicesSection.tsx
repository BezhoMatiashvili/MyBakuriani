"use client";

import { useTranslations } from "next-intl";
import ScrollReveal from "@/components/shared/ScrollReveal";

export function ServicesSection() {
  const t = useTranslations("ServicesSection");

  const services = [
    t("transport"),
    t("servicesAndHandymen"),
    t("entertainmentAndActivities"),
    t("foodAndRestaurants"),
    t("employmentInBakuriani"),
  ];

  return (
    <>
      {/* Hot offers placeholder */}
      <section className="mx-auto max-w-7xl px-4 py-16">
        <ScrollReveal>
          <h2 className="mb-8 text-2xl font-bold">{t("hotOffers")}</h2>
        </ScrollReveal>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-64 animate-pulse rounded-[var(--radius-card)] bg-brand-surface-muted"
            />
          ))}
        </div>
      </section>

      {/* Services overview */}
      <section className="bg-brand-surface-muted px-4 py-16">
        <div className="mx-auto max-w-7xl">
          <ScrollReveal>
            <h2 className="mb-8 text-2xl font-bold">{t("services")}</h2>
          </ScrollReveal>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {services.map((service) => (
              <div
                key={service}
                className="rounded-[var(--radius-card)] bg-white p-6 text-center shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-card-hover)]"
              >
                <p className="text-sm font-medium">{service}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
