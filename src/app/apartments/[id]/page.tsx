import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ApartmentDetailClient from "./ApartmentDetailClient";

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
    return { title: "ბინა ვერ მოიძებნა — MyBakuriani" };
  }

  return {
    title: `${data.title} — ბაკურიანი | MyBakuriani`,
    description:
      data.description ??
      `${data.title} — გაქირავება ბაკურიანში, ${data.location}`,
  };
}

export default async function ApartmentDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: property } = await supabase
    .from("properties")
    .select("*, profiles!properties_owner_id_fkey(*)")
    .eq("id", id)
    .eq("status", "active")
    .single();

  if (!property) {
    notFound();
  }

  // Fetch reviews with guest profiles
  const { data: reviews } = await supabase
    .from("reviews")
    .select("*, profiles!reviews_guest_id_fkey(display_name)")
    .eq("property_id", id)
    .order("created_at", { ascending: false })
    .limit(20);

  // Fetch calendar blocks for next 3 months
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
    <ApartmentDetailClient
      property={property}
      reviews={reviews ?? []}
      calendarBlocks={calendarBlocks ?? []}
    />
  );
}
