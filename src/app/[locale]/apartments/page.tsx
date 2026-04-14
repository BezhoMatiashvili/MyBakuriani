import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import ApartmentsPageClient from "./ApartmentsPageClient";

export const metadata: Metadata = {
  title: "აპარტამენტები და კოტეჯები — MyBakuriani",
  description:
    "იპოვეთ საუკეთესო აპარტამენტები და კოტეჯები ბაკურიანში. ვერიფიცირებული მესაკუთრეები, რეალური ფოტოები და სამართლიანი ფასები.",
};

export default async function ApartmentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let query = supabase
    .from("properties")
    .select("*")
    .eq("is_for_sale", false)
    .in("type", ["apartment", "cottage", "villa", "studio"])
    .order("is_super_vip", { ascending: false })
    .order("is_vip", { ascending: false })
    .order("created_at", { ascending: false });

  if (user) {
    query = query.or(
      `status.eq.active,and(status.eq.pending,owner_id.eq.${user.id})`,
    );
  } else {
    query = query.eq("status", "active");
  }

  const { data: properties, error } = await query;

  if (error) {
    console.error("[apartments] failed to load properties", error.message);
  }

  return <ApartmentsPageClient properties={properties ?? []} />;
}
