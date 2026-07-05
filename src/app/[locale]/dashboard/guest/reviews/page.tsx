"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { motion } from "framer-motion";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { History, Phone, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateShort } from "@/lib/utils/format";
import type { Tables } from "@/lib/types/database";

type ContactListing =
  | {
      kind: "property";
      id: string;
      title: string;
      photo: string | null;
      href: string;
    }
  | {
      kind: "service";
      id: string;
      title: string;
      photo: string | null;
      href: string;
    };

type ContactEventRow = Pick<
  Tables<"contact_events">,
  "id" | "channel" | "created_at"
> & {
  listing: ContactListing;
};

type PropertyListingRow = Pick<
  Tables<"properties">,
  "id" | "title" | "photos" | "is_for_sale"
>;
type ServiceListingRow = Pick<Tables<"services">, "id" | "title" | "photos">;

type ReviewRow = Tables<"reviews"> & {
  properties: Pick<Tables<"properties">, "title" | "photos"> | null;
};

function useContactRelativeFormatter() {
  const t = useTranslations("GuestReviews");
  const locale = useLocale();

  return (iso: string | null) => {
    if (!iso) return t("undated");
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return t("undated");

    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const startOfDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dayDiff = Math.round(
      (startOfToday.getTime() - startOfDate.getTime()) / 86400000,
    );

    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const time = `${hh}:${mm}`;

    if (dayDiff <= 0) return t("calledToday", { time });
    if (dayDiff === 1) return t("calledYesterday", { time });
    if (dayDiff < 7) return t("calledDaysAgo", { days: dayDiff });
    return t("calledOn", { date: formatDateShort(iso, locale) });
  };
}

export default function GuestHistoryPage() {
  const t = useTranslations("GuestReviews");
  const locale = useLocale();
  const formatContactRelative = useContactRelativeFormatter();
  const { user } = useAuth();
  const supabase = createClient();

  const [contacts, setContacts] = useState<ContactEventRow[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    async function fetchData() {
      const [ceRes, rvRes] = await Promise.all([
        supabase
          .from("contact_events")
          .select("id, channel, property_id, service_id, created_at")
          .eq("visitor_id", user!.id)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("reviews")
          .select("*, properties(title, photos)")
          .eq("guest_id", user!.id)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);
      if (rvRes.data) setReviews(rvRes.data as ReviewRow[]);

      const contactRows = ceRes.data ?? [];
      const propertyIds = contactRows
        .map((c) => c.property_id)
        .filter((id): id is string => Boolean(id));
      const serviceIds = contactRows
        .map((c) => c.service_id)
        .filter((id): id is string => Boolean(id));

      const [propsRes, servicesRes] = await Promise.all([
        propertyIds.length
          ? supabase
              .from("properties")
              .select("id, title, photos, is_for_sale")
              .in("id", propertyIds)
          : Promise.resolve({ data: [] as PropertyListingRow[] }),
        serviceIds.length
          ? supabase
              .from("services")
              .select("id, title, photos")
              .in("id", serviceIds)
          : Promise.resolve({ data: [] as ServiceListingRow[] }),
      ]);

      const propMap = new Map(
        ((propsRes.data as PropertyListingRow[]) ?? []).map((p) => [p.id, p]),
      );
      const svcMap = new Map(
        ((servicesRes.data as ServiceListingRow[]) ?? []).map((s) => [s.id, s]),
      );

      const resolved = contactRows
        .map((row) => {
          let listing: ContactListing | null = null;
          if (row.property_id) {
            const p = propMap.get(row.property_id);
            if (p) {
              listing = {
                kind: "property",
                id: p.id,
                title: p.title,
                photo: p.photos?.[0] ?? null,
                href: p.is_for_sale ? `/sales/${p.id}` : `/apartments/${p.id}`,
              };
            }
          } else if (row.service_id) {
            const s = svcMap.get(row.service_id);
            if (s) {
              listing = {
                kind: "service",
                id: s.id,
                title: s.title,
                photo: s.photos?.[0] ?? null,
                href: `/services/${s.id}`,
              };
            }
          }
          return {
            id: row.id,
            channel: row.channel,
            created_at: row.created_at,
            listing,
          };
        })
        .filter((c) => c.listing !== null) as ContactEventRow[];

      setContacts(resolved);
      setLoading(false);
    }
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-[20px] border border-[#EEF1F4] bg-white p-6 shadow-[0px_4px_12px_rgba(0,0,0,0.02)] sm:p-8"
      >
        <h1 className="text-[30px] font-black leading-[38px] text-[#0F172A]">
          {t("title")}
        </h1>
        <p className="mt-1 text-[14px] font-medium text-[#64748B]">
          {t("subtitle")}
        </p>
      </motion.div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">
            {t("recentCalls")}
          </p>
          <div className="space-y-3">
            {loading ? (
              Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-[72px] rounded-[16px]" />
              ))
            ) : contacts.length === 0 ? (
              <EmptyState
                icon={<History className="h-6 w-6 text-[#CBD5E1]" />}
                title={t("noCalls")}
              />
            ) : (
              contacts.map((c) => (
                <ContactCard
                  key={c.id}
                  contact={c}
                  formatContactRelative={formatContactRelative}
                />
              ))
            )}
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[#94A3B8]">
            {t("myReviews")}
          </p>
          <div className="space-y-3">
            {loading ? (
              Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-[72px] rounded-[16px]" />
              ))
            ) : reviews.length === 0 ? (
              <EmptyState
                icon={<Star className="h-6 w-6 text-[#CBD5E1]" />}
                title={t("noReviews")}
              />
            ) : (
              reviews.map((r) => (
                <ReviewCard key={r.id} review={r} locale={locale} />
              ))
            )}
          </div>
        </motion.section>
      </div>
    </div>
  );
}

function EmptyState({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[16px] border border-dashed border-[#E2E8F0] bg-white py-10 text-center">
      {icon}
      <p className="mt-2 text-[12px] font-medium text-[#94A3B8]">{title}</p>
    </div>
  );
}

function ContactCard({
  contact,
  formatContactRelative,
}: {
  contact: ContactEventRow;
  formatContactRelative: (iso: string | null) => string;
}) {
  const isWhatsapp = contact.channel === "whatsapp";

  return (
    <Link
      href={contact.listing.href}
      className="flex items-center gap-3 rounded-[16px] border border-[#EEF1F4] bg-white p-3 shadow-[0px_4px_12px_rgba(0,0,0,0.02)] transition-colors hover:border-[#0F8F60]/40"
    >
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-[#F1F5F9]">
        {contact.listing.photo && (
          <Image
            src={contact.listing.photo}
            alt={contact.listing.title}
            fill
            sizes="40px"
            className="object-cover"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-bold text-[#0F172A]">
          {contact.listing.title}
        </p>
        <p className="text-[11px] text-[#94A3B8]">
          {formatContactRelative(contact.created_at)}
        </p>
      </div>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ECFDF5] text-[#0F8F60]">
        {isWhatsapp ? (
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
        ) : (
          <Phone className="h-4 w-4" />
        )}
      </span>
    </Link>
  );
}

function ReviewCard({ review, locale }: { review: ReviewRow; locale: string }) {
  const t = useTranslations("GuestReviews");
  const photo = review.properties?.photos?.[0] ?? null;
  return (
    <div className="flex items-center gap-3 rounded-[16px] border border-[#EEF1F4] bg-white p-3 shadow-[0px_4px_12px_rgba(0,0,0,0.02)]">
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-[#F1F5F9]">
        {photo && (
          <Image
            src={photo}
            alt={review.properties?.title ?? ""}
            fill
            sizes="40px"
            className="object-cover"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-bold text-[#0F172A]">
          {review.properties?.title ?? t("defaultProperty")}
        </p>
        <p className="text-[11px] text-[#94A3B8]">
          {formatDateShort(review.created_at, locale)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={`h-3.5 w-3.5 ${
              i < (review.rating ?? 0) ? "text-[#F59E0B]" : "text-[#E2E8F0]"
            }`}
            fill="currentColor"
          />
        ))}
      </div>
    </div>
  );
}
