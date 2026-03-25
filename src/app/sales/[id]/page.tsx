"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin,
  Ruler,
  BedDouble,
  Bath,
  Building2,
  Calculator,
  Eye,
  X,
  ChevronLeft,
  ChevronRight,
  FileText,
} from "lucide-react";
import { useProperties } from "@/lib/hooks/useProperties";
import { formatPrice } from "@/lib/utils/format";
import { fadeIn } from "@/lib/utils/animations";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/types/database";

type Property = Database["public"]["Tables"]["properties"]["Row"];

interface OwnerProfile {
  display_name: string;
  avatar_url: string | null;
  is_verified: boolean;
  phone: string;
}

export default function SaleDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { property, loading, getById } = useProperties();
  const [owner, setOwner] = useState<OwnerProfile | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // ROI calculator state
  const [purchasePrice, setPurchasePrice] = useState<number | "">("");
  const [monthlyRental, setMonthlyRental] = useState<number | "">("");

  useEffect(() => {
    if (id) getById(id);
  }, [id, getById]);

  // Increment views
  useEffect(() => {
    if (!id) return;
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.rpc as any)("increment_views", { property_id: id }).then(
      () => {},
    );
  }, [id]);

  // Fetch owner
  const fetchOwner = useCallback(async (prop: Property) => {
    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select("display_name, avatar_url, is_verified, phone")
      .eq("id", prop.owner_id)
      .single();
    if (data) setOwner(data);
  }, []);

  useEffect(() => {
    if (property) {
      fetchOwner(property);
      if (property.sale_price) setPurchasePrice(property.sale_price);
    }
  }, [property, fetchOwner]);

  const calculatedROI =
    purchasePrice && monthlyRental
      ? (((monthlyRental as number) * 12) / (purchasePrice as number)) * 100
      : null;

  if (loading || !property) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="animate-pulse space-y-6">
          <div className="aspect-[16/9] rounded-xl bg-muted" />
          <div className="h-8 w-2/3 rounded bg-muted" />
          <div className="h-4 w-1/3 rounded bg-muted" />
        </div>
      </div>
    );
  }

  const photos =
    property.photos.length > 0
      ? property.photos
      : ["/placeholder-property.jpg"];

  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className="mx-auto max-w-7xl px-4 py-8"
    >
      {/* Photo Gallery */}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-4 md:grid-rows-2">
        <button
          type="button"
          onClick={() => {
            setLightboxIndex(0);
            setLightboxOpen(true);
          }}
          className="relative col-span-2 row-span-2 aspect-[4/3] overflow-hidden rounded-xl md:rounded-l-xl"
        >
          <Image
            src={photos[0]}
            alt={property.title}
            fill
            className="object-cover transition-transform duration-300 hover:scale-105"
            priority
          />
        </button>
        {photos.slice(1, 5).map((photo, i) => (
          <button
            key={i}
            type="button"
            onClick={() => {
              setLightboxIndex(i + 1);
              setLightboxOpen(true);
            }}
            className="relative hidden aspect-[4/3] overflow-hidden rounded-xl md:block"
          >
            <Image
              src={photo}
              alt={`${property.title} - ${i + 2}`}
              fill
              className="object-cover transition-transform duration-300 hover:scale-105"
            />
            {i === 3 && photos.length > 5 && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-lg font-bold text-white">
                +{photos.length - 5} ფოტო
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Views */}
      <div className="mt-3 flex items-center gap-1 text-sm text-muted-foreground">
        <Eye className="size-4" />
        {property.views_count} ნახვა
      </div>

      {/* Content */}
      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Left */}
        <div className="space-y-8 lg:col-span-2">
          {/* Title + price */}
          <div>
            <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
              {property.title}
            </h1>
            <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin className="size-4" />
                {property.location}
              </span>
            </div>
            {property.sale_price != null && (
              <p className="mt-3 text-3xl font-bold text-foreground">
                {formatPrice(property.sale_price)}
              </p>
            )}
          </div>

          {/* Property specs */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {property.area_sqm != null && (
              <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-4">
                <Ruler className="size-5 text-blue-600" />
                <div>
                  <p className="text-lg font-bold text-foreground">
                    {property.area_sqm} მ²
                  </p>
                  <p className="text-xs text-muted-foreground">ფართობი</p>
                </div>
              </div>
            )}
            {property.rooms != null && (
              <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-4">
                <BedDouble className="size-5 text-blue-600" />
                <div>
                  <p className="text-lg font-bold text-foreground">
                    {property.rooms}
                  </p>
                  <p className="text-xs text-muted-foreground">ოთახი</p>
                </div>
              </div>
            )}
            {property.bathrooms != null && (
              <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-4">
                <Bath className="size-5 text-blue-600" />
                <div>
                  <p className="text-lg font-bold text-foreground">
                    {property.bathrooms}
                  </p>
                  <p className="text-xs text-muted-foreground">სააბაზანო</p>
                </div>
              </div>
            )}
            {property.cadastral_code && (
              <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-4">
                <FileText className="size-5 text-blue-600" />
                <div>
                  <p className="truncate text-sm font-bold text-foreground">
                    {property.cadastral_code}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    საკადასტრო კოდი
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Description */}
          {property.description && (
            <div>
              <h2 className="mb-3 text-lg font-semibold text-foreground">
                აღწერა
              </h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {property.description}
              </p>
            </div>
          )}

          {/* Construction status */}
          {property.construction_status && (
            <div>
              <h2 className="mb-3 text-lg font-semibold text-foreground">
                მშენებლობის სტატუსი
              </h2>
              <div className="flex items-center gap-3 rounded-xl bg-blue-50 p-4">
                <Building2 className="size-6 text-blue-600" />
                <div>
                  <p className="font-medium text-foreground">
                    {property.construction_status}
                  </p>
                  {property.developer && (
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      დეველოპერი: {property.developer}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ROI Calculator */}
          <div>
            <h2 className="mb-4 text-lg font-semibold text-foreground">
              <Calculator className="mr-2 inline-block size-5" />
              ROI კალკულატორი
            </h2>
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">
                    შესყიდვის ფასი (₾)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={purchasePrice}
                    onChange={(e) =>
                      setPurchasePrice(
                        e.target.value ? Number(e.target.value) : "",
                      )
                    }
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">
                    სავარაუდო თვიური შემოსავალი (₾)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={monthlyRental}
                    onChange={(e) =>
                      setMonthlyRental(
                        e.target.value ? Number(e.target.value) : "",
                      )
                    }
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
                  />
                </div>
              </div>

              {calculatedROI !== null && (
                <div className="mt-4 rounded-lg bg-green-50 p-4 text-center">
                  <p className="text-sm text-muted-foreground">
                    წლიური ანაზღაურება (ROI)
                  </p>
                  <p className="mt-1 text-3xl font-bold text-green-600">
                    {calculatedROI.toFixed(1)}%
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    წლიური შემოსავალი:{" "}
                    {formatPrice((monthlyRental as number) * 12)}
                  </p>
                </div>
              )}

              {property.roi_percent != null && (
                <p className="mt-3 text-sm text-muted-foreground">
                  პლატფორმის შეფასებით ROI: {property.roi_percent}%
                </p>
              )}
            </div>
          </div>

          {/* Location map placeholder */}
          <div>
            <h2 className="mb-3 text-lg font-semibold text-foreground">
              მდებარეობა
            </h2>
            <div className="flex aspect-[16/9] items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <MapPin className="mr-2 size-5" />
              რუკა მალე დაემატება
            </div>
          </div>
        </div>

        {/* Right sidebar — contact */}
        <div>
          <div className="sticky top-24 space-y-4 rounded-2xl bg-white p-5 shadow-sm">
            {property.sale_price != null && (
              <div className="mb-2">
                <span className="text-2xl font-bold text-foreground">
                  {formatPrice(property.sale_price)}
                </span>
              </div>
            )}

            {/* Developer info */}
            {property.developer && (
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">დეველოპერი</p>
                <p className="font-medium text-foreground">
                  {property.developer}
                </p>
              </div>
            )}

            {/* Owner info */}
            {owner && (
              <div className="flex items-center gap-3">
                <div className="relative size-10 shrink-0 overflow-hidden rounded-full bg-muted">
                  {owner.avatar_url ? (
                    <Image
                      src={owner.avatar_url}
                      alt={owner.display_name}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-sm font-medium text-muted-foreground">
                      {owner.display_name.charAt(0)}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {owner.display_name}
                  </p>
                  {owner.is_verified && (
                    <p className="text-xs text-blue-600">
                      ვერიფიცირებული გამყიდველი
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="border-t border-border pt-4">
              <Button className="h-11 w-full gap-2 bg-blue-600 text-base font-semibold text-white hover:bg-blue-700">
                დაკავშირება
              </Button>
            </div>

            {property.roi_percent != null && (
              <div className="rounded-lg bg-green-50 p-3 text-center">
                <p className="text-xs text-muted-foreground">სავარაუდო ROI</p>
                <p className="text-xl font-bold text-green-600">
                  {property.roi_percent}%
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          >
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            >
              <X className="size-6" />
            </button>

            <button
              type="button"
              onClick={() =>
                setLightboxIndex(
                  (lightboxIndex - 1 + photos.length) % photos.length,
                )
              }
              className="absolute left-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            >
              <ChevronLeft className="size-6" />
            </button>

            <motion.div
              key={lightboxIndex}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative h-[80vh] w-[90vw] max-w-5xl"
            >
              <Image
                src={photos[lightboxIndex]}
                alt={`${property.title} - ${lightboxIndex + 1}`}
                fill
                className="object-contain"
              />
            </motion.div>

            <button
              type="button"
              onClick={() =>
                setLightboxIndex((lightboxIndex + 1) % photos.length)
              }
              className="absolute right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            >
              <ChevronRight className="size-6" />
            </button>

            <div className="absolute bottom-4 text-sm text-white/70">
              {lightboxIndex + 1} / {photos.length}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
