import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, Share2 } from "lucide-react";
import { cache } from "react";
import { getTranslations } from "next-intl/server";
import { routing, type AppLocale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { blogSlugToken, isLatinSlug } from "@/lib/blog-slug";
import { createPublicClient } from "@/lib/supabase/server";
import { buildListingMetadata } from "@/lib/seo";
import { pathForLocale } from "@/lib/seo/alternates";
import { formatDate } from "@/lib/utils/format";
import { isUuid } from "@/lib/utils/uuid";
import BannerSlot from "@/components/banners/BannerSlot";
import Breadcrumbs from "@/components/seo/Breadcrumbs";
import JsonLd from "@/components/seo/JsonLd";
import { ShareMenu } from "@/components/shared/ShareMenu";
import { optimizedImageUrls } from "@/lib/seo/image-url";
import { blogPostingJsonLd } from "@/lib/seo/jsonld";
import { SITE_LOGO_PATH, SITE_NAME, SITE_URL } from "@/lib/seo/site";
import { sanitizePhotos } from "@/lib/utils/photos";

interface Props {
  // The segment is the post's slug (canonical). Older links, the uuid and the
  // Georgian slug a post had before its Latin one, still resolve and 308 to
  // the slug URL (C40), so shared links keep working.
  params: Promise<{ locale: AppLocale; id: string }>;
}

export const revalidate = 120;

// ISR: rendered on first request, then cached/revalidated (dynamicParams=true).
export async function generateStaticParams() {
  return [];
}

// Old slugs are Georgian script, which can reach the route percent-encoded.
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

// One lookup for metadata and page (C40): the post's slug, or its id for an
// old uuid link; failing both, the 8-character token every slug ends in, which
// also finds a post by the Georgian slug it had before its Latin one. A token
// match counts only as the single published post, and only with a Latin slug:
// a Latin link opened before scripts/blog-latin-slugs.mjs ran then 404s
// instead of caching a 308 to the Georgian slug, which would loop once the
// script ran. A failed read throws (an uncached 500), never a cacheable 404.
const getPublishedPost = cache(async (key: string) => {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("blog_posts")
    .select("*")
    .eq(lookupColumn(key), key)
    .eq("published", true)
    .maybeSingle();
  if (error) throw error;
  if (data || isUuid(key)) return data;

  const token = blogSlugToken(key);
  if (!token) return null;
  const { data: matches, error: tokenError } = await supabase
    .from("blog_posts")
    .select("*")
    .like("slug", `%-${token}`)
    .eq("published", true)
    .limit(2);
  if (tokenError) throw tokenError;
  return matches.length === 1 && isLatinSlug(matches[0].slug)
    ? matches[0]
    : null;
});

// The optimizer URL without its origin: buildListingMetadata keeps only
// relative paths and Storage URLs, and metadataBase makes it absolute again.
function sameOriginPath(href: string): string {
  const url = new URL(href);
  return `${url.pathname}${url.search}`;
}

// Both share buttons: a pill like the service pages' one, but 44 px tall.
const SHARE_PILL =
  "flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-[#E2E8F0] bg-white px-4 text-[13px] font-bold text-[#64748B] transition-colors hover:bg-[#F8FAFC]";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  // A failed read throws: the render fails (uncached) instead of caching a
  // not-found title for the next 120 s.
  const post = await getPublishedPost(decodeKey(id));

  if (!post) {
    return { title: t("detail.blogNotFound") };
  }

  const title = t("detail.blogTitle", { title: post.title });
  const description = post.excerpt?.trim() || post.title;

  return {
    title,
    description,
    ...buildListingMetadata({
      locale,
      title,
      description,
      // WhatsApp and Telegram show only the first og:image, and a raw upload
      // (up to 5 MB) often gets no thumbnail, so the optimizer's 1200 px copy
      // of the cover leads (C40); the original stays for Facebook's picker.
      images: [
        ...optimizedImageUrls(
          SITE_URL,
          sanitizePhotos([post.image_url]),
          1,
        ).map(sameOriginPath),
        post.image_url,
      ],
      path: `/blog/${post.slug}`,
      type: "article",
    }),
  };
}

export default async function BlogDetailPage({ params }: Props) {
  const { locale, id } = await params;
  const key = decodeKey(id);
  // Explicit locale: the bare string form reads headers(), which flips this ISR
  // page to dynamic (E132).
  const t = await getTranslations({ locale, namespace: "BlogPage" });
  const tFooter = await getTranslations({ locale, namespace: "Footer" });
  const tShare = await getTranslations({ locale, namespace: "ShareListing" });

  // Errors propagate (uncached 500) instead of becoming a cacheable 404.
  const post = await getPublishedPost(key);

  if (!post) {
    notFound();
  }

  // Every other spelling of the post's URL (its uuid, an old Georgian slug, a
  // link its token matched) 308s to the canonical one, in the same locale.
  if (post.slug !== key) {
    // A Location header must be ASCII: a slug from before the Latin ones is
    // Georgian script, so it is percent-encoded here (a raw one made Node
    // throw and the route answer 500).
    permanentRedirect(
      pathForLocale(
        `/blog/${encodeURIComponent(post.slug)}`,
        locale,
        routing.defaultLocale,
      ),
    );
  }

  const postUrl = new URL(
    pathForLocale(`/blog/${post.slug}`, locale, routing.defaultLocale),
    SITE_URL,
  ).href;

  return (
    <>
      <Breadcrumbs
        locale={locale}
        narrow
        items={[
          { name: tFooter("blog"), path: "/blog" },
          { name: post.title, path: `/blog/${post.slug}` },
        ]}
      />
      {/* Posts are written in Georgian whatever the page's UI locale is. */}
      <JsonLd
        data={blogPostingJsonLd({
          url: postUrl,
          headline: post.title,
          description: post.excerpt,
          images: optimizedImageUrls(
            SITE_URL,
            sanitizePhotos([post.image_url]),
          ),
          datePublished: post.published_at,
          // No byline on the page, so the post is credited to the site (C40).
          inLanguage: "ka",
          publisherName: SITE_NAME,
          publisherLogoUrl: `${SITE_URL}${SITE_LOGO_PATH}`,
        })}
      />
      <article className="mx-auto max-w-3xl px-4 pb-8 pt-4 sm:pb-12 sm:pt-6">
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
          <ShareMenu className={`ml-auto ${SHARE_PILL}`}>
            <Share2 className="h-4 w-4" />
            {tShare("label")}
          </ShareMenu>
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

        {/* No share buttons on the blog cards: each is one whole-card link. */}
        <div
          data-testid="blog-share-end"
          className="mt-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-[20px] border border-[#E2E8F0] bg-[#F8FAFC] p-5 print:hidden"
        >
          <p className="text-[15px] font-bold leading-[22px] text-[#1E293B]">
            {t("shareCta")}
          </p>
          <ShareMenu className={SHARE_PILL}>
            <Share2 className="h-4 w-4" />
            {tShare("label")}
          </ShareMenu>
        </div>

        <BannerSlot placement="blog_inline" bare className="mt-10" />
      </article>
    </>
  );
}
