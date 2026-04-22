"use client";

import { motion } from "framer-motion";
import { Heart, MapPin } from "lucide-react";
import Image from "next/image";
import { Link } from "@/i18n/navigation";

interface SalePropertyCardProps {
  id: string;
  title: string;
  location: string;
  photos: string[];
  priceUsd: number;
  area?: number | null;
  rooms?: number | null;
  isVip?: boolean;
}

function formatUsd(n: number): string {
  return `$${n.toLocaleString("en-US")}`;
}

export default function SalePropertyCard({
  id,
  title,
  location,
  photos,
  priceUsd,
  area,
  rooms,
  isVip,
}: SalePropertyCardProps) {
  const href = `/sales/${id}`;
  const photoUrl = photos[0] ?? "/placeholder-property.jpg";

  const tags: string[] = [];
  if (area) tags.push(`${area} კმ²`);
  if (rooms) tags.push(`${rooms}-ოთახიანი`);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ scale: 1.02 }}
      className="group h-full"
    >
      <Link
        href={href}
        className="flex h-[400px] flex-col overflow-hidden rounded-[20px] border border-[#E7EEE9] bg-white shadow-[0px_4px_16px_-2px_rgba(15,61,46,0.08)] transition-shadow hover:shadow-[0px_12px_28px_-6px_rgba(15,61,46,0.18)]"
      >
        <div className="relative aspect-[4/3] overflow-hidden">
          <Image
            src={photoUrl}
            alt={title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-110"
          />

          <span className="absolute left-3 top-3 rounded-full bg-[#16A34A] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.5px] text-white shadow-[0px_1px_2px_rgba(0,0,0,0.12)]">
            იყიდება
          </span>

          {isVip && (
            <span className="absolute left-3 top-12 rounded-[4px] bg-[#F97316] px-2 py-1 text-[10px] font-black uppercase text-white shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
              VIP
            </span>
          )}

          <button
            type="button"
            onClick={(e) => e.preventDefault()}
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#94A3B8] shadow-[0px_1px_2px_rgba(0,0,0,0.1)] transition-colors hover:text-[#16A34A]"
            aria-label="favorite"
          >
            <Heart className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-1 flex-col p-5">
          <p className="flex items-center gap-1 text-[11px] font-bold leading-[16px] text-[#94A3B8]">
            <MapPin className="h-[11px] w-[11px] text-[#CBD5E1]" />
            {location}
          </p>
          <h3 className="mt-1 line-clamp-2 text-[16px] font-black leading-[20px] text-[#1E293B]">
            {title}
          </h3>

          {tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-[#E2E8F0] px-2.5 py-1 text-[11px] font-bold text-[#475569]"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className="mt-auto flex items-end justify-between pt-4">
            <span className="whitespace-nowrap text-[22px] font-black leading-[28px] text-[#16A34A]">
              {formatUsd(priceUsd)}
            </span>
            <span className="rounded-[10px] bg-[#16A34A] px-4 py-2 text-[12px] font-bold text-white transition-colors hover:bg-[#15803D]">
              დეტალები
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
