import { createClient } from "@/lib/supabase/server";
import SearchPageClient from "./SearchPageClient";

export const metadata = {
  title: "MyBakuriani — ძებნა",
  description: "მოძებნეთ აპარტამენტები, სასტუმროები და სერვისები ბაკურიანში.",
};

export default async function SearchPage() {
  const supabase = await createClient();

  const { data: properties } = await supabase
    .from("properties")
    .select("*")
    .eq("status", "active")
    .order("is_super_vip", { ascending: false })
    .order("is_vip", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  return <SearchPageClient initialProperties={properties ?? []} />;
}
