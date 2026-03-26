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

  const { data: services } = await supabase
    .from("services")
    .select("*")
    .eq("status", "active")
    .eq("category", "employment")
    .order("is_vip", { ascending: false })
    .order("created_at", { ascending: false });

  return <EmploymentPageClient services={services ?? []} />;
}
