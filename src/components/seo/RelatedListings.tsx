import { getTranslations } from "next-intl/server";
import { DETAIL_WIDTH, type ListingKind } from "@/components/seo/listing-kind";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { isSeedListingId } from "@/lib/seo/sitemap";
import { createPublicClient } from "@/lib/supabase/server";
import { propertyViewUrl, serviceViewUrl } from "@/lib/utils/listingUrls";

const SHOWN = 6;

interface Related {
  id: string;
  title: string;
  location: string | null;
  href: string;
}

// Services whose category has its own route; every other category is /services.
const OWN_ROUTE_CATEGORIES = [
  "food",
  "entertainment",
  "transport",
  "employment",
] as const;

async function loadProperties(
  kind: "apartments" | "hotels" | "sales",
  excludeId: string,
  location: string | null,
): Promise<Related[]> {
  const db = createPublicClient();
  const base = () => {
    const query = db
      .from("public_properties")
      .select("id, title, location, type, is_for_sale")
      .neq("id", excludeId);
    const scoped =
      kind === "sales"
        ? query.eq("is_for_sale", true)
        : kind === "hotels"
          ? query.eq("is_for_sale", false).eq("type", "hotel")
          : query.eq("is_for_sale", false).neq("type", "hotel");
    return scoped
      .order("is_super_vip", { ascending: false })
      .order("is_vip", { ascending: false })
      .order("created_at", { ascending: false });
  };
  const [near, any] = await Promise.all([
    location
      ? base()
          .eq("location", location)
          .limit(SHOWN * 2)
      : null,
    base().limit(SHOWN * 2),
  ]);
  if (near?.error) throw near.error;
  if (any.error) throw any.error;
  return [...(near?.data ?? []), ...(any.data ?? [])].map((row) => ({
    id: row.id,
    title: row.title,
    location: row.location,
    href: propertyViewUrl(row),
  }));
}

async function loadServices(
  kind: Exclude<ListingKind, "apartments" | "hotels" | "sales">,
  excludeId: string,
  location: string | null,
): Promise<Related[]> {
  const db = createPublicClient();
  const base = () => {
    const query = db
      .from("public_services")
      .select("id, title, location, category")
      .neq("id", excludeId);
    const scoped =
      kind === "services"
        ? query.not("category", "in", `(${OWN_ROUTE_CATEGORIES.join(",")})`)
        : query.eq("category", kind);
    return scoped
      .order("is_super_vip", { ascending: false })
      .order("is_vip", { ascending: false })
      .order("created_at", { ascending: false });
  };
  const [near, any] = await Promise.all([
    location
      ? base()
          .eq("location", location)
          .limit(SHOWN * 2)
      : null,
    base().limit(SHOWN * 2),
  ]);
  if (near?.error) throw near.error;
  if (any.error) throw any.error;
  return [...(near?.data ?? []), ...(any.data ?? [])].map((row) => ({
    id: row.id,
    title: row.title,
    location: row.location,
    href: serviceViewUrl(row),
  }));
}

// Links from a detail page to similar listings: same kind, the listing's own
// area first (C40). The page it sits on gets crawlable paths to its neighbours
// and a reader gets a next step; the anchors are the listings' own titles.
// Public, cookie-free reads only, so the route stays ISR (C28). Optional: a
// read error is logged and the block left out, never a failed page.
export default async function RelatedListings({
  locale,
  kind,
  excludeId,
  location,
}: {
  locale: AppLocale;
  kind: ListingKind;
  excludeId: string;
  /** The listing's `location` (an area name), to list neighbours first. */
  location: string | null;
}) {
  let candidates: Related[];
  try {
    candidates =
      kind === "apartments" || kind === "hotels" || kind === "sales"
        ? await loadProperties(kind, excludeId, location)
        : await loadServices(kind, excludeId, location);
  } catch (error) {
    console.error(
      "[related-listings]",
      kind,
      error instanceof Error ? error.message : error,
    );
    return null;
  }

  const seen = new Set<string>();
  const items = candidates
    .filter((item) => {
      if (isSeedListingId(item.id) || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .slice(0, SHOWN);
  if (items.length === 0) return null;

  const t = await getTranslations({ locale, namespace: "RelatedListings" });
  const tLanding = await getTranslations({ locale, namespace: "Landing" });

  return (
    <section
      aria-labelledby="related-listings"
      className={`mx-auto w-full ${DETAIL_WIDTH[kind]} px-4 pb-12 pt-4 sm:pb-16`}
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2
          id="related-listings"
          className="text-[20px] font-black leading-[30px] text-[#0F172A]"
        >
          {t(`title.${kind}`)}
        </h2>
        <Link
          href={`/${kind}`}
          className="inline-flex min-h-11 shrink-0 items-center text-[13px] font-bold text-[#2563EB] underline-offset-2 hover:underline"
        >
          {tLanding("viewAll")}
        </Link>
      </div>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              className="block h-full rounded-[16px] border border-[#E2E8F0] bg-white p-4 transition-shadow hover:shadow-[var(--shadow-card-hover)]"
            >
              <span className="line-clamp-2 block text-[15px] font-bold leading-[22px] text-[#1E293B]">
                {item.title}
              </span>
              {item.location && (
                <span className="mt-1 block text-[13px] font-medium text-[#64748B]">
                  {item.location}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
