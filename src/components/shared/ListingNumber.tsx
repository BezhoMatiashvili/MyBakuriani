"use client";

import { useTranslations } from "next-intl";

/**
 * "ID: 10000042" — a listing's public number (C61) in owner cabinets and
 * admin lists. Renders nothing while the number is unknown.
 */
export default function ListingNumber({
  value,
  className,
}: {
  value: number | null | undefined;
  className?: string;
}) {
  const t = useTranslations("Shared");
  if (!value) return null;
  // A string, not a number: ICU would group the digits ("10,000,042").
  return (
    <span className={className}>{t("listingId", { id: String(value) })}</span>
  );
}
