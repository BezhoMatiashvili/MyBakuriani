"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import Image from "next/image";
import { toast } from "sonner";
import { Link } from "@/i18n/navigation";
import { ArrowRight, Heart, HeartOff, MapPin, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  setFavorite,
  type FavoriteTarget,
} from "@/lib/favorites/store";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber, formatPrice } from "@/lib/utils/format";
import { priceUnitPathFor } from "@/lib/constants/listing-options";
import type { Database } from "@/lib/types/database";

type Property = Database["public"]["Views"]["public_properties"]["Row"];
type Service = Database["public"]["Views"]["public_services"]["Row"];

interface FavoriteRow {
  id: string;
  target: FavoriteTarget;
  property: Property | null;
  service: Service | null;
}

export default function GuestFavoritesPage() {
  const t = useTranslations("GuestFavorites");
  const { user } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState<FavoriteRow[]>([]);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    async function fetchFavorites() {
      const { data: favs, error: favoritesError } = await supabase
        .from("favorites")
        .select("id, property_id, service_id, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });

      if (favoritesError || !favs || favs.length === 0) {
        setLoading(false);
        return;
      }

      const propertyIds = favs
        .map((f) => f.property_id)
        .filter((id): id is string => Boolean(id));
      const serviceIds = favs
        .map((f) => f.service_id)
        .filter((id): id is string => Boolean(id));

      const [propsRes, servicesRes] = await Promise.all([
        propertyIds.length
          ? supabase.from("public_properties").select("*").in("id", propertyIds)
          : Promise.resolve({ data: [] as Property[] }),
        serviceIds.length
          ? supabase.from("public_services").select("*").in("id", serviceIds)
          : Promise.resolve({ data: [] as Service[] }),
      ]);

      const propMap = new Map(
        ((propsRes.data as Property[]) ?? []).map((p) => [p.id, p]),
      );
      const svcMap = new Map(
        ((servicesRes.data as Service[]) ?? []).map((s) => [s.id, s]),
      );

      const rows: FavoriteRow[] = favs.map((f) => ({
        id: f.id,
        target: f.property_id
          ? { kind: "property", id: f.property_id }
          : { kind: "service", id: f.service_id! },
        property: f.property_id ? (propMap.get(f.property_id) ?? null) : null,
        service: f.service_id ? (svcMap.get(f.service_id) ?? null) : null,
      }));

      setFavorites(rows);
      setLoading(false);
    }
    fetchFavorites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function removeFavorite(favorite: FavoriteRow) {
    if (!user || removingId) return;
    setRemovingId(favorite.id);
    try {
      await setFavorite(user.id, favorite.target, false);
      setFavorites((rows) => rows.filter((row) => row.id !== favorite.id));
    } catch {
      // Preserve the card: the shared mutation only updates its local state
      // after a confirmed database deletion.
      toast.error(t("removeError"));
    } finally {
      setRemovingId(null);
    }
  }

  const propertyFavorites = favorites.filter((f) => f.target.kind === "property");
  const serviceFavorites = favorites.filter((f) => f.target.kind === "service");

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-[36px] font-black leading-[44px] text-[#0F172A]">
          {t("title")}
        </h1>
        <p className="mt-1 text-[14px] font-medium text-[#64748B]">
          {t("subtitle")}
        </p>
      </motion.div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[260px] rounded-[20px]" />
          ))}
        </div>
      ) : favorites.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[20px] border border-[#EEF1F4] bg-white py-16 text-center shadow-[0px_4px_12px_rgba(0,0,0,0.02)]">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#ECFDF5]">
            <Heart className="h-6 w-6 text-[#0F8F60]" />
          </div>
          <p className="mt-3 text-[14px] font-bold text-[#0F172A]">
            {t("emptyTitle")}
          </p>
          <p className="mt-1 text-[12px] text-[#94A3B8]">{t("emptyDesc")}</p>
          <Link
            href="/apartments"
            className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-[#0F8F60] px-5 py-2.5 text-[13px] font-bold text-white hover:bg-[#0B7A52]"
          >
            {t("browseListings")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <>
          {propertyFavorites.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <h2 className="text-[18px] font-black text-[#0F172A]">
                {t("sectionProperties")}
              </h2>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {propertyFavorites.map((f) => (
                  f.property ? (
                    <FavoritePropertyCard
                      key={f.id}
                      property={f.property}
                      onRemove={() => removeFavorite(f)}
                      removing={removingId === f.id}
                    />
                  ) : (
                    <UnavailableFavoriteCard
                      key={f.id}
                      onRemove={() => removeFavorite(f)}
                      removing={removingId === f.id}
                    />
                  )
                ))}
              </div>
            </motion.section>
          )}

          {serviceFavorites.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
            >
              <h2 className="text-[18px] font-black text-[#0F172A]">
                {t("sectionServices")}
              </h2>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {serviceFavorites.map((f) => (
                  f.service ? (
                    <FavoriteServiceCard
                      key={f.id}
                      service={f.service}
                      onRemove={() => removeFavorite(f)}
                      removing={removingId === f.id}
                    />
                  ) : (
                    <UnavailableFavoriteCard
                      key={f.id}
                      onRemove={() => removeFavorite(f)}
                      removing={removingId === f.id}
                    />
                  )
                ))}
              </div>
            </motion.section>
          )}
        </>
      )}
    </div>
  );
}

function FavoritePropertyCard({
  property,
  onRemove,
  removing,
}: {
  property: Property;
  onRemove: () => void;
  removing: boolean;
}) {
  const t = useTranslations("GuestFavorites");
  const photo = (property.photos ?? [])[0] ?? null;
  const href = property.is_for_sale
    ? `/sales/${property.id}`
    : `/apartments/${property.id}`;

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-[20px] border border-[#EEF1F4] bg-white shadow-[0px_4px_12px_rgba(0,0,0,0.02)] transition-shadow hover:shadow-[0px_12px_24px_rgba(15,23,42,0.08)]">
      <Link
        href={href}
        className="relative block h-[160px] w-full overflow-hidden bg-[#F1F5F9]"
      >
        {photo && (
          <Image
            src={photo}
            alt={property.title}
            fill
            sizes="400px"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        )}
        {property.is_vip && (
          <span className="absolute left-3 top-3 rounded-md bg-[#F97316] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
            VIP
          </span>
        )}
      </Link>
      <button
        type="button"
        onClick={onRemove}
        disabled={removing}
        aria-label={t("removeFromFavorites")}
        className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-[#EF4444] shadow-sm transition-colors hover:bg-white"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3 className="truncate text-[14px] font-extrabold text-[#0F172A]">
          {property.title}
        </h3>
        <p className="flex items-center gap-1 text-[12px] text-[#94A3B8]">
          <MapPin className="h-3 w-3" />
          {property.location}
        </p>
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <div className="flex items-baseline gap-1">
            {/* Sale prices are entered and stored in USD (the create form
                prefixes "$" and stamps price_currency: "USD"), so they render
                with "$" like the sale cards do — not with the GEL nightly
                price + "/ღამე", which used to render "0 ₾ /ღამე" on every
                favourited sale listing. */}
            <span className="text-[16px] font-black text-[#0F172A]">
              {property.is_for_sale
                ? `$${formatNumber(Number(property.sale_price ?? 0))}`
                : formatPrice(Number(property.price_per_night ?? 0))}
            </span>
            {!property.is_for_sale && (
              <span className="text-[11px] font-medium text-[#94A3B8]">
                {t("perNight")}
              </span>
            )}
          </div>
          <Link
            href={href}
            className="inline-flex items-center gap-1 rounded-xl border border-[#0F8F60] bg-white px-3 py-1.5 text-[12px] font-bold text-[#0F8F60] hover:bg-[#ECFDF5]"
          >
            {t("view")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function FavoriteServiceCard({
  service,
  onRemove,
  removing,
}: {
  service: Service;
  onRemove: () => void;
  removing: boolean;
}) {
  const t = useTranslations("GuestFavorites");
  const tOpts = useTranslations("ListingOptions");
  const priceUnitPath = priceUnitPathFor(service.price_unit);
  const photo = (service.photos ?? [])[0] ?? null;
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-[20px] border border-[#EEF1F4] bg-white shadow-[0px_4px_12px_rgba(0,0,0,0.02)] transition-shadow hover:shadow-[0px_12px_24px_rgba(15,23,42,0.08)]">
      <Link
        href={`/services/${service.id}`}
        className="relative block h-[160px] w-full overflow-hidden bg-[#F1F5F9]"
      >
        {photo && (
          <Image
            src={photo}
            alt={service.title}
            fill
            sizes="400px"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        )}
      </Link>
      <button
        type="button"
        onClick={onRemove}
        disabled={removing}
        aria-label={t("removeFromFavorites")}
        className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-[#EF4444] shadow-sm transition-colors hover:bg-white"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3 className="truncate text-[14px] font-extrabold text-[#0F172A]">
          {service.title}
        </h3>
        {service.location && (
          <p className="flex items-center gap-1 text-[12px] text-[#94A3B8]">
            <MapPin className="h-3 w-3" />
            {service.location}
          </p>
        )}
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          {service.price != null ? (
            <div className="flex items-baseline gap-1">
              <span className="text-[16px] font-black text-[#0F172A]">
                {formatPrice(Number(service.price))}
              </span>
              {service.price_unit && (
                <span className="text-[11px] font-medium text-[#94A3B8]">
                  /{priceUnitPath ? tOpts(priceUnitPath) : service.price_unit}
                </span>
              )}
            </div>
          ) : (
            <span />
          )}
          <Link
            href={`/services/${service.id}`}
            className="inline-flex items-center gap-1 rounded-xl border border-[#0F8F60] bg-white px-3 py-1.5 text-[12px] font-bold text-[#0F8F60] hover:bg-[#ECFDF5]"
          >
            {t("view")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function UnavailableFavoriteCard({
  onRemove,
  removing,
}: {
  onRemove: () => void;
  removing: boolean;
}) {
  const t = useTranslations("GuestFavorites");

  return (
    <div className="flex min-h-[250px] flex-col items-center justify-center rounded-[20px] border border-[#EEF1F4] bg-white p-6 text-center shadow-[0px_4px_12px_rgba(0,0,0,0.02)]">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F5F9]">
        <HeartOff className="h-5 w-5 text-[#64748B]" />
      </div>
      <h3 className="mt-3 text-[14px] font-extrabold text-[#0F172A]">
        {t("unavailableTitle")}
      </h3>
      <p className="mt-1 text-[12px] text-[#64748B]">{t("unavailableDesc")}</p>
      <button
        type="button"
        onClick={onRemove}
        disabled={removing}
        className="mt-5 inline-flex items-center gap-1.5 rounded-xl border border-[#EF4444] px-3 py-2 text-[12px] font-bold text-[#DC2626] hover:bg-[#FEF2F2] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Trash2 className="h-4 w-4" />
        {t("removeFromFavorites")}
      </button>
    </div>
  );
}
