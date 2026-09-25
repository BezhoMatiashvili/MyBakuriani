import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { createPublicClient } from "@/lib/supabase/server";
import { formatGelAmount } from "@/lib/utils/pricing";
import {
  MEMBERSHIP_PRICE_TIERS,
  MEMBERSHIP_SEASONS,
} from "@/lib/membership/plans";

// Prices are read live from pricing_packages (admin-managed), so the page is
// ISR, not static. Cookie-free: createPublicClient never reads the session.
export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    title: t("pricing"),
    description: t("pricingDesc"),
  };
}

type PackageRow = {
  code: string;
  category: string;
  name: string;
  amount_gel: number;
  sort_order: number;
  meta: Record<string, unknown> | null;
};

const VIP_TIERS = ["standard", "discount", "super"] as const;
type VipTier = (typeof VIP_TIERS)[number];

// 2026 price list §3 comparison matrix: 2 = the strongest level ("✓✓").
const COMPARISON: { key: string; levels: Record<VipTier, 0 | 1 | 2> }[] = [
  { key: "badge", levels: { standard: 1, discount: 1, super: 1 } },
  { key: "discountMark", levels: { standard: 0, discount: 1, super: 0 } },
  { key: "offers", levels: { standard: 0, discount: 1, super: 0 } },
  { key: "priority", levels: { standard: 1, discount: 0, super: 2 } },
  { key: "superSection", levels: { standard: 0, discount: 0, super: 1 } },
];

const FEATURE_KEYS = [
  "listings",
  "constructionStages",
  "constructionProgress",
  "statistics",
  "map",
  "buyerRequests",
] as const;

const metaOf = (pkg: PackageRow | undefined) => pkg?.meta ?? {};

export default async function PricingPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Pricing" });
  const tOrg = await getTranslations({ locale, namespace: "Organizations" });

  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("pricing_packages")
    .select("code, category, name, amount_gel, sort_order, meta")
    .eq("is_enabled", true)
    .in("category", ["vip", "sms", "subscription"])
    .order("sort_order", { ascending: true });
  if (error) throw error;
  const packages = (data ?? []) as PackageRow[];

  const price = (pkg: PackageRow | undefined) =>
    pkg ? formatGelAmount(Number(pkg.amount_gel)) : "—";

  const membership = (season: string, tier: string) =>
    packages.find(
      (pkg) =>
        pkg.category === "subscription" &&
        metaOf(pkg).subscription_scope === "renter" &&
        metaOf(pkg).season === season &&
        metaOf(pkg).price_tier === tier,
    );
  const vip = (tier: VipTier) =>
    packages.find((pkg) => pkg.category === "vip" && metaOf(pkg).tier === tier);
  const vipHours = (tier: VipTier) =>
    Number(metaOf(vip(tier)).duration_hours ?? 24);
  const smsPackages = packages.filter((pkg) => pkg.category === "sms");
  const developerPackages = packages.filter(
    (pkg) =>
      pkg.category === "subscription" &&
      metaOf(pkg).subscription_scope === "organization",
  );

  const levelMark = (level: 0 | 1 | 2) =>
    level === 2 ? (
      <span aria-label={t("compare.strong")}>✓✓</span>
    ) : level === 1 ? (
      <span aria-label={t("compare.yes")}>✓</span>
    ) : (
      <span aria-label={t("compare.no")} className="text-[#94A3B8]">
        —
      </span>
    );
  // One row model for the desktop table and the phone list.
  const compareRows: {
    key: string;
    price?: boolean;
    cell: (tier: VipTier) => ReactNode;
  }[] = [
    ...COMPARISON.map((row) => ({
      key: row.key,
      cell: (tier: VipTier) => levelMark(row.levels[tier]),
    })),
    {
      key: "validity",
      cell: (tier: VipTier) => t("hoursShort", { count: vipHours(tier) }),
    },
    { key: "price", price: true, cell: (tier: VipTier) => price(vip(tier)) },
  ];

  return (
    <div className="bg-[#F8FAFC]">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:py-14">
        <h1 className="text-[28px] font-black leading-[36px] text-[#0F172A] sm:text-[36px] sm:leading-[44px]">
          {t("title")}
        </h1>
        <p className="mt-2 text-[15px] font-medium leading-6 text-[#64748B]">
          {t("subtitle")}
        </p>

        <div className="mt-8 space-y-6">
          <Section id="membership" title={t("membership.title")}>
            <Paragraph>{t("membership.intro")}</Paragraph>
            <TableFrame wide>
              <thead>
                <tr>
                  <Th>{t("membership.colType")}</Th>
                  <Th>{t("membership.colPeriod")}</Th>
                  {MEMBERSHIP_PRICE_TIERS.map((tier) => (
                    <Th key={tier}>{t(`membership.tiers.${tier}`)}</Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MEMBERSHIP_SEASONS.map((season) => (
                  <tr key={season}>
                    <Td strong>{t(`membership.seasons.${season}`)}</Td>
                    <Td>{t(`membership.periods.${season}`)}</Td>
                    {MEMBERSHIP_PRICE_TIERS.map((tier) => (
                      <Td key={tier} price>
                        {price(membership(season, tier))}
                      </Td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </TableFrame>
            <div className="mt-4 space-y-3 sm:hidden">
              {MEMBERSHIP_SEASONS.map((season) => (
                <div
                  key={season}
                  className="rounded-xl border border-[#E2E8F0] p-4"
                >
                  <p className="text-[15px] font-extrabold text-[#0F172A]">
                    {t(`membership.seasons.${season}`)}
                  </p>
                  <p className="text-[13px] text-[#64748B]">
                    {t(`membership.periods.${season}`)}
                  </p>
                  <dl className="mt-3 space-y-2">
                    {MEMBERSHIP_PRICE_TIERS.map((tier) => (
                      <div
                        key={tier}
                        className="flex items-baseline justify-between gap-3"
                      >
                        <dt className="text-[14px] leading-5 text-[#475569]">
                          {t(`membership.tiers.${tier}`)}
                        </dt>
                        <dd className="whitespace-nowrap text-[15px] font-extrabold text-[#2563EB]">
                          {price(membership(season, tier))}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[13px] leading-5 text-[#64748B]">
              {t("membership.fbNote")}
            </p>
            <p className="mt-5 text-[15px] font-bold text-[#0F172A]">
              {t("membership.processTitle")}
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-[15px] leading-6 text-[#475569]">
              {(["1", "2", "3", "4"] as const).map((step) => (
                <li key={step}>{t(`membership.steps.${step}`)}</li>
              ))}
            </ol>
          </Section>

          <Section id="vip" title={t("vip.title")}>
            <Paragraph>{t("vip.intro")}</Paragraph>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              {VIP_TIERS.map((tier) => (
                <div
                  key={tier}
                  className="rounded-xl border border-[#E2E8F0] p-4"
                >
                  <p className="text-[15px] font-extrabold text-[#0F172A]">
                    {t(`vip.tiers.${tier}.name`)}
                  </p>
                  <p className="mt-1 text-[20px] font-black text-[#2563EB]">
                    {price(vip(tier))}
                    <span className="text-[13px] font-semibold text-[#64748B]">
                      {" / "}
                      {t("hours", { count: vipHours(tier) })}
                    </span>
                  </p>
                  <p className="mt-2 text-[14px] leading-[22px] text-[#475569]">
                    {t(`vip.tiers.${tier}.description`)}
                  </p>
                </div>
              ))}
            </div>
          </Section>

          <Section id="compare" title={t("compare.title")}>
            <TableFrame wide>
              <thead>
                <tr>
                  <Th>{t("compare.colFeature")}</Th>
                  {VIP_TIERS.map((tier) => (
                    <Th key={tier} center>
                      {t(`vip.tiers.${tier}.name`)}
                    </Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {compareRows.map((row) => (
                  <tr key={row.key}>
                    <Td>{t(`compare.rows.${row.key}`)}</Td>
                    {VIP_TIERS.map((tier) => (
                      <Td key={tier} center price={row.price}>
                        {row.cell(tier)}
                      </Td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </TableFrame>
            <ul className="mt-4 divide-y divide-[#E2E8F0] rounded-xl border border-[#E2E8F0] sm:hidden">
              {compareRows.map((row) => (
                <li key={row.key} className="p-3">
                  <p className="text-[14px] font-bold leading-5 text-[#0F172A]">
                    {t(`compare.rows.${row.key}`)}
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {VIP_TIERS.map((tier) => (
                      <div
                        key={tier}
                        className="rounded-lg bg-[#F8FAFC] px-2 py-1.5 text-center"
                      >
                        <p className="text-[11px] font-semibold leading-4 text-[#64748B]">
                          {t(`vip.tiers.${tier}.name`)}
                        </p>
                        <p
                          className={`mt-0.5 text-[14px] font-bold ${row.price ? "text-[#2563EB]" : "text-[#0F172A]"}`}
                        >
                          {row.cell(tier)}
                        </p>
                      </div>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </Section>

          <Section id="sms" title={t("sms.title")}>
            <Paragraph>{t("sms.intro")}</Paragraph>
            <TableFrame>
              <thead>
                <tr>
                  <Th>{t("sms.colPackage")}</Th>
                  <Th>{t("sms.colCount")}</Th>
                  <Th>{t("sms.colPrice")}</Th>
                </tr>
              </thead>
              <tbody>
                {smsPackages.map((pkg) => (
                  <tr key={pkg.code}>
                    <Td strong>{pkg.name}</Td>
                    <Td>
                      {t("sms.count", {
                        count: Number(metaOf(pkg).sms_count ?? 0),
                      })}
                    </Td>
                    <Td price>{price(pkg)}</Td>
                  </tr>
                ))}
              </tbody>
            </TableFrame>
            <p className="mt-3 text-[13px] leading-5 text-[#64748B]">
              {t("sms.consent")}
            </p>
          </Section>

          <Section id="developer" title={t("developer.title")}>
            <TableFrame>
              <thead>
                <tr>
                  <Th>{t("developer.colPackage")}</Th>
                  <Th>{t("developer.colPrice")}</Th>
                  <Th>{t("developer.colListings")}</Th>
                </tr>
              </thead>
              <tbody>
                {developerPackages.map((pkg) => {
                  const limit = metaOf(pkg).listing_limit;
                  return (
                    <tr key={pkg.code}>
                      <Td strong>{pkg.name}</Td>
                      <Td price>{price(pkg)}</Td>
                      <Td>
                        {typeof limit === "number"
                          ? t("developer.upTo", { count: limit })
                          : t("developer.unlimited")}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableFrame>
            <p className="mt-5 text-[15px] font-bold text-[#0F172A]">
              {tOrg("tierFeaturesTitle")}
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px] leading-6 text-[#475569]">
              {FEATURE_KEYS.map((key) => (
                <li key={key}>{tOrg(`tierFeatures.${key}`)}</li>
              ))}
            </ul>
            <p className="mt-3 text-[13px] leading-5 text-[#64748B]">
              {tOrg("tierFeaturesNote")}
            </p>
          </Section>

          <Section id="rules" title={t("rules.title")}>
            <ul className="list-disc space-y-1.5 pl-5 text-[15px] leading-6 text-[#475569]">
              {(["1", "2", "3", "4", "5", "6", "7"] as const).map((item) => (
                <li key={item}>{t(`rules.items.${item}`)}</li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-2xl border border-[#E2E8F0] bg-white p-4 sm:p-7"
    >
      <h2 className="text-[20px] font-black leading-7 text-[#0F172A]">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Paragraph({ children }: { children: ReactNode }) {
  return <p className="text-[15px] leading-6 text-[#475569]">{children}</p>;
}

// `wide` tables (4 columns) are replaced by a stacked layout below `sm`, where
// they would hide their price columns behind a horizontal scroll.
function TableFrame({
  wide = false,
  children,
}: {
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`mt-4 overflow-x-auto rounded-xl border border-[#E2E8F0] ${wide ? "hidden sm:block" : ""}`}
    >
      <table
        className={`w-full text-left text-[14px] ${wide ? "min-w-[520px]" : ""}`}
      >
        {children}
      </table>
    </div>
  );
}

function Th({
  center = false,
  children,
}: {
  center?: boolean;
  children: ReactNode;
}) {
  return (
    <th
      scope="col"
      className={`bg-[#F8FAFC] px-3 py-3 text-[13px] font-bold leading-5 text-[#475569] sm:px-4 ${center ? "text-center" : ""}`}
    >
      {children}
    </th>
  );
}

function Td({
  strong = false,
  price = false,
  center = false,
  children,
}: {
  strong?: boolean;
  price?: boolean;
  center?: boolean;
  children: ReactNode;
}) {
  return (
    <td
      className={`border-t border-[#E2E8F0] px-3 py-3 leading-5 sm:px-4 ${price ? "whitespace-nowrap font-extrabold text-[#2563EB]" : strong ? "font-bold text-[#0F172A]" : "text-[#475569]"} ${center ? "text-center" : ""}`}
    >
      {children}
    </td>
  );
}
