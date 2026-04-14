import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TransportDetailClient from "./TransportDetailClient";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("services")
    .select("title, description, route")
    .eq("id", id)
    .single();

  if (!data) {
    return { title: "ტრანსპორტი ვერ მოიძებნა — MyBakuriani" };
  }

  return {
    title: `${data.title} — ტრანსპორტი ბაკურიანში | MyBakuriani`,
    description: data.description ?? `${data.title} — ტრანსპორტი ბაკურიანში`,
  };
}

export default async function TransportDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  try {
    const { data: service } = await supabase
      .from("services")
      .select("*, profiles!services_owner_id_fkey(*)")
      .eq("id", id)
      .eq("status", "active")
      .single();

    if (!service) {
      notFound();
    }

    return <TransportDetailClient service={service} />;
  } catch {
    notFound();
  }
}
