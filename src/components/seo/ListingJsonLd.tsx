import { getTranslations } from "next-intl/server";
import JsonLd from "@/components/seo/JsonLd";
import { routing, type AppLocale } from "@/i18n/routing";
import { optionKeyFor } from "@/lib/constants/listing-options";
import type { PropertyWithProfile } from "@/lib/data/getPropertyById";
import { pathForLocale } from "@/lib/seo/alternates";
import { optimizedImageUrls } from "@/lib/seo/image-url";
import { hotelJsonLd, restaurantJsonLd } from "@/lib/seo/jsonld";
import { SITE_URL } from "@/lib/seo/site";
import type { ServiceWithFoodExtras } from "@/lib/mock/services";
import { sanitizePhotos } from "@/lib/utils/photos";

// Structured data for the two listing kinds Google treats as local businesses.
// Everything here is something the page shows: the title, the description, the
// photos, the cuisine label, the menu link, and a pin only where the page draws
// one (hotels; the restaurant page has no map). No phone number (it sits behind
// the reveal button), no rating (none is displayed). C40.
const pageUrl = (locale: AppLocale, path: string) =>
  new URL(pathForLocale(path, locale, routing.defaultLocale), SITE_URL).href;

export async function HotelJsonLd({
  locale,
  path,
  property,
}: {
  locale: AppLocale;
  path: string;
  property: Pick<
    PropertyWithProfile,
    | "title"
    | "description"
    | "photos"
    | "location_lat"
    | "location_lng"
    | "hotel_stars"
  >;
}) {
  const t = await getTranslations({ locale, namespace: "Seo" });
  const { location_lat: lat, location_lng: lng } = property;
  return (
    <JsonLd
      data={hotelJsonLd({
        url: pageUrl(locale, path),
        name: property.title,
        description: property.description,
        images: optimizedImageUrls(SITE_URL, sanitizePhotos(property.photos)),
        locality: t("locality"),
        geo: lat && lng ? { lat, lng } : null,
        starRating: property.hotel_stars,
      })}
    />
  );
}

export async function RestaurantJsonLd({
  locale,
  path,
  service,
}: {
  locale: AppLocale;
  path: string;
  service: Pick<
    ServiceWithFoodExtras,
    "title" | "description" | "photos" | "cuisine_type" | "menu_url"
  >;
}) {
  const t = await getTranslations({ locale, namespace: "Seo" });
  const tOptions = await getTranslations({
    locale,
    namespace: "ListingOptions",
  });
  const cuisineKey = optionKeyFor("cuisineTypes", service.cuisine_type);
  return (
    <JsonLd
      data={restaurantJsonLd({
        url: pageUrl(locale, path),
        name: service.title,
        description: service.description,
        images: optimizedImageUrls(SITE_URL, sanitizePhotos(service.photos)),
        locality: t("locality"),
        servesCuisine: cuisineKey
          ? tOptions(`cuisineTypes.${cuisineKey}`)
          : service.cuisine_type,
        menuUrl: service.menu_url,
      })}
    />
  );
}
