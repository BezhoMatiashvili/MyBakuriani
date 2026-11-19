import { createPublicClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/i18n/routing";
import { buildPageMetadata } from "@/lib/seo";
import { localizeBlogPost } from "@/lib/blog/translations";
import Breadcrumbs from "@/components/seo/Breadcrumbs";
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

export default async function BlogPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  const tFooter = await getTranslations({ locale, namespace: "Footer" });
  const supabase = createPublicClient();

  // Only what the grid renders reaches the client: the texts of every
  // language are read so the server picks the visitor's (C60), then the
  // bodies and the other languages are dropped (up to 100 full posts).
  const { data: rows, error } = await supabase
    .from("blog_posts")
    .select(
      "id, slug, title, excerpt, content, title_en, excerpt_en, content_en, title_ru, excerpt_ru, content_ru, image_url, published_at, created_at",
    )
    .eq("published", true)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;
  const posts = (rows ?? []).map((row) => {
    const { title, excerpt } = localizeBlogPost(row, locale);
    return {
      id: row.id,
      slug: row.slug,
      title,
      excerpt,
      image_url: row.image_url,
      published_at: row.published_at,
      created_at: row.created_at,
    };
  });

  return (
    <>
      <Breadcrumbs
        locale={locale}
        items={[{ name: tFooter("blog"), path: "/blog" }]}
      />
      <BlogPageClient posts={posts} />
    </>
  );
}
