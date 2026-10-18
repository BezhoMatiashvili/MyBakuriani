import {
  LANDING_RENTAL_COLUMNS,
  type LandingProperty,
} from "@/app/[locale]/_landing/columns";
import PropertyCard from "@/components/cards/PropertyCard";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import type { GuideZoneSlug } from "@/lib/guide";
import { getGuideTranslator } from "@/lib/guide-content";
import { isSeedListingId } from "@/lib/seo/sitemap";
import { createPublicClient } from "@/lib/supabase/server";
import { firstPhotoOnly } from "@/lib/utils/photos";
import { getActiveZones } from "@/lib/zones/server";

const SHOWN = 6;

function toCardProps(p: LandingProperty) {
  return {
    id: p.id,
    title: p.title,
    location: p.location,
    photos: p.photos ?? [],
    pricePerNight: p.price_per_night ? Number(p.price_per_night) : null,
    salePrice: null,
    rating: null,
    capacity: p.capacity,
    rooms: p.rooms,
    isVip: p.is_vip ?? false,
    isSuperVip: p.is_super_vip ?? false,
    discountPercent: p.discount_percent ?? 0,
    discountExpiresAt: p.discount_expires_at ?? null,
    createdAt: p.created_at,
    isForSale: false,
    distanceToSlopeM: p.distance_to_slope_m,
    isOwnershipVerified: p.ownership_verified ?? false,
  };
}

// Daily-rent listings whose `location` is this zone's name, as real cards with
// links (C40). Public, cookie-free reads only, so the page stays ISR (C28). An
// optional block: a read error is logged and the block left out instead of
// failing the page or the build, and the next revalidation fills it in. QA seed
// ids never show, the same rule as the sitemap.
export default async function ZoneListings({
  locale,
  slug,
}: {
  locale: AppLocale;
  slug: GuideZoneSlug;
}) {
  const zone = (await getActiveZones()).find((z) => z.slug === slug);
  if (!zone) return null;

  const { data, error } = await createPublicClient()
    .from("public_properties")
    .select(LANDING_RENTAL_COLUMNS)
    .eq("location", zone.name_ka)
    .eq("is_for_sale", false)
    .neq("type", "hotel")
    .order("is_super_vip", { ascending: false })
    .order("is_vip", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(SHOWN * 2);
  if (error) {
    console.error("[guide:zone-listings]", slug, error.message);
    return null;
  }

  const rows = (data ?? [])
    .filter((row) => !isSeedListingId(row.id))
    .slice(0, SHOWN);
  if (rows.length === 0) return null;

  const t = await getGuideTranslator(locale);

  return (
    <section
      aria-labelledby="zone-listings"
      className="mx-auto mt-10 w-full max-w-[1160px] px-4 sm:mt-12"
    >
      <h2
        id="zone-listings"
        className="text-[22px] font-black leading-[28px] text-[#1E293B] lg:text-[26px] lg:leading-[32px]"
      >
        {t(`zone.${slug}.listingsTitle`)}
      </h2>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
        {rows.map((row) => (
          <PropertyCard key={row.id} {...toCardProps(firstPhotoOnly(row))} />
        ))}
      </div>
      <p className="mt-6">
        <Link
          href="/apartments"
          className="inline-flex min-h-11 items-center font-semibold text-[#2563EB] underline-offset-2 hover:underline"
        >
          {t("listingsMore")}
        </Link>
      </p>
    </section>
  );
}
