import { createPublicClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { buildPageMetadata } from "@/lib/seo";
import BlogPageClient from "./BlogPageClient";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return buildPageMetadata({
    locale,
    path: "/blog",
    title: t("blog"),
    description: t("blogDesc"),
  });
}

export default async function BlogPage() {
  const supabase = createPublicClient();

  // Only what the grid renders: the article body (`content`) and the other
  // columns never reach the client (up to 100 full posts otherwise).
  const { data: posts, error } = await supabase
    .from("blog_posts")
    .select("id, slug, title, excerpt, image_url, published_at, created_at")
    .eq("published", true)
    .order("published_at", { ascending: false })
    .limit(100);

  if (error) throw error;

  return <BlogPageClient posts={posts ?? []} />;
}
