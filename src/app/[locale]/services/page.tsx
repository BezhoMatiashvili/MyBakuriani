import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import ServicesPageClient from "./ServicesPageClient";

export const metadata: Metadata = {
  title: "სერვისები და ხელოსნები — MyBakuriani",
  description:
    "ბაკურიანში სერვისები და ხელოსნები: სანტექნიკა, ელექტრიკი, დალაგება, რემონტი და სხვა პროფესიონალური მომსახურება.",
};

export default async function ServicesPage() {
  const supabase = await createClient();

  const { data: services, error } = await supabase
    .from("services")
    .select("*")
    .eq("status", "active")
    .in("category", ["handyman", "cleaning"])
    .order("is_vip", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[services] failed to load services", error.message);
  }

  return <ServicesPageClient services={services ?? []} />;
}
