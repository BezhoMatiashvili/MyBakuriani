import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils/format";

interface Props {
  params: Promise<{ id: string }>;
}

export const revalidate = 120;

const getBlogPostMetadata = cache(async (id: string) => {
  const supabase = createPublicClient();
  return supabase
    .from("blog_posts")
    .select("title, excerpt")
    .eq("id", id)
    .single();
});

const getBlogPostDetail = cache(async (id: string) => {
  const supabase = createPublicClient();
  return supabase
    .from("blog_posts")
    .select("*, profiles!blog_posts_author_id_fkey(display_name, avatar_url)")
    .eq("id", id)
    .eq("published", true)
    .single();
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const { data } = await getBlogPostMetadata(id);

  if (!data) {
    return { title: "სტატია ვერ მოიძებნა — MyBakuriani" };
  }

  return {
    title: `${data.title} — MyBakuriani ბლოგი`,
    description: data.excerpt ?? data.title,
  };
}

export default async function BlogDetailPage({ params }: Props) {
  const { id } = await params;

  try {
    const { data: post } = await getBlogPostDetail(id);

    if (!post) {
      notFound();
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
          ბლოგზე დაბრუნება
        </Link>

        {/* Title */}
        <h1 className="text-[28px] font-black leading-[34px] text-[#1E293B] sm:text-[34px] sm:leading-[42px]">
          {post.title}
        </h1>

        {/* Meta */}
        <div className="mt-4 flex items-center gap-3 text-sm text-[#64748B]">
          {post.published_at && <time>{formatDate(post.published_at)}</time>}
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
      </article>
    );
  } catch {
    notFound();
  }
}
