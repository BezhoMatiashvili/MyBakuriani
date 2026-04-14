import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import HotelsPageClient from "./HotelsPageClient";

export const metadata: Metadata = {
  title: "სასტუმროები — MyBakuriani",
  description:
    "ბაკურიანის საუკეთესო სასტუმროები ერთ სივრცეში. შეადარეთ ფასები, ნახეთ შეფასებები და დაჯავშნეთ ონლაინ.",
};

export default async function HotelsPage() {
  const supabase = await createClient();

  const { data: properties, error } = await supabase
    .from("properties")
    .select("*")
    .eq("status", "active")
    .eq("is_for_sale", false)
    .eq("type", "hotel")
    .order("is_super_vip", { ascending: false })
    .order("is_vip", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[hotels] failed to load properties", error.message);
  }

  return <HotelsPageClient properties={properties ?? []} />;
}
