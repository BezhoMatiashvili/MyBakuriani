import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSmsFeatureEnabled } from "@/lib/sms/feature-flags";
import { SellerPriceDropClient } from "./SellerPriceDropClient";

export default async function SellerPriceDropPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  if (!isSmsFeatureEnabled("SMS_PRICE_DROP_MODE", user.id)) redirect("/dashboard/seller");
  const { count } = await supabase.from("properties").select("id", { count: "exact", head: true }).eq("owner_id", user.id).eq("is_for_sale", true).is("organization_id", null);
  if ((count ?? 0) === 0) redirect("/dashboard/seller");
  return <SellerPriceDropClient />;
}
