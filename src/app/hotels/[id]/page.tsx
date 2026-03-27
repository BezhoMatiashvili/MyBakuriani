import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import HotelDetailClient from "./HotelDetailClient";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("properties")
    .select("title, location, description")
    .eq("id", id)
    .single();

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
  const supabase = await createClient();

  try {
    const { data: property } = await supabase
      .from("properties")
      .select("*, profiles!properties_owner_id_fkey(*)")
      .eq("id", id)
      .eq("status", "active")
      .single();

    if (!property) {
      notFound();
    }

    const { data: reviews } = await supabase
      .from("reviews")
      .select("*, profiles!reviews_guest_id_fkey(display_name)")
      .eq("property_id", id)
      .order("created_at", { ascending: false })
      .limit(20);

    const today = new Date();
    const threeMonthsLater = new Date(today);
    threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

    const { data: calendarBlocks } = await supabase
      .from("calendar_blocks")
      .select("date, status")
      .eq("property_id", id)
      .gte("date", today.toISOString().split("T")[0])
      .lte("date", threeMonthsLater.toISOString().split("T")[0]);

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
