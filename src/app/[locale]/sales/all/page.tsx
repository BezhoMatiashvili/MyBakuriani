import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import SalesGridClient from "./SalesGridClient";

export const metadata: Metadata = {
  title: "იყიდება ბინები ბაკურიანში — MyBakuriani",
  description:
    "გასაყიდი უძრავი ქონება ბაკურიანში. საინვესტიციო ობიექტები, ROI მონაცემები და ვერიფიცირებული განცხადებები.",
};

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function toCsv(value: string | string[] | undefined): string[] | undefined {
  if (typeof value !== "string" || !value) return undefined;
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export default async function SalesGridPage({ searchParams }: Props) {
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: properties, error } = await supabase
    .from("properties")
    .select("*")
    .eq("status", "active")
    .eq("is_for_sale", true)
    .order("is_super_vip", { ascending: false })
    .order("is_vip", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[sales/all] failed to load properties", error.message);
  }

  const initialType = typeof sp.type === "string" ? sp.type : undefined;
  const initialLocation =
    typeof sp.location === "string" ? sp.location : undefined;
  const initialPriceMin =
    typeof sp.price_min === "string" ? Number(sp.price_min) : undefined;
  const initialPriceMax =
    typeof sp.price_max === "string" ? Number(sp.price_max) : undefined;
  const initialAreaMin =
    typeof sp.area_min === "string" ? Number(sp.area_min) : undefined;
  const initialAreaMax =
    typeof sp.area_max === "string" ? Number(sp.area_max) : undefined;
  const initialCadastral =
    typeof sp.cadastral === "string" ? sp.cadastral : undefined;

  return (
    <SalesGridClient
      properties={properties ?? []}
      initialType={initialType}
      initialTypes={toCsv(sp.types)}
      initialLocation={initialLocation}
      initialPriceMin={initialPriceMin}
      initialPriceMax={initialPriceMax}
      initialAreaMin={initialAreaMin}
      initialAreaMax={initialAreaMax}
      initialCadastral={initialCadastral}
      initialStatuses={toCsv(sp.status)}
      initialRooms={toCsv(sp.rooms)
        ?.map(Number)
        .filter((n) => !isNaN(n))}
      initialAmenities={toCsv(sp.amenities)}
      initialPayment={toCsv(sp.payment)}
      initialDevelopers={toCsv(sp.developer)}
    />
  );
}
