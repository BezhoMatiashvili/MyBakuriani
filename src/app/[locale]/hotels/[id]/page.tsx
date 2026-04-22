import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/server";
import HotelDetailClient from "./HotelDetailClient";

interface Props {
  params: Promise<{ id: string }>;
}

export const revalidate = 120;

const getHotelMetadata = cache(async (id: string) => {
  const supabase = createPublicClient();
  return supabase
    .from("properties")
    .select("title, location, description")
    .eq("id", id)
    .single();
});

const getHotelDetail = cache(async (id: string) => {
  const supabase = createPublicClient();
  return supabase
    .from("properties")
    .select("*, profiles!properties_owner_id_fkey(*)")
    .eq("id", id)
    .eq("status", "active")
    .single();
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const { data } = await getHotelMetadata(id);

  if (!data) {
    return { title: "სასტუმრო ვერ მოიძებნა — MyBakuriani" };
  }

  return {
    title: `${data.title} — სასტუმრო ბაკურიანში | MyBakuriani`,
    description:
      data.description ??
      `${data.title} — სასტუმრო ბაკურიანში, ${data.location}`,
  };
}

export default async function HotelDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = createPublicClient();

  try {
    const { data: property } = await getHotelDetail(id);

    if (!property) {
      notFound();
    }

    // Fetch reviews and calendar blocks in parallel to reduce detail page TTFB.
    const today = new Date();
    const threeMonthsLater = new Date(today);
    threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

    const [{ data: reviews }, { data: calendarBlocks }] = await Promise.all([
      supabase
        .from("reviews")
        .select("*, profiles!reviews_guest_id_fkey(display_name)")
        .eq("property_id", id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("calendar_blocks")
        .select("date, status")
        .eq("property_id", id)
        .gte("date", today.toISOString().split("T")[0])
        .lte("date", threeMonthsLater.toISOString().split("T")[0]),
    ]);

    return (
      <HotelDetailClient
        property={property}
        reviews={reviews ?? []}
        calendarBlocks={calendarBlocks ?? []}
      />
    );
  } catch {
    notFound();
  }
}
