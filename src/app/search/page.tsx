import { createClient } from "@/lib/supabase/server";
import SearchPageClient from "./SearchPageClient";

export const metadata = {
  title: "MyBakuriani — ძებნა",
  description: "მოძებნეთ აპარტამენტები, სასტუმროები და სერვისები ბაკურიანში.",
};

interface SearchPageProps {
  searchParams: Promise<{
    location?: string;
    check_in?: string;
    check_out?: string;
    guests?: string;
    cadastral?: string;
    mode?: string;
  }>;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const supabase = await createClient();

  const { data: properties } = await supabase
    .from("properties")
    .select("*")
    .eq("status", "active")
    .order("is_super_vip", { ascending: false })
    .order("is_vip", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <SearchPageClient
      initialProperties={properties ?? []}
      initialLocation={params.location ?? ""}
      initialCheckIn={params.check_in ?? ""}
      initialCheckOut={params.check_out ?? ""}
      initialGuests={params.guests ? Number(params.guests) : ""}
      initialCadastral={params.cadastral ?? ""}
      initialMode={(params.mode as "rent" | "sale") ?? "rent"}
    />
  );
}
