// The facts a property listing states about itself, cleaned up so a sentence
// can be built from them (C40). Pure and self-contained (no `@/`, no sibling
// imports) so scripts/unit can test it (C29). The words around the numbers live
// in messages `ListingFacts.*`, in ka/en/ru together.

export const FACT_TYPES = [
  "flat",
  "apartment",
  "cottage",
  "villa",
  "house",
  "studio",
  "hotel",
  "land",
] as const;
export type FactType = (typeof FACT_TYPES)[number];

/** Rentals are priced per night, sales as one amount. */
export type FactKind = "rent" | "sale";

export interface PropertyFactsInput {
  type: string | null | undefined;
  isForSale: boolean | null | undefined;
  location: string | null | undefined;
  rooms: number | null | undefined;
  capacity: number | null | undefined;
  areaSqm: number | null | undefined;
  distanceToSlopeM: number | null | undefined;
  hotelStars: number | null | undefined;
  /** The price the page shows: a rental night, or the sale price, after any
   * active discount. */
  price: number | null | undefined;
}

export interface PropertyFacts {
  kind: FactKind;
  type: FactType | null;
  location: string | null;
  rooms: number | null;
  capacity: number | null;
  areaSqm: number | null;
  slopeM: number | null;
  stars: number | null;
  price: number | null;
}

/** An owner-typed area can be a whole address; a sentence wants a name. */
export const MAX_LOCATION_CHARS = 60;

function positiveInt(value: number | null | undefined, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const n = Math.round(value);
  return n > 0 && n <= max ? n : null;
}

export function buildPropertyFacts(input: PropertyFactsInput): PropertyFacts {
  const location =
    input.location?.replace(/\s+/g, " ").trim().slice(0, MAX_LOCATION_CHARS) ||
    null;
  return {
    kind: input.isForSale ? "sale" : "rent",
    type: (FACT_TYPES as readonly string[]).includes(input.type ?? "")
      ? (input.type as FactType)
      : null,
    location,
    rooms: positiveInt(input.rooms, 99),
    capacity: positiveInt(input.capacity, 999),
    areaSqm: positiveInt(input.areaSqm, 100000),
    slopeM: positiveInt(input.distanceToSlopeM, 100000),
    stars: positiveInt(input.hotelStars, 5),
    price: positiveInt(input.price, 1_000_000_000),
  };
}

/**
 * First letter upper-cased, so a fragment such as "from 120 ₾" can open a
 * sentence. Latin and Cyrillic only: Georgian has no sentence case, and
 * upper-casing a Mkhedruli letter yields a Mtavruli capital (ბ -> Ბ).
 */
export function sentenceCase(text: string): string {
  const first = text.charAt(0);
  return /[\p{Script=Latin}\p{Script=Cyrillic}]/u.test(first)
    ? first.toLocaleUpperCase() + text.slice(1)
    : text;
}
