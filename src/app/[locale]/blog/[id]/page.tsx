import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { cache } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { routing, type AppLocale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { createPublicClient } from "@/lib/supabase/server";
import { buildListingMetadata } from "@/lib/seo";
import { pathForLocale } from "@/lib/seo/alternates";
import { formatDate } from "@/lib/utils/format";
import { isUuid } from "@/lib/utils/uuid";
import BannerSlot from "@/components/banners/BannerSlot";

interface Props {
  // The segment is the post's slug (canonical). The older uuid links still
  // resolve and 308 to the slug URL (C40), so shared links keep working.
  params: Promise<{ locale: AppLocale; id: string }>;
}

export const revalidate = 120;

// ISR: rendered on first request, then cached/revalidated (dynamicParams=true).
export async function generateStaticParams() {
  return [];
}

// Slugs are Georgian script, which can reach the route percent-encoded.
function decodeKey(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

// A uuid segment is an old link; anything else is looked up by slug. Never
// compare a non-uuid against the uuid column: Postgres rejects it (22P02).
const lookupColumn = (key: string) => (isUuid(key) ? "id" : "slug");

const getBlogPostMetadata = cache(async (key: string) => {
  const supabase = createPublicClient();
  return supabase
    .from("blog_posts")
    .select("slug, title, excerpt, image_url")
    .eq(lookupColumn(key), key)
    .eq("published", true)
    .maybeSingle();
});

const getBlogPostDetail = cache(async (key: string) => {
  const supabase = createPublicClient();
  return supabase
    .from("blog_posts")
    .select("*, profiles!blog_posts_author_id_fkey(display_name, avatar_url)")
    .eq(lookupColumn(key), key)
    .eq("published", true)
    .maybeSingle();
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  const { data, error } = await getBlogPostMetadata(decodeKey(id));
  // A failed read must fail the render (uncached), not be cached as a
  // not-found title for the next 120 s.
  if (error) throw error;

  if (!data) {
    return { title: t("detail.blogNotFound") };
  }

  const title = t("detail.blogTitle", { title: data.title });
  const description = data.excerpt?.trim() || data.title;

  return {
    title,
    description,
    ...buildListingMetadata({
      locale,
      title,
      description,
      images: [data.image_url],
      path: `/blog/${data.slug}`,
      type: "article",
    }),
  };
}

export default async function BlogDetailPage({ params }: Props) {
  const { id } = await params;
  const key = decodeKey(id);
  const t = await getTranslations("BlogPage");
  const locale = await getLocale();

  const { data: post, error } = await getBlogPostDetail(key);
  // Errors propagate (uncached 500) instead of becoming a cacheable 404.
  if (error) throw error;

  if (!post) {
    notFound();
  }

  if (isUuid(key)) {
    // A Location header must be ASCII: the slug is Georgian script, so it is
    // percent-encoded here (a raw one made Node throw and the route answer 500).
    permanentRedirect(
      pathForLocale(
        `/blog/${encodeURIComponent(post.slug)}`,
        locale,
        routing.defaultLocale,
      ),
    );
  }

  const author = post.profiles as {
    display_name: string;
    avatar_url: string | null;
  } | null;

  return (
    <article className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      {/* Back link */}
      <Link
        href="/blog"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-[#64748B] transition-colors hover:text-[#1E293B]"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("backToBlog")}
      </Link>

      {/* Title */}
      <h1 className="text-[28px] font-black leading-[34px] text-[#1E293B] sm:text-[34px] sm:leading-[42px]">
        {post.title}
      </h1>

      {/* Meta */}
      <div className="mt-4 flex items-center gap-3 text-sm text-[#64748B]">
        {post.published_at && (
          <time dateTime={post.published_at}>
            {formatDate(post.published_at, locale)}
          </time>
        )}
        {author && (
          <>
            <span>·</span>
            <span>{author.display_name}</span>
          </>
        )}
      </div>

      {/* Featured image */}
      {post.image_url && (
        <div className="relative mt-8 aspect-[8/5] overflow-hidden rounded-[20px]">
          <Image
            src={post.image_url}
            alt={post.title}
            fill
            sizes="(max-width: 768px) 100vw, 768px"
            className="object-cover"
            priority
          />
        </div>
      )}

      {/* Content */}
      <div className="prose prose-slate mt-8 max-w-none">
        <div className="whitespace-pre-line text-[15px] font-medium leading-[27px] text-[#475569]">
          {post.content}
        </div>
      </div>

      <BannerSlot placement="blog_inline" bare className="mt-10" />
    </article>
  );
}
