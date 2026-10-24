import type { ComponentProps } from "react";
import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import EmploymentCard, {
  type EmploymentCardProps,
} from "@/components/cards/EmploymentCard";
import PropertyCard from "@/components/cards/PropertyCard";
import ServiceCard from "@/components/cards/ServiceCard";
import { areaNamer } from "@/components/seo/areaName";
import { DETAIL_WIDTH, type ListingKind } from "@/components/seo/listing-kind";
import { MobileRail } from "@/components/shared/MobileRail";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { optionKeyFor } from "@/lib/constants/listing-options";
import { readPaymentOptions } from "@/lib/constants/sale-listing";
import { describeSalary } from "@/lib/employment/salary";
import { isSeedListingId } from "@/lib/seo/sitemap";
import { createPublicClient } from "@/lib/supabase/server";
import { firstPhotoOnly } from "@/lib/utils/photos";

const SHOWN = 3;
// Extra rows so dropping QA seed listings cannot leave the block short.
const FETCH = 12;

// Only the columns the cards read. Plain literals so supabase-js types the rows.
const PROPERTY_COLUMNS =
  "id, title, location, photos, price_per_night, sale_price, is_for_sale, capacity, rooms, is_vip, is_super_vip, discount_percent, discount_expires_at, created_at, distance_to_slope_m, construction_status, construction_progress_percent, house_rules, hotel_stars, is_b2b_partner, room_type, ownership_verified";
const SERVICE_COLUMNS =
  "id, title, category, position, location, photos, price, price_unit, discount_percent, discount_expires_at, best_active_menu_item_discount_percent, created_at, is_vip, is_super_vip, schedule, operating_hours, has_whatsapp, vehicle_capacity, transport_type, vehicle_make, route, routes, salary_type, salary_min, salary_max, salary_daily, salary_range, work_schedule, employment_schedule, ownership_verified";

// The categories /services lists; every other category has its own route.
const SERVICES_CATEGORIES = ["handyman", "cleaning"] as const;

type PropertyKind = "apartments" | "hotels" | "sales";
type ServiceKind = Exclude<ListingKind, PropertyKind>;
type AreaOf = Awaited<ReturnType<typeof areaNamer>>;

function isPropertyKind(kind: ListingKind): kind is PropertyKind {
  return kind === "apartments" || kind === "hotels" || kind === "sales";
}

// Each query keeps the scope and order of the kind's own category page
// (`[kind]/page.tsx`), so the block shows that page's top listings.
async function loadProperties(kind: PropertyKind, excludeId: string) {
  const query = createPublicClient()
    .from("public_properties")
    .select(PROPERTY_COLUMNS)
    .neq("id", excludeId);
  const scoped =
    kind === "sales"
      ? query.eq("is_for_sale", true)
      : kind === "hotels"
        ? query.eq("is_for_sale", false).eq("type", "hotel")
        : query.eq("is_for_sale", false).neq("type", "hotel");
  const { data, error } = await scoped
    .order("is_super_vip", { ascending: false })
    .order("is_vip", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(FETCH);
  if (error) throw error;
  return data ?? [];
}

async function loadServices(kind: ServiceKind, excludeId: string) {
  const query = createPublicClient()
    .from("public_services")
    .select(SERVICE_COLUMNS)
    .neq("id", excludeId);
  const scoped =
    kind === "services"
      ? query.in("category", SERVICES_CATEGORIES)
      : query.eq("category", kind);
  let ordered = scoped
    .order("is_super_vip", { ascending: false })
    .order("is_vip", { ascending: false });
  if (kind === "food") {
    ordered = ordered.order("has_active_discount", { ascending: false });
  }
  const { data, error } = await ordered
    .order("created_at", { ascending: false })
    .limit(FETCH);
  if (error) throw error;
  return data ?? [];
}

type PropertyRow = Awaited<ReturnType<typeof loadProperties>>[number];
type ServiceRow = Awaited<ReturnType<typeof loadServices>>[number];

function topListings<T extends { id: string }>(rows: T[]): T[] {
  return rows.filter((row) => !isSeedListingId(row.id)).slice(0, SHOWN);
}

// The props the category pages give their cards (/sales/all for sales).
function toPropertyCard(
  row: PropertyRow,
  kind: PropertyKind,
  areaOf: AreaOf,
): ComponentProps<typeof PropertyCard> {
  const p = firstPhotoOnly(row);
  return {
    id: p.id,
    title: p.title,
    location: areaOf(p.location) ?? "",
    photos: p.photos ?? [],
    pricePerNight: p.price_per_night ? Number(p.price_per_night) : null,
    salePrice: p.sale_price ? Number(p.sale_price) : null,
    capacity: p.capacity,
    rooms: p.rooms,
    isVip: p.is_vip ?? false,
    isSuperVip: p.is_super_vip ?? false,
    discountPercent: p.discount_percent ?? 0,
    discountExpiresAt: p.discount_expires_at ?? null,
    createdAt: p.created_at,
    isForSale: p.is_for_sale ?? false,
    distanceToSlopeM: p.distance_to_slope_m,
    isOwnershipVerified: p.ownership_verified ?? false,
    ...(kind === "hotels"
      ? {
          isHotel: true,
          hotelStars: p.hotel_stars ?? undefined,
          isB2BPartner: p.is_b2b_partner ?? false,
          roomType: p.room_type ?? undefined,
        }
      : {}),
    ...(kind === "sales"
      ? {
          constructionStatus: p.construction_status ?? null,
          constructionProgressPercent: p.construction_progress_percent ?? null,
          paymentOptions: readPaymentOptions(p.house_rules),
        }
      : {}),
  };
}

function toServiceCard(
  row: ServiceRow,
  kind: ServiceKind,
  areaOf: AreaOf,
): ComponentProps<typeof ServiceCard> {
  const s = firstPhotoOnly(row);
  // Food cards show the best dish discount, as /food does (C21).
  const isFood = kind === "food";
  return {
    id: s.id,
    title: s.title,
    category: s.category,
    location: areaOf(s.location),
    photos: s.photos ?? [],
    price: s.price ? Number(s.price) : null,
    priceUnit: s.price_unit,
    discountPercent: isFood
      ? (s.best_active_menu_item_discount_percent ?? 0)
      : (s.discount_percent ?? 0),
    discountExpiresAt: isFood ? null : (s.discount_expires_at ?? null),
    createdAt: s.created_at,
    isVip: s.is_vip ?? false,
    isSuperVip: s.is_super_vip ?? false,
    isOwnershipVerified: s.ownership_verified ?? false,
    variant: kind === "services" ? "avatar" : "photo",
    schedule: s.schedule,
    operatingHours: s.operating_hours,
    phone: null,
    hasWhatsapp: s.has_whatsapp ?? false,
    providerName: kind === "services" ? s.position : null,
    ...(kind === "transport"
      ? {
          vehicleCapacity: s.vehicle_capacity,
          transportType: s.transport_type,
          vehicleMake: s.vehicle_make,
          route: s.route,
          routes: s.routes,
        }
      : {}),
  };
}

// As /employment builds its vacancy cards.
function toEmploymentCard(
  row: ServiceRow,
  scheduleLabel: string | null,
  areaOf: AreaOf,
): EmploymentCardProps {
  const vip = Boolean(row.is_super_vip || row.is_vip);
  return {
    id: row.id,
    title: row.position ?? row.title,
    employer: row.title,
    location: areaOf(row.location),
    salary: describeSalary(row),
    scheduleLabel,
    badge: vip
      ? "vip"
      : row.discount_percent && row.discount_percent > 0
        ? "urgent"
        : null,
    highlighted: vip,
    createdAt: row.created_at,
    isOwnershipVerified: row.ownership_verified ?? false,
  };
}

// The category page's top 3 other listings (SUPER VIP, then VIP, then
// newest), as the same cards the home page and category pages show (C40).
// Public, cookie-free reads only, so the route stays ISR (C28). Optional: a
// read error is logged and the block left out, never a failed page.
export default async function RelatedListings({
  locale,
  kind,
  excludeId,
}: {
  locale: AppLocale;
  kind: ListingKind;
  excludeId: string;
}) {
  let properties: PropertyRow[] = [];
  let services: ServiceRow[] = [];
  try {
    if (isPropertyKind(kind)) {
      properties = topListings(await loadProperties(kind, excludeId));
    } else {
      services = topListings(await loadServices(kind, excludeId));
    }
  } catch (error) {
    console.error(
      "[related-listings]",
      kind,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
  if (properties.length === 0 && services.length === 0) return null;

  const t = await getTranslations({ locale, namespace: "RelatedListings" });
  const tLanding = await getTranslations({ locale, namespace: "Landing" });
  const tOpts = await getTranslations({ locale, namespace: "ListingOptions" });
  const areaOf = await areaNamer(locale);

  // Rows store Georgian schedule labels; unknown free text passes through.
  const scheduleLabel = (row: ServiceRow): string | null => {
    const raw = row.work_schedule ?? row.employment_schedule;
    if (!raw) return null;
    const key = optionKeyFor("employmentTypes", raw);
    return key ? tOpts(`employmentTypes.${key}`) : raw;
  };

  const cards = isPropertyKind(kind)
    ? properties.map((row) => (
        <PropertyCard key={row.id} {...toPropertyCard(row, kind, areaOf)} />
      ))
    : services.map((row) =>
        kind === "employment" ? (
          <EmploymentCard
            key={row.id}
            {...toEmploymentCard(row, scheduleLabel(row), areaOf)}
          />
        ) : (
          <ServiceCard key={row.id} {...toServiceCard(row, kind, areaOf)} />
        ),
      );

  return (
    <section
      aria-labelledby="related-listings"
      className={`mx-auto w-full ${DETAIL_WIDTH[kind]} px-4 pb-12 pt-4 sm:pb-16`}
    >
      <div className="mb-6 flex items-center justify-between gap-3">
        <h2
          id="related-listings"
          className="min-w-0 text-[17px] font-black leading-[22px] text-[#1E293B] lg:text-[26px] lg:leading-[32px]"
        >
          {t(`title.${kind}`)}
        </h2>
        <Link
          href={`/${kind}`}
          className="flex min-h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-[#E2E8F0] bg-white px-3.5 text-[12px] font-bold text-[#0F172A] hover:underline lg:min-h-11 lg:border-none lg:bg-transparent lg:px-0 lg:text-[13px]"
        >
          {tLanding("viewAll")} <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      {/* `relative` items: a card's sr-only text is absolutely positioned and
          would otherwise be placed against <body>, outside the rail's clip,
          widening the phone page (the home page's ScrollReveal transform
          contains it there). */}
      <MobileRail
        itemClassName="relative"
        desktopClassName="lg:mx-0 lg:grid lg:grid-cols-3 lg:items-stretch lg:gap-6 lg:overflow-visible lg:px-0 lg:pb-0 lg:snap-none"
        desktopItemClassName="lg:h-full lg:w-auto lg:snap-none"
      >
        {cards}
      </MobileRail>
    </section>
  );
}
