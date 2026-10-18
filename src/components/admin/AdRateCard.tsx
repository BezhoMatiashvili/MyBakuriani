"use client";

import { useTranslations } from "next-intl";
import { formatNumber } from "@/lib/utils/format";
import {
  RATE_CARD_DAYS,
  RATE_CARD_PACKAGES,
  RATE_CARD_SLOTS,
  RATE_CARD_VERSION,
} from "@/lib/ad-rate-card";

const RULES = [
  "hero",
  "catalog",
  "promo",
  "sidebar",
  "sponsored",
  "mobile",
] as const;

/**
 * The owner's advertising rate card (C47), admin-only: slots and prices (§2),
 * ready packages (§5), the rotation rules the site enforces (§4) and the
 * impressions example (§3). Collapsed by default above the ads list.
 */
export default function AdRateCard({
  placementLabel,
}: {
  placementLabel: (id: string) => string;
}) {
  const t = useTranslations("AdminModeration.rateCard");

  const price = (gel: number) => `${formatNumber(gel)} ₾`;

  return (
    <details className="group rounded-3xl border border-[#E2E8F0] bg-white">
      <summary className="flex min-h-[56px] cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-5 py-3 [&::-webkit-details-marker]:hidden">
        <span className="text-[15px] font-black text-[#1E293B]">
          {t("title", { version: RATE_CARD_VERSION })}
        </span>
        <span className="text-[12px] font-bold text-[#2563EB] group-open:hidden">
          {t("show")}
        </span>
        <span className="hidden text-[12px] font-bold text-[#2563EB] group-open:inline">
          {t("hide")}
        </span>
      </summary>

      <div className="space-y-6 border-t border-[#F1F5F9] px-5 pb-6 pt-4">
        <p className="max-w-[880px] text-[13px] font-medium leading-[20px] text-[#475569]">
          {t("principle")}
        </p>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-[13px]">
            <thead className="bg-[#12213A] text-[11px] font-bold uppercase tracking-[0.5px] text-white">
              <tr>
                <th className="px-4 py-3">{t("columns.slot")}</th>
                <th className="px-3 py-3">{t("columns.format")}</th>
                <th className="px-3 py-3">{t("columns.tier")}</th>
                <th className="px-3 py-3">{t("columns.sov")}</th>
                <th className="px-4 py-3 text-right">
                  {t("columns.price", { days: RATE_CARD_DAYS })}
                </th>
              </tr>
            </thead>
            <tbody>
              {RATE_CARD_SLOTS.map((slot) => (
                <tr
                  key={`${slot.placement}:${slot.tier}`}
                  className="border-t border-[#F1F5F9]"
                >
                  <td className="px-4 py-2.5 font-bold text-[#1E293B]">
                    {placementLabel(slot.placement)}
                  </td>
                  <td className="px-3 py-2.5 text-[#64748B]">{slot.format}</td>
                  <td className="px-3 py-2.5 text-[#1E293B]">
                    {t(`tiers.${slot.tier}`)}
                  </td>
                  <td className="px-3 py-2.5 text-[#1E293B]">
                    {slot.sov === null
                      ? t("rotation")
                      : t("sovValue", { percent: slot.sov })}
                  </td>
                  <td className="px-4 py-2.5 text-right font-black text-[#1E293B]">
                    {price(slot.priceGel)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <h3 className="text-[14px] font-black text-[#1E293B]">
            {t("packagesTitle")}
          </h3>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-[13px]">
              <thead className="bg-[#12213A] text-[11px] font-bold uppercase tracking-[0.5px] text-white">
                <tr>
                  <th className="px-4 py-3">{t("columns.package")}</th>
                  <th className="px-3 py-3">{t("columns.items")}</th>
                  <th className="px-4 py-3 text-right">
                    {t("columns.price", { days: RATE_CARD_DAYS })}
                  </th>
                </tr>
              </thead>
              <tbody>
                {RATE_CARD_PACKAGES.map((pkg) => (
                  <tr key={pkg.code} className="border-t border-[#F1F5F9]">
                    <td className="px-4 py-2.5 font-black text-[#1E293B]">
                      {pkg.name}
                    </td>
                    <td className="px-3 py-2.5 text-[#475569]">
                      {pkg.items
                        .map((item) =>
                          "native" in item
                            ? t("native")
                            : item.sov === null
                              ? placementLabel(item.placement)
                              : t("itemWithSov", {
                                  placement: placementLabel(item.placement),
                                  percent: item.sov,
                                }),
                        )
                        .join(" + ")}
                    </td>
                    <td className="px-4 py-2.5 text-right font-black text-[#1E293B]">
                      {price(pkg.priceGel)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="text-[14px] font-black text-[#1E293B]">
              {t("rulesTitle")}
            </h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] leading-[20px] text-[#475569]">
              {RULES.map((rule) => (
                <li key={rule}>{t(`rules.${rule}`)}</li>
              ))}
            </ul>
          </div>
          <div className="space-y-3 text-[13px] leading-[20px] text-[#475569]">
            <h3 className="text-[14px] font-black text-[#1E293B]">
              {t("exampleTitle")}
            </h3>
            <p>{t("example")}</p>
            <p>{t("reporting")}</p>
          </div>
        </div>
      </div>
    </details>
  );
}
