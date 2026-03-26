import { createClient } from "@/lib/supabase/server";
import LandingPage from "@/app/_landing/LandingPage";

export const metadata = {
  title: "MyBakuriani — ყველაზე სანდო გზამკვლევი ბაკურიანში",
  description:
    "პრემიუმ უძრავი ქონების და გაქირავების პლატფორმა ბაკურიანში. მხოლოდ ვერიფიცირებული და სანდო მესაკუთრეები.",
};

export default async function Home() {
  const supabase = await createClient();

  // Fetch hot offers (VIP properties first)
  const { data: hotOffers } = await supabase
    .from("properties")
    .select("*")
    .eq("status", "active")
    .eq("is_for_sale", false)
    .order("is_super_vip", { ascending: false })
    .order("is_vip", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(8);

  // Fetch hotels
  const { data: hotels } = await supabase
    .from("properties")
    .select("*")
    .eq("status", "active")
    .eq("type", "hotel")
    .order("is_vip", { ascending: false })
    .limit(4);

  // Fetch sale properties
  const { data: saleProperties } = await supabase
    .from("properties")
    .select("*")
    .eq("status", "active")
    .eq("is_for_sale", true)
    .order("is_vip", { ascending: false })
    .limit(4);

  // Fetch services by category
  const { data: services } = await supabase
    .from("services")
    .select("*")
    .eq("status", "active")
    .order("is_vip", { ascending: false })
    .limit(20);

  // Fetch recent blog posts
  const { data: blogPosts } = await supabase
    .from("blog_posts")
    .select("*")
    .eq("published", true)
    .order("published_at", { ascending: false })
    .limit(3);

  return (
    <LandingPage
      hotOffers={hotOffers ?? []}
      hotels={hotels ?? []}
      saleProperties={saleProperties ?? []}
      services={services ?? []}
      blogPosts={blogPosts ?? []}
    />
  );
}
