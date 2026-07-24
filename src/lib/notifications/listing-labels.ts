// Georgian display labels for property types and service categories, used when
// composing notification text server-side (API routes can't use next-intl's
// `useTranslations`). Notification bodies in this app are stored as pre-rendered
// Georgian strings, so we mirror the canonical labels here.
//
// Keep these in sync with messages/ka.json → ListingOptions.propertyTypes /
// ListingOptions.serviceCategories.

import type { Enums } from "@/lib/types/database";

const PROPERTY_TYPE_LABEL_KA: Record<Enums<"property_type">, string> = {
  apartment: "აპარტამენტი",
  studio: "სტუდიო",
  cottage: "კოტეჯი",
  hotel: "სასტუმრო ოთახი",
  villa: "ვილა",
  land: "მიწის ნაკვეთი",
};

const SERVICE_CATEGORY_LABEL_KA: Record<Enums<"service_category">, string> = {
  food: "კვება",
  transport: "ტრანსპორტი",
  entertainment: "გართობა",
  employment: "სამუშაო",
  handyman: "ხელოსანი",
  cleaning: "დასუფთავება",
};

/** Georgian label for a property `type`, falling back to the raw value. */
export function propertyTypeLabelKa(type: string | null | undefined): string {
  if (!type) return "განცხადება";
  return PROPERTY_TYPE_LABEL_KA[type as Enums<"property_type">] ?? type;
}

/** Georgian label for a service `category`, falling back to the raw value. */
export function serviceCategoryLabelKa(
  category: string | null | undefined,
): string {
  if (!category) return "სერვისი";
  return (
    SERVICE_CATEGORY_LABEL_KA[category as Enums<"service_category">] ?? category
  );
}
