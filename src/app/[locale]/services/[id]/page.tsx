import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ServiceDetailClient from "./ServiceDetailClient";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("services")
    .select("title, description, category")
    .eq("id", id)
    .single();

  if (!data) {
    return { title: "სერვისი ვერ მოიძებნა — MyBakuriani" };
  }

  return {
    title: `${data.title} — სერვისი ბაკურიანში | MyBakuriani`,
    description: data.description ?? `${data.title} — სერვისი ბაკურიანში`,
  };
}

export default async function ServiceDetailPage({ params }: Props) {
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

    return <ServiceDetailClient service={service} />;
  } catch {
    notFound();
  }
}
