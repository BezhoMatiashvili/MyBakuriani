"use client";

import { useRouter } from "next/navigation";
import { ExternalLink, MapPin } from "lucide-react";
import { CallButton } from "@/components/shared/CallButton";
import { trackMenuOpen } from "@/lib/menu-tracking";

interface Props {
  phone: string | null;
  menuUrl: string | null;
  location: string | null;
  serviceId?: string | null;
}

export function FoodContactCard({
  phone,
  menuUrl,
  location,
  serviceId,
}: Props) {
  const router = useRouter();

  const mapsHref = location
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${location} ბაკურიანი`,
      )}`
    : null;

  return (
    <div className="rounded-[20px] border border-[#E2E8F0] bg-white p-6">
      <h3 className="mb-4 text-[16px] font-bold text-[#1E293B]">
        კონტაქტი და ქმედებები
      </h3>

      <div className="space-y-3">
        {menuUrl && (
          <a
            href={menuUrl}
            target="_blank"
            rel="noreferrer"
            onClick={() => trackMenuOpen(serviceId)}
            className="flex h-[55px] w-full items-center justify-center gap-2 rounded-2xl border border-[#E2E8F0] bg-white text-[14px] font-bold text-[#1E293B] transition-colors hover:bg-[#F8FAFC]"
          >
            <ExternalLink className="h-4 w-4" />
            მენიუ • URL მენიუ
          </a>
        )}

        {mapsHref && (
          <a
            href={mapsHref}
            target="_blank"
            rel="noreferrer"
            className="flex h-[55px] w-full items-center justify-center gap-2 rounded-2xl border border-[#E2E8F0] bg-white text-[14px] font-bold text-[#1E293B] transition-colors hover:bg-[#F8FAFC]"
          >
            <MapPin className="h-4 w-4" />
            ლოკაციის ნახვა
          </a>
        )}

        <CallButton
          phone={phone}
          label="დაკავშირება"
          className="h-[55px] w-full gap-2 rounded-2xl bg-[#10B981] text-[15px] font-bold text-white hover:bg-[#059669]"
          onNoPhoneClick={() => router.push("/auth/login")}
          serviceId={serviceId}
        />
      </div>
    </div>
  );
}
