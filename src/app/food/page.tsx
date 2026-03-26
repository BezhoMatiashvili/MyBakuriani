import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import FoodPageClient from "./FoodPageClient";

export const metadata: Metadata = {
  title: "კვება & რესტორნები — MyBakuriani",
  description:
    "ბაკურიანის საუკეთესო რესტორნები, კაფეები და კვების სერვისები. ქართული სამზარეულო, პიცერიები და მიტანის სერვისი.",
};

export default async function FoodPage() {
  const supabase = await createClient();

  const { data: services } = await supabase
    .from("services")
    .select("*")
    .eq("status", "active")
    .eq("category", "food")
    .order("is_vip", { ascending: false })
    .order("created_at", { ascending: false });

  return <FoodPageClient services={services ?? []} />;
}
