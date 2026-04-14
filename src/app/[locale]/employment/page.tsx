import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import EmploymentPageClient from "./EmploymentPageClient";

export const metadata: Metadata = {
  title: "დასაქმება ბაკურიანში — MyBakuriani",
  description:
    "იპოვეთ სამუშაო ბაკურიანში: მზარეული, ადმინისტრატორი, დამლაგებელი, მძღოლი და სხვა ვაკანსიები.",
};

export default async function EmploymentPage() {
  const supabase = await createClient();

  const { data: services, error } = await supabase
    .from("services")
    .select("*")
    .eq("status", "active")
    .eq("category", "employment")
    .order("is_vip", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[employment] failed to load services", error.message);
  }

  return <EmploymentPageClient services={services ?? []} />;
}
