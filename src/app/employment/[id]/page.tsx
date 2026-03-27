import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EmploymentDetailClient from "./EmploymentDetailClient";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("services")
    .select("title, description, position")
    .eq("id", id)
    .single();

  if (!data) {
    return { title: "ვაკანსია ვერ მოიძებნა — MyBakuriani" };
  }

  return {
    title: `${data.title} — ვაკანსია ბაკურიანში | MyBakuriani`,
    description: data.description ?? `${data.title} — ვაკანსია ბაკურიანში`,
  };
}

export default async function EmploymentDetailPage({ params }: Props) {
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

    return <EmploymentDetailClient service={service} />;
  } catch {
    notFound();
  }
}
