import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SaleDetailClient from "./SaleDetailClient";

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

  const { data: reviews } = await supabase
    .from("reviews")
    .select("*, profiles!reviews_guest_id_fkey(display_name)")
    .eq("property_id", id)
    .order("created_at", { ascending: false })
    .limit(20);

  return <SaleDetailClient property={property} reviews={reviews ?? []} />;
}
