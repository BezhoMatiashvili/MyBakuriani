import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase/server";
import {
  getPropertyById,
  getPropertyMetadataById,
} from "@/lib/data/getPropertyById";
import SaleDetailClient from "./SaleDetailClient";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const data = await getPropertyMetadataById(id);

  if (!data) {
    return { title: "ქონება ვერ მოიძებნა — MyBakuriani" };
  }

  return {
    title: `${data.title} — გასაყიდი ბაკურიანში | MyBakuriani`,
    description:
      data.description ??
      `${data.title} — გასაყიდი ქონება ბაკურიანში, ${data.location}`,
  };
}

export default async function SaleDetailPage({ params }: Props) {
  const { id } = await params;
  const { data: property, isMock } = await getPropertyById(id);

  if (!property) {
    notFound();
  }

  if (isMock) {
    return <SaleDetailClient property={property} reviews={[]} />;
  }

  const supabase = createPublicClient();
  const { data: reviews } = await supabase
    .from("reviews")
    .select("*, profiles!reviews_guest_id_fkey(display_name)")
    .eq("property_id", id)
    .order("created_at", { ascending: false })
    .limit(20);

  return <SaleDetailClient property={property} reviews={reviews ?? []} />;
}
