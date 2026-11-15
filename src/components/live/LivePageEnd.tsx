import { getTranslations } from "next-intl/server";
import { LANDING_RENTAL_COLUMNS } from "@/app/[locale]/_landing/columns";
import PropertyCard from "@/components/cards/PropertyCard";
import { toCardProps } from "@/components/guide/ZoneListings";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { isSeedListingId } from "@/lib/seo/sitemap";
import {
  LIVE_PAGE_PATHS,
  type LivePageKey,
} from "@/lib/status-cards/live-page";
import { createPublicClient } from "@/lib/supabase/server";
import { firstPhotoOnly } from "@/lib/utils/photos";

const SHOWN = 6;

// The closing blocks of a live page (C40): daily-rent listings as real cards,
// the link to all of them, and links to the other two live pages. The same
// public, cookie-free read as ZoneListings without the zone filter, so the page
// stays ISR (C28); a read error is logged and only the cards are left out.
export default async function LivePageEnd({
  locale,
  page,
}: {
  locale: AppLocale;
  page: LivePageKey;
}) {
  const [t, tFooter] = await Promise.all([
    getTranslations({ locale, namespace: "LivePages" }),
    getTranslations({ locale, namespace: "Footer" }),
  ]);

  const { data, error } = await createPublicClient()
    .from("public_properties")
    .select(LANDING_RENTAL_COLUMNS)
    .eq("is_for_sale", false)
    .neq("type", "hotel")
    .order("is_super_vip", { ascending: false })
    .order("is_vip", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(SHOWN * 2);
  if (error) console.error("[live:listings]", error.message);

  const rows = (error ? [] : (data ?? []))
    .filter((row) => !isSeedListingId(row.id))
    .slice(0, SHOWN);
  const others = (Object.keys(LIVE_PAGE_PATHS) as LivePageKey[]).filter(
    (key) => key !== page,
  );

  return (
    <>
      <section
        aria-labelledby="live-listings"
        className="mx-auto mt-10 w-full max-w-[1160px] px-4 sm:mt-12"
      >
        <h2
          id="live-listings"
          className="text-[22px] font-black leading-[28px] text-[#1E293B] lg:text-[26px] lg:leading-[32px]"
        >
          {t("listingsTitle")}
        </h2>
        {rows.length > 0 && (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
            {rows.map((row) => (
              <PropertyCard
                key={row.id}
                {...toCardProps(firstPhotoOnly(row))}
              />
            ))}
          </div>
        )}
        <p className="mt-6">
          <Link
            href="/apartments"
            className="inline-flex min-h-11 items-center font-semibold text-[#2563EB] underline-offset-2 hover:underline"
          >
            {tFooter("allListings")}
          </Link>
        </p>
      </section>
      <ul className="mx-auto mt-6 w-full max-w-[1160px] px-4 pb-12 sm:pb-16">
        {others.map((key) => (
          <li key={key}>
            <Link
              href={LIVE_PAGE_PATHS[key]}
              className="inline-flex min-h-11 items-center font-semibold text-[#2563EB] underline-offset-2 hover:underline"
            >
              {t(`${key}.h1`)}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
