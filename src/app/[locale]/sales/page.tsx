import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import SalesPageClient from "./SalesPageClient";

export const metadata: Metadata = {
  title: "ყიდვა-გაყიდვა — MyBakuriani",
  description:
    "იყიდეთ უძრავი ქონება ბაკურიანში. საინვესტიციო ობიექტები, ROI მონაცემები და ვერიფიცირებული განცხადებები.",
};

export default async function SalesPage() {
  const supabase = await createClient();

  const { data: properties, error } = await supabase
    .from("properties")
    .select("*")
    .eq("status", "active")
    .eq("is_for_sale", true)
    .order("is_super_vip", { ascending: false })
    .order("is_vip", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[sales] failed to load properties", error.message);
  }

  return <SalesPageClient properties={properties ?? []} />;
}
