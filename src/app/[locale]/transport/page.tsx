import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import TransportPageClient from "./TransportPageClient";

export const metadata: Metadata = {
  title: "ტრანსპორტი და ტრანსფერები — MyBakuriani",
  description:
    "ტრანსფერი ბაკურიანში თბილისიდან, ჯიპ-ტურები, სათხილამურო ტრანსფერი და სხვა სატრანსპორტო მომსახურება.",
};

export default async function TransportPage() {
  const supabase = await createClient();

  const { data: services, error } = await supabase
    .from("services")
    .select("*")
    .eq("status", "active")
    .eq("category", "transport")
    .order("is_vip", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[transport] failed to load services", error.message);
  }

  return <TransportPageClient services={services ?? []} />;
}
