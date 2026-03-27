"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  MapPin,
  Phone,
  Eye,
  BadgeCheck,
  UtensilsCrossed,
  Clock,
  Truck,
  ChefHat,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PhotoGallery } from "@/components/detail/PhotoGallery";
import { formatPrice } from "@/lib/utils/format";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/types/database";

type ServiceWithOwner = Tables<"services"> & {
  profiles: Tables<"profiles"> | null;
};

interface MenuItem {
  name: string;
  price: number;
  description?: string;
}

interface Props {
  service: ServiceWithOwner;
}

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4 },
};

export default function FoodDetailClient({ service }: Props) {
  const router = useRouter();
  const owner = service.profiles;

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("services")
      .update({ views_count: service.views_count + 1 })
      .eq("id", service.id)
      .then();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service.id]);

  // Parse menu items from JSON
  const menuItems: MenuItem[] = Array.isArray(service.menu)
    ? (service.menu as unknown as MenuItem[])
    : [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
      <motion.button
        {...fadeIn}
        onClick={() => router.back()}
        className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        უკან დაბრუნება
      </motion.button>

      <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.1 }}>
        <PhotoGallery photos={service.photos} title={service.title} />
      </motion.div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-8">
          {/* Title */}
          <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.15 }}>
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                კვება
              </span>
              {service.cuisine_type && (
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                  {service.cuisine_type}
                </span>
              )}
              {service.has_delivery && (
                <span className="rounded-md bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                  მიტანის სერვისი
                </span>
              )}
              {service.is_vip && (
                <span className="rounded-md bg-brand-vip px-2 py-0.5 text-xs font-bold text-white">
                  VIP
                </span>
              )}
            </div>
            <h1 className="text-2xl font-black text-[#1E293B] sm:text-3xl">
              {service.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              {service.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {service.location}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Eye className="h-4 w-4" />
                {service.views_count} ნახვა
              </span>
            </div>
          </motion.div>

          {/* Info cards */}
          <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.2 }}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {service.operating_hours && (
                <div className="flex items-center gap-3 rounded-lg bg-muted/50 px-4 py-3 text-sm">
                  <Clock className="h-5 w-5 text-amber-600 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">
                      სამუშაო საათები
                    </p>
                    <p className="font-medium">{service.operating_hours}</p>
                  </div>
                </div>
              )}
              {service.has_delivery && (
                <div className="flex items-center gap-3 rounded-lg bg-green-50 px-4 py-3 text-sm">
                  <Truck className="h-5 w-5 text-green-600 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">მიტანა</p>
                    <p className="font-medium text-green-700">ხელმისაწვდომია</p>
                  </div>
                </div>
              )}
              {service.cuisine_type && (
                <div className="flex items-center gap-3 rounded-lg bg-muted/50 px-4 py-3 text-sm">
                  <ChefHat className="h-5 w-5 text-amber-600 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">სამზარეულო</p>
                    <p className="font-medium">{service.cuisine_type}</p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>

          {/* Description */}
          {service.description && (
            <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.25 }}>
              <h2 className="mb-3 text-lg font-black text-[#1E293B]">აღწერა</h2>
              <p className="leading-relaxed text-muted-foreground whitespace-pre-line">
                {service.description}
              </p>
            </motion.div>
          )}

          {/* Menu */}
          {menuItems.length > 0 && (
            <motion.div {...fadeIn} transition={{ duration: 0.4, delay: 0.3 }}>
              <h2 className="mb-4 flex items-center gap-2 text-lg font-black text-[#1E293B]">
                <UtensilsCrossed className="h-5 w-5" />
                მენიუ
              </h2>
              <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
                {menuItems.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
                  >
                    <div>
                      <p className="font-medium text-foreground">{item.name}</p>
                      {item.description && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {item.description}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 font-semibold text-foreground">
                      {formatPrice(item.price)}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>

        {/* Sidebar */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <div className="sticky top-24 space-y-4">
            <div className="rounded-3xl border border-[#EEF1F4] bg-white p-8 shadow-[0px_20px_48px_rgba(0,0,0,0.06)]">
              {/* Price */}
              {service.price != null && (
                <div className="mb-4">
                  <span className="text-2xl font-bold text-foreground">
                    {formatPrice(service.price)}
                  </span>
                  {service.price_unit && (
                    <span className="text-sm text-muted-foreground">
                      {" "}
                      / {service.price_unit}
                    </span>
                  )}
                </div>
              )}

              {service.discount_percent > 0 && (
                <div className="mb-4 rounded-lg bg-red-50 p-2 text-center text-sm font-semibold text-red-600">
                  -{service.discount_percent}% ფასდაკლება
                </div>
              )}

              {/* Delivery badge */}
              {service.has_delivery && (
                <div className="mb-4 flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
                  <Truck className="h-4 w-4" />
                  მიტანის სერვისი ხელმისაწვდომია
                </div>
              )}

              {/* Operating hours */}
              {service.operating_hours && (
                <div className="mb-4 flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>{service.operating_hours}</span>
                </div>
              )}

              <div className="my-4 border-t border-border" />

              {/* Owner */}
              <div className="mb-4 flex items-center gap-3">
                <div className="relative size-10 shrink-0 overflow-hidden rounded-full bg-muted">
                  {owner?.avatar_url ? (
                    <Image
                      src={owner.avatar_url}
                      alt={owner.display_name}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-sm font-medium text-muted-foreground">
                      {owner?.display_name?.charAt(0) ?? "კ"}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {owner?.display_name ?? "რესტორანი"}
                  </p>
                  {owner?.is_verified && (
                    <div className="flex items-center gap-1 text-xs text-brand-accent">
                      <BadgeCheck className="size-3.5" />
                      ვერიფიცირებული
                    </div>
                  )}
                </div>
              </div>

              <Button
                onClick={() => router.push("/auth/login")}
                className="h-12 w-full gap-2 rounded-[14px] bg-amber-600 text-[13px] font-bold text-white hover:bg-amber-700"
              >
                <Phone className="h-4 w-4" />
                შეკვეთა
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
