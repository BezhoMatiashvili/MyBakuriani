import { getTranslations } from "next-intl/server";
import { areaNamer } from "@/components/seo/areaName";
import { DETAIL_WIDTH, type ListingKind } from "@/components/seo/listing-kind";
import { Money } from "@/components/shared/Money";
import type { AppLocale } from "@/i18n/routing";
import type { SaleMoneyRow } from "@/lib/currency/client";
import type { CurrencyCode } from "@/lib/currency/money";
import {
  buildPropertyFacts,
  sentenceCase,
  type PropertyFacts,
} from "@/lib/seo/listing-facts";
import { formatInCurrency, saleOwnPrice } from "@/lib/utils/format";
import { applyDiscount } from "@/lib/utils/pricing";

/** The facts as the page states them: `price` is the shown price (C10) in
 * `currency`, the listing's own (a sale's seller's, C54; a rental's lari).
 * `exactPrice` is that price before rounding, which a currency conversion
 * starts from (C55); `sale` is a sale's price columns, for <Money sale>. */
type ListingFactsData = PropertyFacts & {
  exactPrice: number | null;
  currency: CurrencyCode;
  sale: SaleMoneyRow | null;
};

// The listing's own fields as one sentence in the page's language (C40). Owner
// descriptions are usually a few characters, so without this a detail page's
// text, and the meta description built from it, is the title and the area. The
// words come from messages `ListingFacts.*`; the type names are the filter's
// (`FilterPanel.types.*`). No place name is inflected: the area follows a
// colon, because Georgian and Russian would need a different case ending.
// `priceText` is what the sentence states as the price.
async function factsSentence(
  locale: AppLocale,
  facts: PropertyFacts,
  priceText: string,
): Promise<string> {
  const t = await getTranslations({ locale, namespace: "ListingFacts" });
  const area = (await areaNamer(locale))(facts.location);
  const tTypes = await getTranslations({ locale, namespace: "FilterPanel" });

  const type = facts.type ? tTypes(`types.${facts.type}`) : t("typeOther");
  const headline = t(facts.kind === "sale" ? "headlineSale" : "headlineRent", {
    type,
  });

  const details = [
    facts.stars ? t("stars", { count: facts.stars }) : null,
    facts.rooms ? t("rooms", { count: facts.rooms }) : null,
    facts.capacity ? t("capacity", { count: facts.capacity }) : null,
    facts.areaSqm ? t("area", { count: facts.areaSqm }) : null,
    facts.slopeM ? t("slope", { count: facts.slopeM }) : null,
  ].filter((part): part is string => Boolean(part));

  const price = facts.price
    ? t(facts.kind === "sale" ? "priceSale" : "priceNight", {
        price: priceText,
      })
    : null;

  return (
    [
      headline,
      area ? t("location", { location: area }) : null,
      details.length ? details.join(", ") : null,
      price,
    ]
      .filter((part): part is string => Boolean(part))
      .map(sentenceCase)
      .join(". ") + "."
  );
}

/** The price as the sentence states it: in the listing's own currency. */
function nativePriceText(facts: ListingFactsData): string {
  if (!facts.price) return "";
  return formatInCurrency(facts.price, facts.currency);
}

/** The sentence as plain text, its price in the listing's own currency: the
 * meta description, and the visible paragraph until a currency is picked. */
export async function listingFactsText(
  locale: AppLocale,
  facts: ListingFactsData,
): Promise<string> {
  return factsSentence(locale, facts, nativePriceText(facts));
}

/** The columns of a `public_properties` row that the sentence reads. */
export interface FactRow {
  type?: string | null;
  is_for_sale?: boolean | null;
  location?: string | null;
  rooms?: number | null;
  capacity?: number | null;
  area_sqm?: number | null;
  distance_to_slope_m?: number | null;
  hotel_stars?: number | null;
  price_per_night?: number | null;
  sale_price?: number | null;
  sale_price_gel?: number | null;
  sale_price_currency?: string | null;
  discount_percent?: number | null;
  discount_expires_at?: string | null;
}

/**
 * The price is the one the page shows: the active discount is applied with the
 * page's own helper (C10), so the sentence never states a higher price than
 * the card does. A sale's is in its seller's currency (C54).
 */
export function propertyFactsFromRow(row: FactRow): ListingFactsData {
  const isForSale = Boolean(row.is_for_sale);
  const sale = isForSale
    ? {
        sale_price: row.sale_price ?? null,
        sale_price_gel: row.sale_price_gel ?? null,
        sale_price_currency: row.sale_price_currency ?? null,
        discount_percent: row.discount_percent,
        discount_expires_at: row.discount_expires_at,
      }
    : null;
  const own = sale ? saleOwnPrice(sale) : null;
  const base = sale ? own?.amount : row.price_per_night;
  const price =
    typeof base === "number" && base > 0
      ? applyDiscount(base, row.discount_percent, row.discount_expires_at)
      : null;
  const facts = buildPropertyFacts({
    type: row.type,
    isForSale,
    location: row.location,
    rooms: row.rooms,
    capacity: row.capacity,
    areaSqm: row.area_sqm,
    distanceToSlopeM: row.distance_to_slope_m,
    hotelStars: row.hotel_stars,
    price,
  });
  return {
    ...facts,
    exactPrice: price,
    currency: own?.currency ?? "GEL",
    sale,
  };
}

// Holds the price's place in the visible paragraph's sentence, where a <Money>
// states it in the visitor's currency (C55). Postgres text cannot store a NUL,
// so no listing field holds one.
const PRICE_SLOT = String.fromCharCode(0);

/** A visible "at a glance" paragraph; nothing when the listing states no fact
 * beyond its type. */
export default async function ListingFacts({
  locale,
  kind,
  facts,
}: {
  locale: AppLocale;
  kind: ListingKind;
  facts: ListingFactsData;
}) {
  const hasDetail =
    facts.location ||
    facts.rooms ||
    facts.capacity ||
    facts.areaSqm ||
    facts.slopeM ||
    facts.stars ||
    facts.price;
  if (!hasDetail) return null;

  const [t, text, slotted] = await Promise.all([
    getTranslations({ locale, namespace: "ListingFacts" }),
    listingFactsText(locale, facts),
    factsSentence(locale, facts, PRICE_SLOT),
  ]);
  // The price becomes a <Money> only where the words around it read exactly
  // as `text`; otherwise the paragraph is `text` as it stands. A sale's prints
  // `native` (already discounted) until a pick, then its other stored number.
  const native = nativePriceText(facts);
  const [before, after = ""] = slotted.split(PRICE_SLOT);
  const priceNode =
    facts.price && before + native + after === text ? (
      facts.sale ? (
        <Money sale={facts.sale}>{native}</Money>
      ) : (
        <Money amount={facts.exactPrice ?? facts.price} from="GEL">
          {native}
        </Money>
      )
    ) : null;

  return (
    <section
      aria-labelledby="listing-facts"
      className={`mx-auto w-full ${DETAIL_WIDTH[kind]} px-4 pb-2 pt-6`}
    >
      <h2
        id="listing-facts"
        className="text-[20px] font-black leading-[30px] text-[#0F172A]"
      >
        {t("heading")}
      </h2>
      <p className="mt-2 max-w-3xl text-[15px] font-medium leading-[26px] text-[#475569]">
        {priceNode ? (
          <>
            {before}
            {priceNode}
            {after}
          </>
        ) : (
          text
        )}
      </p>
    </section>
  );
}
