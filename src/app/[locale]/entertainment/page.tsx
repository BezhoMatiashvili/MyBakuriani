import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import EntertainmentPageClient from "./EntertainmentPageClient";

export const metadata: Metadata = {
  title: "გართობა და აქტივობები — MyBakuriani",
  description:
    "ბაკურიანში გართობა და აქტივობები: სათხილამურო გაკვეთილები, ცხენებით სეირნობა, SPA, საბავშვო ზონები და სხვა.",
};

export default async function EntertainmentPage() {
  const supabase = await createClient();

  const { data: services, error } = await supabase
    .from("services")
    .select("*")
    .eq("status", "active")
    .eq("category", "entertainment")
    .order("is_vip", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[entertainment] failed to load services", error.message);
  }

  return <EntertainmentPageClient services={services ?? []} />;
}
