import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import FoodDetailClient from "./FoodDetailClient";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("services")
    .select("title, description, cuisine_type")
    .eq("id", id)
    .single();

  if (!data) {
    return { title: "კვება ვერ მოიძებნა — MyBakuriani" };
  }

  return {
    title: `${data.title} — კვება ბაკურიანში | MyBakuriani`,
    description: data.description ?? `${data.title} — კვება ბაკურიანში`,
  };
}

export default async function FoodDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: service } = await supabase
    .from("services")
    .select("*, profiles!services_owner_id_fkey(*)")
    .eq("id", id)
    .eq("status", "active")
    .single();

  if (!service) {
    notFound();
  }

  return <FoodDetailClient service={service} />;
}
