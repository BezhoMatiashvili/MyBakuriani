"use client";
import Image from "next/image";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import ScrollReveal from "@/components/shared/ScrollReveal";
import type { Tables } from "@/lib/types/database";

interface Props {
  posts?: Tables<"blog_posts">[];
}

export default function BlogPageClient({ posts: serverPosts }: Props) {
  const t = useTranslations("BlogPage");
  const locale = useLocale();
  const displayPosts =
    serverPosts && serverPosts.length > 0
      ? serverPosts.map((bp) => ({
          id: bp.id,
          title: bp.title,
          excerpt: bp.excerpt ?? "",
          image: bp.image_url ?? "/placeholder-property.jpg",
          date: (() => {
            const d = new Date(
              bp.published_at ?? bp.created_at ?? new Date().toISOString(),
            );
            const month = new Intl.DateTimeFormat(locale, {
              month: "long",
              timeZone: "UTC",
            }).format(d);
            return `${d.getUTCDate()} ${month}, ${d.getUTCFullYear()}`;
          })(),
          category: t("newsCategory"),
          categoryKey: "news",
        }))
      : [];

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="mx-auto max-w-7xl px-4 py-12">
        <ScrollReveal>
          <h1 className="text-[26px] font-black leading-[32px] text-[#1E293B]">
            {t("title")}
          </h1>
          <p className="mt-2 text-[13px] font-medium leading-[20px] text-[#64748B]">
            {t("subtitle")}
          </p>
        </ScrollReveal>
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {displayPosts.map((post, i) => (
            <ScrollReveal key={post.id} delay={i * 0.08}>
              <Link
                href={`/blog/${post.id}`}
                className="group block overflow-hidden rounded-[24px] border border-[#E2E8F0] bg-white shadow-[0px_4px_20px_-2px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-[var(--shadow-card-hover)]"
              >
                <div className="relative aspect-[8/5] overflow-hidden">
                  <Image
                    src={post.image}
                    alt={post.title}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <span
                    className={`absolute top-4 left-4 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[1px] text-white shadow-[0px_1px_2px_rgba(0,0,0,0.04)] backdrop-blur-[2px] ${post.categoryKey === "tips" ? "bg-blue-500" : post.categoryKey === "food" ? "bg-orange-500" : "bg-[#1E293B]/80"}`}
                  >
                    {post.category}
                  </span>
                </div>
                <div className="p-6">
                  <time className="text-[11px] font-medium leading-[16px] text-[#94A3B8]">
                    {post.date}
                  </time>
                  <h2 className="mt-2 text-[17px] font-black leading-[21px] text-[#1E293B] group-hover:text-brand-accent">
                    {post.title}
                  </h2>
                  <p className="mt-2 text-[13px] leading-[21px] text-[#64748B] line-clamp-2">
                    {post.excerpt}
                  </p>
                </div>
              </Link>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </div>
  );
}
